/**
 * SyncCore (Phase 7)
 *
 * Backend-agnostic sync orchestrator. This is the only owner of:
 * - Sync loops (pull/apply/push scheduling)
 * - Cursor persistence
 * - Pending-op persistence + retry/backoff
 *
 * Invariants:
 * - Transport isolation: the only place that knows about the transport is via the interface
 * - Single writer for sync metadata: only SyncCore updates pending_ops and cursors
 * - Profile-scoped: operates on exactly one profile at a time
 *
 * Usage:
 *   const core = new SyncCore({ repos, config });
 *   core.setTransport(transport);
 *   core.start();
 *   // ... when auth changes ...
 *   core.setTransport(newTransport); // or nullTransport when logged out
 *   core.stop();
 */

import type { CompositeCursor, IntentClock, UserSettings, InstalledSource } from "@/data/schema";
import type { SyncTransport, PaginatedResponse } from "../transport";
import type {
  SyncCoreConfig,
  SyncStatus,
  SyncRunReason,
  PendingOp,
  SyncMetricsListener,
  SyncCursors,
} from "./types";
import { DEFAULT_SYNC_CONFIG, CURSOR_KEYS } from "./types";
import {
  applyLibraryItems,
  applySourceLinks,
  applyChapterProgress,
  applyMangaProgress,
  type LibraryItemRepo,
  type SourceLinkRepo,
  type ChapterProgressRepo,
  type MangaProgressRepo,
  type SyncLibraryItemEntry,
  type SyncSourceLinkEntry,
  type SyncChapterProgressEntry,
  type SyncMangaProgressEntry,
} from "./apply";

// ============================================================================
// Repository interfaces
// ============================================================================

/**
 * Sync metadata repository (cursors)
 */
export interface SyncMetaRepo {
  getCompositeCursor(key: string): Promise<CompositeCursor>;
  setCompositeCursor(key: string, cursor: CompositeCursor): Promise<void>;
}

/**
 * Pending operations repository
 */
export interface PendingOpsRepo {
  addPendingOp(op: Omit<PendingOp, "id">): Promise<string>;
  getPendingOps(): Promise<PendingOp[]>;
  removePendingOp(id: string): Promise<void>;
  updatePendingOpRetries(id: string, retries: number): Promise<void>;
  getPendingCount(): Promise<number>;
}

/**
 * HLC state management
 */
export interface HLCManager {
  generateIntentClock(): Promise<IntentClock>;
  receiveIntentClock(clock: IntentClock): Promise<void>;
}

export interface SettingsRepo {
  getSettings(): Promise<UserSettings>;
  saveSettings(settings: UserSettings): Promise<void>;
}

/**
 * All repositories needed by SyncCore
 */
export interface SyncCoreRepos {
  libraryItems: LibraryItemRepo;
  sourceLinks: SourceLinkRepo;
  chapterProgress: ChapterProgressRepo;
  mangaProgress: MangaProgressRepo;
  syncMeta: SyncMetaRepo;
  pendingOps: PendingOpsRepo;
  hlc?: HLCManager;
  settings?: SettingsRepo;
}

// ============================================================================
// SyncCore
// ============================================================================

export interface SyncCoreOptions {
  repos: SyncCoreRepos;
  config?: Partial<SyncCoreConfig>;
}

/**
 * Applied event - emitted when remote data is applied to local canonical tables.
 * UI subscribes to trigger store refreshes.
 */
export interface AppliedEvent {
  table: "libraryItems" | "sourceLinks" | "chapterProgress" | "mangaProgress" | "history" | "settings";
  affectedCount: number;
}

export type AppliedListener = (event: AppliedEvent) => void;

export class SyncCore {
  private repos: SyncCoreRepos;
  private config: SyncCoreConfig;
  private transport: SyncTransport | null = null;
  private lastTransportReady = false;

  private _status: SyncStatus = "offline";
  private _pendingCount = 0;
  private statusListeners = new Set<(status: SyncStatus) => void>();
  private metricsListeners = new Set<SyncMetricsListener>();
  private appliedListeners = new Set<AppliedListener>();

  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private syncInProgress = false;
  private inFlightSync: Promise<void> | null = null;
  private online = navigator?.onLine ?? true;
  private started = false;

  constructor(options: SyncCoreOptions) {
    this.repos = options.repos;
    this.config = { ...DEFAULT_SYNC_CONFIG, ...options.config };
  }

  // ============================================================================
  // Public API
  // ============================================================================

  get status(): SyncStatus {
    return this._status;
  }

  get pendingCount(): number {
    return this._pendingCount;
  }

  /**
   * Set the transport (can be called any time).
   * - Pass a real transport when authenticated
   * - Pass NullTransport (or null) when logged out
   */
  setTransport(transport: SyncTransport | null): void {
    const wasReady = this.lastTransportReady;
    this.transport = transport;
    this.updateStatus();

    // If we transition from "not ready" -> "ready" while started+online,
    // kick an immediate sync. This fixes a real app flow:
    // sign-out can temporarily wire NullTransport, and later sign-in wires a ready transport.
    // Without this, SyncCore would wait for the interval (or a local write) to sync, making
    // the library look "gone" after re-login.
    const isReady = this.lastTransportReady;
    if (this.started && this.online && !wasReady && isReady) {
      void this.syncNow("startup");
    }
  }

  /**
   * Start the sync core.
   * - Initializes pending count
   * - Sets up online/offline listeners
   * - Starts periodic sync interval
   */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    // Initialize pending count
    await this.updatePendingCount();

    // Listen for online/offline
    if (typeof window !== "undefined") {
      window.addEventListener("online", this.handleOnline);
      window.addEventListener("offline", this.handleOffline);
    }

    // Start periodic sync
    this.syncInterval = setInterval(() => {
      this.syncNow("interval");
    }, this.config.pullIntervalMs);

    this.updateStatus();

    // Initial sync if we have a transport
    if (this.transport?.isReady() && this.online) {
      this.syncNow("startup");
    }
  }

  /**
   * Stop the sync core.
   * - Removes listeners
   * - Clears interval
   * - Does NOT clear pending ops or cursors
   */
  stop(): void {
    if (!this.started) return;
    this.started = false;

    if (typeof window !== "undefined") {
      window.removeEventListener("online", this.handleOnline);
      window.removeEventListener("offline", this.handleOffline);
    }

    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }

    this.statusListeners.clear();
    this.metricsListeners.clear();
  }

  /**
   * Trigger a sync run.
   */
  async syncNow(reason: SyncRunReason = "manual"): Promise<void> {
    if (!this.canSync()) return;
    if (this.syncInProgress) {
      // Coalesce callers onto the currently running sync instead of dropping the request.
      await this.inFlightSync;
      return;
    }

    this.syncInProgress = true;
    const previousStatus = this._status;
    this.setStatus("syncing");

    this.inFlightSync = (async () => {
      try {
        // Pull phase: remote → local
        await this.runPullPhase();

        // Push phase: local → remote
        await this.runPushPhase();
      } catch (error) {
        console.error(`[SyncCore] Sync failed (reason: ${reason}):`, error);
      } finally {
        this.syncInProgress = false;
        await this.updatePendingCount();
        this.inFlightSync = null;

        // Emit status change if it changed
        if (this._status !== previousStatus) {
          this.emitMetric("statusChanged", { from: previousStatus, to: this._status });
        }
      }
    })();

    await this.inFlightSync;
  }

  /**
   * Enqueue a local write for later push.
   */
  async enqueue(op: Omit<PendingOp, "id">): Promise<void> {
    await this.repos.pendingOps.addPendingOp(op);
    this._pendingCount++;
    this.updateStatus();

    // Try to sync immediately if we can
    if (this.canSync() && this.online) {
      this.syncNow("write");
    }
  }

  /**
   * Subscribe to status changes.
   */
  onStatusChange(cb: (status: SyncStatus) => void): () => void {
    this.statusListeners.add(cb);
    return () => this.statusListeners.delete(cb);
  }

  /**
   * Subscribe to metrics events.
   */
  onMetrics(cb: SyncMetricsListener): () => void {
    this.metricsListeners.add(cb);
    return () => this.metricsListeners.delete(cb);
  }

  /**
   * Subscribe to applied events (when remote data applied to local tables).
   * UI uses this to trigger store refreshes.
   */
  onApplied(cb: AppliedListener): () => void {
    this.appliedListeners.add(cb);
    return () => this.appliedListeners.delete(cb);
  }

  private emitApplied(event: AppliedEvent): void {
    this.appliedListeners.forEach((cb) => cb(event));
  }

  /**
   * Get current cursors (for provider to pass to transport hooks).
   */
  async getCursors(): Promise<SyncCursors> {
    const [libraryItems, sourceLinks, chapterProgress, mangaProgress, history] = await Promise.all([
      this.repos.syncMeta.getCompositeCursor(CURSOR_KEYS.LIBRARY_ITEMS),
      this.repos.syncMeta.getCompositeCursor(CURSOR_KEYS.SOURCE_LINKS),
      this.repos.syncMeta.getCompositeCursor(CURSOR_KEYS.CHAPTER_PROGRESS),
      this.repos.syncMeta.getCompositeCursor(CURSOR_KEYS.MANGA_PROGRESS),
      this.repos.syncMeta.getCompositeCursor(CURSOR_KEYS.HISTORY),
    ]);

    return {
      libraryItems,
      sourceLinks,
      chapterProgress,
      mangaProgress,
      history,
    };
  }

  /**
   * Debug snapshot for UI diagnostics.
   */
  async debugSnapshot(): Promise<{
    now: number;
    started: boolean;
    online: boolean;
    status: SyncStatus;
    transportReady: boolean;
    pendingCount: number;
    pendingOps: PendingOp[];
    cursors: SyncCursors;
  }> {
    const [pendingOps, cursors] = await Promise.all([
      this.repos.pendingOps.getPendingOps(),
      this.getCursors(),
    ]);
    return {
      now: Date.now(),
      started: this.started,
      online: this.online,
      status: this._status,
      transportReady: !!this.transport && this.transport.isReady(),
      pendingCount: this._pendingCount,
      pendingOps,
      cursors,
    };
  }

  /**
   * Apply a remote delta received from transport subscription.
   * This is THE ONLY place that applies remote data + updates cursors.
   * 
   * Note: In Option A architecture, this is not used by the provider.
   * SyncCore does all pulls via runPullPhase(). Kept for flexibility/testing.
   */
  async applyRemoteDelta(
    table: "libraryItems" | "sourceLinks" | "chapterProgress" | "mangaProgress" | "history",
    delta: { entries: unknown[]; nextCursor?: CompositeCursor }
  ): Promise<{ nextCursor: CompositeCursor }> {
    if (delta.entries.length === 0) {
      const currentCursor = await this.repos.syncMeta.getCompositeCursor(
        this.getCursorKey(table)
      );
      return { nextCursor: delta.nextCursor ?? currentCursor };
    }

    const currentCursor = await this.repos.syncMeta.getCompositeCursor(
      this.getCursorKey(table)
    );

    let result: { nextCursor: CompositeCursor };

    switch (table) {
      case "libraryItems": {
        const applyResult = await applyLibraryItems(
          delta.entries as SyncLibraryItemEntry[],
          currentCursor,
          this.repos.libraryItems,
          this.repos.hlc?.receiveIntentClock.bind(this.repos.hlc)
        );
        result = { nextCursor: applyResult.nextCursor };
        break;
      }

      case "sourceLinks": {
        const applyResult = await applySourceLinks(
          delta.entries as SyncSourceLinkEntry[],
          currentCursor,
          this.repos.sourceLinks
        );
        result = { nextCursor: applyResult.nextCursor };
        break;
      }

      case "chapterProgress": {
        const applyResult = await applyChapterProgress(
          delta.entries as SyncChapterProgressEntry[],
          currentCursor,
          this.repos.chapterProgress
        );
        result = { nextCursor: applyResult.nextCursor };
        break;
      }

      case "mangaProgress": {
        const applyResult = await applyMangaProgress(
          delta.entries as SyncMangaProgressEntry[],
          currentCursor,
          this.repos.mangaProgress
        );
        result = { nextCursor: applyResult.nextCursor };
        break;
      }

      case "history": {
        // Legacy history table - use chapter progress apply logic
        const applyResult = await applyChapterProgress(
          delta.entries as SyncChapterProgressEntry[],
          currentCursor,
          this.repos.chapterProgress
        );
        result = { nextCursor: applyResult.nextCursor };
        break;
      }
    }

    // Persist cursor
    await this.repos.syncMeta.setCompositeCursor(this.getCursorKey(table), result.nextCursor);

    // Emit applied event
    this.emitApplied({ table, affectedCount: delta.entries.length });

    return result;
  }

  private getCursorKey(
    table: "libraryItems" | "sourceLinks" | "chapterProgress" | "mangaProgress" | "history"
  ): string {
    switch (table) {
      case "libraryItems":
        return CURSOR_KEYS.LIBRARY_ITEMS;
      case "sourceLinks":
        return CURSOR_KEYS.SOURCE_LINKS;
      case "chapterProgress":
        return CURSOR_KEYS.CHAPTER_PROGRESS;
      case "mangaProgress":
        return CURSOR_KEYS.MANGA_PROGRESS;
      case "history":
        return CURSOR_KEYS.HISTORY;
    }
  }

  // ============================================================================
  // Pull phase (remote → local)
  // ============================================================================

  private async runPullPhase(): Promise<void> {
    if (!this.transport?.isReady()) return;
    if (!this.started) return;

    // Pull in fixed order to maintain consistency
    // libraryItems → sourceLinks → chapterProgress → mangaProgress
    await this.pullTable(
      "libraryItems",
      CURSOR_KEYS.LIBRARY_ITEMS,
      (cursor, limit) => this.transport!.pullLibraryItems(cursor, limit),
      async (entries, cursor) => {
        const result = await applyLibraryItems(
          entries as SyncLibraryItemEntry[],
          cursor,
          this.repos.libraryItems,
          this.repos.hlc?.receiveIntentClock.bind(this.repos.hlc)
        );
        await this.repos.syncMeta.setCompositeCursor(CURSOR_KEYS.LIBRARY_ITEMS, result.nextCursor);
        return result;
      }
    );
    if (!this.started) return;

    await this.pullTable(
      "sourceLinks",
      CURSOR_KEYS.SOURCE_LINKS,
      (cursor, limit) => this.transport!.pullSourceLinks(cursor, limit),
      async (entries, cursor) => {
        const result = await applySourceLinks(
          entries as SyncSourceLinkEntry[],
          cursor,
          this.repos.sourceLinks
        );
        await this.repos.syncMeta.setCompositeCursor(CURSOR_KEYS.SOURCE_LINKS, result.nextCursor);
        return result;
      }
    );
    if (!this.started) return;

    await this.pullTable(
      "chapterProgress",
      CURSOR_KEYS.CHAPTER_PROGRESS,
      (cursor, limit) => this.transport!.pullChapterProgress(cursor, limit),
      async (entries, cursor) => {
        const result = await applyChapterProgress(
          entries as SyncChapterProgressEntry[],
          cursor,
          this.repos.chapterProgress
        );
        await this.repos.syncMeta.setCompositeCursor(
          CURSOR_KEYS.CHAPTER_PROGRESS,
          result.nextCursor
        );
        return result;
      }
    );
    if (!this.started) return;

    await this.pullTable(
      "mangaProgress",
      CURSOR_KEYS.MANGA_PROGRESS,
      (cursor, limit) => this.transport!.pullMangaProgress(cursor, limit),
      async (entries, cursor) => {
        const result = await applyMangaProgress(
          entries as SyncMangaProgressEntry[],
          cursor,
          this.repos.mangaProgress
        );
        await this.repos.syncMeta.setCompositeCursor(CURSOR_KEYS.MANGA_PROGRESS, result.nextCursor);
        return result;
      }
    );

    // Settings are small; pull as full snapshot (no cursor) and merge into local.
    if (this.repos.settings) {
      try {
        const remote = await this.transport.pullSettings();
        const local = await this.repos.settings.getSettings();

        // Merge by union; for same id choose higher version (stable, deterministic).
        const byId = new Map<string, InstalledSource>(local.installedSources.map((s) => [s.id, s]));
        for (const s of remote.installedSources) {
          const existing = byId.get(s.id);
          if (!existing || (s.version ?? 0) > (existing.version ?? 0)) {
            byId.set(s.id, s);
          }
        }
        const merged: UserSettings = {
          installedSources: [...byId.values()].sort((a, b) => a.id.localeCompare(b.id)),
        };

        const normalize = (s: UserSettings) =>
          [...s.installedSources]
            .sort((a, b) => a.id.localeCompare(b.id))
            .map((x) => ({ id: x.id, registryId: x.registryId, version: x.version }));

        const same = JSON.stringify(normalize(merged)) === JSON.stringify(normalize(local));

        if (!same) {
          await this.repos.settings.saveSettings(merged);
          this.emitApplied({ table: "settings", affectedCount: merged.installedSources.length });

          // Always ensure there's exactly one pending settings op that represents the merged state.
          // If we already have a pending settings op (local user changes), replace it with the merged state
          // so we don't accidentally push a stale snapshot and drop remote additions.
          const pending = await this.repos.pendingOps.getPendingOps();
          const pendingSettings = pending.filter((op) => op.table === "settings");
          if (pendingSettings.length > 0) {
            await Promise.all(pendingSettings.map((op) => this.repos.pendingOps.removePendingOp(op.id)));
          }

          await this.enqueue({
            table: "settings",
            operation: "save",
            data: merged,
            timestamp: Date.now(),
            retries: 0,
          });
        }
      } catch (e) {
        console.error("[SyncCore] Settings pull failed:", e);
      }
    }
  }

  private async pullTable<T>(
    tableName: "libraryItems" | "sourceLinks" | "chapterProgress" | "mangaProgress" | "history",
    cursorKey: string,
    pullFn: (cursor: CompositeCursor, limit: number) => Promise<PaginatedResponse<T>>,
    applyFn: (entries: T[], cursor: CompositeCursor) => Promise<{ nextCursor: CompositeCursor }>
  ): Promise<void> {
    let cursor = await this.repos.syncMeta.getCompositeCursor(cursorKey);
    let pagesProcessed = 0;
    let totalApplied = 0;

    while (pagesProcessed < this.config.maxPagesPerTick) {
      if (!this.started) break;
      const startTime = Date.now();

      try {
        const response = await pullFn(cursor, this.config.pageLimit);
        if (!this.started) break;

        if (response.entries.length > 0) {
          if (!this.started) break;
          const result = await applyFn(response.entries, cursor);
          cursor = result.nextCursor;
          totalApplied += response.entries.length;
        }

        this.emitMetric("pullCompleted", {
          table: tableName,
          entriesCount: response.entries.length,
          durationMs: Date.now() - startTime,
        });

        if (!response.hasMore) {
          break;
        }

        if (response.nextCursor) {
          cursor = response.nextCursor;
        }

        pagesProcessed++;
      } catch (error) {
        console.error(`[SyncCore] Pull failed for ${tableName}:`, error);
        break;
      }
    }

    // Emit applied event if we applied any entries
    console.log(`[SyncCore] pullTable(${tableName}) done. totalApplied:`, totalApplied);
    if (totalApplied > 0) {
      console.log(`[SyncCore] EMITTING onApplied for ${tableName}`);
      this.emitApplied({ table: tableName, affectedCount: totalApplied });
    }
  }

  // ============================================================================
  // Push phase (local → remote)
  // ============================================================================

  private async runPushPhase(): Promise<void> {
    if (!this.transport?.isReady()) return;
    if (!this.started) return;

    const pending = await this.repos.pendingOps.getPendingOps();

    for (const op of pending) {
      if (!this.started) break;
      // Skip if too many retries
      if (op.retries >= this.config.retryPolicy.maxRetries) {
        console.warn(`[SyncCore] Dropping op ${op.id} after ${op.retries} retries`);
        await this.repos.pendingOps.removePendingOp(op.id);
        continue;
      }

      const startTime = Date.now();

      try {
        await this.pushOp(op);
        await this.repos.pendingOps.removePendingOp(op.id);

        this.emitMetric("pushCompleted", {
          opId: op.id,
          table: op.table,
          durationMs: Date.now() - startTime,
        });
      } catch (error) {
        const retriesLeft = this.config.retryPolicy.maxRetries - op.retries - 1;
        console.error(`[SyncCore] Push failed for ${op.id}:`, error);

        this.emitMetric("pushFailed", {
          opId: op.id,
          table: op.table,
          error: error instanceof Error ? error : new Error(String(error)),
          retriesLeft,
        });

        await this.repos.pendingOps.updatePendingOpRetries(op.id, op.retries + 1);
      }
    }
  }

  private async pushOp(op: PendingOp): Promise<void> {
    if (!this.transport) throw new Error("No transport");

    switch (op.table) {
      case "library_items": {
        if (op.operation === "save") {
          await this.transport.pushLibraryItem(op.data as Parameters<SyncTransport["pushLibraryItem"]>[0]);
        } else if (op.operation === "remove") {
          const { libraryItemId, inLibraryClock } = op.data as { libraryItemId: string; inLibraryClock: string };
          await this.transport.deleteLibraryItem(libraryItemId, inLibraryClock);
        }
        break;
      }

      case "source_links": {
        if (op.operation === "save") {
          await this.transport.pushSourceLink(op.data as Parameters<SyncTransport["pushSourceLink"]>[0]);
        } else if (op.operation === "remove") {
          const { libraryItemId, registryId, sourceId, sourceMangaId } = op.data as {
            libraryItemId: string;
            registryId: string;
            sourceId: string;
            sourceMangaId: string;
          };
          await this.transport.deleteSourceLink(libraryItemId, registryId, sourceId, sourceMangaId);
        }
        break;
      }

      case "chapter_progress": {
        if (op.operation === "save") {
          await this.transport.pushChapterProgress(
            op.data as Parameters<SyncTransport["pushChapterProgress"]>[0]
          );
        }
        break;
      }

      // Legacy tables - route to appropriate transport methods
      case "history": {
        if (op.operation === "save") {
          const entry = op.data as {
            registryId: string;
            sourceId: string;
            mangaId: string;
            chapterId: string;
            progress: number;
            total: number;
            completed: boolean;
            dateRead: number;
            chapterNumber?: number;
            volumeNumber?: number;
            chapterTitle?: string;
          };
          await this.transport.pushChapterProgress({
            registryId: entry.registryId,
            sourceId: entry.sourceId,
            sourceMangaId: entry.mangaId,
            sourceChapterId: entry.chapterId,
            progress: entry.progress,
            total: entry.total,
            completed: entry.completed,
            lastReadAt: entry.dateRead,
            chapterNumber: entry.chapterNumber,
            volumeNumber: entry.volumeNumber,
            chapterTitle: entry.chapterTitle,
          });
        }
        break;
      }

      case "settings": {
        if (op.operation === "save") {
          await this.transport.pushSettings(op.data as UserSettings);
        }
        break;
      }

      default:
        console.warn(`[SyncCore] Unknown table: ${op.table}`);
    }
  }

  // ============================================================================
  // Internal helpers
  // ============================================================================

  private canSync(): boolean {
    return this.started && this.transport !== null && this.transport.isReady() && this.online;
  }

  private setStatus(status: SyncStatus): void {
    if (this._status === status) return;
    const from = this._status;
    this._status = status;
    this.statusListeners.forEach((cb) => cb(status));
    this.emitMetric("statusChanged", { from, to: status });
  }

  private updateStatus(): void {
    const ready = !!this.transport && this.transport.isReady();
    this.lastTransportReady = ready;

    if (!ready) {
      this.setStatus("offline");
    } else if (!this.online) {
      this.setStatus("offline");
    } else if (this._pendingCount > 0) {
      this.setStatus("pending");
    } else {
      this.setStatus("synced");
    }
  }

  private async updatePendingCount(): Promise<void> {
    this._pendingCount = await this.repos.pendingOps.getPendingCount();
    this.updateStatus();
  }

  private handleOnline = (): void => {
    this.online = true;
    this.updateStatus();
    this.syncNow("online");
  };

  private handleOffline = (): void => {
    this.online = false;
    this.updateStatus();
  };

  private emitMetric<K extends keyof import("./types").SyncMetrics>(
    event: K,
    data: import("./types").SyncMetrics[K]
  ): void {
    this.metricsListeners.forEach((cb) => cb(event, data));
  }
}

