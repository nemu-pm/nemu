import type { ConvexReactClient } from "convex/react";
import type { LibraryManga, HistoryEntry, UserSettings } from "@/data/schema";
import { IndexedDBUserDataStore, makeHistoryKey } from "@/data/indexeddb";
import { api } from "../../convex/_generated/api";

export type SyncStatus = "offline" | "syncing" | "synced" | "pending";

export interface PendingChange {
  id: string;
  table: "library" | "history" | "settings";
  operation: "save" | "remove";
  data: unknown;
  timestamp: number;
  retries: number;
}

const PENDING_STORE = "sync_pending";
const SYNC_META_STORE = "sync_meta";
const DB_NAME = "nemu-sync";
const DB_VERSION = 1;

/**
 * SyncEngine orchestrates local ↔ cloud synchronization
 * - Writes go to local first, then queued for cloud
 * - Cloud changes merge into local using auto-merge rules
 * - Works offline, syncs when online
 */
export class SyncEngine {
  private localStore: IndexedDBUserDataStore;
  private convex: ConvexReactClient | null = null;
  private dbPromise: Promise<IDBDatabase> | null = null;
  private statusListeners = new Set<(status: SyncStatus) => void>();
  private _status: SyncStatus = "offline";
  private _pendingCount = 0;
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private online = navigator.onLine;

  constructor(localStore: IndexedDBUserDataStore) {
    this.localStore = localStore;
  }

  get status(): SyncStatus {
    return this._status;
  }

  get pendingCount(): number {
    return this._pendingCount;
  }

  private setStatus(status: SyncStatus) {
    this._status = status;
    this.statusListeners.forEach((cb) => cb(status));
  }

  onStatusChange(cb: (status: SyncStatus) => void): () => void {
    this.statusListeners.add(cb);
    return () => this.statusListeners.delete(cb);
  }

  private getDB(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains(PENDING_STORE)) {
            db.createObjectStore(PENDING_STORE, { keyPath: "id" });
          }
          if (!db.objectStoreNames.contains(SYNC_META_STORE)) {
            db.createObjectStore(SYNC_META_STORE, { keyPath: "key" });
          }
        };
      });
    }
    return this.dbPromise;
  }

  async initialize(convex?: ConvexReactClient): Promise<void> {
    this.convex = convex ?? null;

    // Initialize pending queue DB
    await this.getDB();
    await this.updatePendingCount();

    // Listen for online/offline
    window.addEventListener("online", this.handleOnline);
    window.addEventListener("offline", this.handleOffline);

    this.online = navigator.onLine;
    this.updateStatus();

    // Start periodic sync
    this.syncInterval = setInterval(() => this.syncNow(), 30000);
  }

  dispose(): void {
    window.removeEventListener("online", this.handleOnline);
    window.removeEventListener("offline", this.handleOffline);
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    this.statusListeners.clear();
  }

  private handleOnline = () => {
    this.online = true;
    this.updateStatus();
    this.syncNow();
  };

  private handleOffline = () => {
    this.online = false;
    this.updateStatus();
  };

  private updateStatus() {
    if (!this.online) {
      this.setStatus("offline");
    } else if (this._pendingCount > 0) {
      this.setStatus("pending");
    } else {
      this.setStatus("synced");
    }
  }

  private async updatePendingCount(): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(PENDING_STORE, "readonly");
      const store = tx.objectStore(PENDING_STORE);
      const request = store.count();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this._pendingCount = request.result;
        this.updateStatus();
        resolve();
      };
    });
  }

  private async addPendingChange(change: Omit<PendingChange, "id">): Promise<void> {
    const db = await this.getDB();
    const pending: PendingChange = {
      ...change,
      id: `${change.table}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction(PENDING_STORE, "readwrite");
      const store = tx.objectStore(PENDING_STORE);
      const request = store.put(pending);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this._pendingCount++;
        this.updateStatus();
        resolve();
      };
    });
  }

  private async getPendingChanges(): Promise<PendingChange[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(PENDING_STORE, "readonly");
      const store = tx.objectStore(PENDING_STORE);
      const request = store.getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  private async removePendingChange(id: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(PENDING_STORE, "readwrite");
      const store = tx.objectStore(PENDING_STORE);
      const request = store.delete(id);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this._pendingCount = Math.max(0, this._pendingCount - 1);
        this.updateStatus();
        resolve();
      };
    });
  }

  private async updatePendingRetry(id: string, retries: number): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(PENDING_STORE, "readwrite");
      const store = tx.objectStore(PENDING_STORE);
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        if (getReq.result) {
          const updated = { ...getReq.result, retries };
          const putReq = store.put(updated);
          putReq.onerror = () => reject(putReq.error);
          putReq.onsuccess = () => resolve();
        } else {
          resolve();
        }
      };
      getReq.onerror = () => reject(getReq.error);
    });
  }

  // ============ WRITE-THROUGH OPERATIONS ============

  /**
   * Save manga to library (local first, then queue for cloud)
   */
  async saveLibraryManga(manga: LibraryManga): Promise<void> {
    // 1. Write to local immediately
    await this.localStore.saveLibraryManga(manga);

    // 2. Queue for cloud sync if authenticated
    if (this.convex) {
      await this.addPendingChange({
        table: "library",
        operation: "save",
        data: manga,
        timestamp: Date.now(),
        retries: 0,
      });

      // Try to sync immediately if online
      if (this.online) {
        this.syncNow();
      }
    }
  }

  /**
   * Remove manga from library (local first, then queue for cloud)
   */
  async removeLibraryManga(id: string): Promise<void> {
    // 1. Remove from local
    await this.localStore.removeLibraryManga(id);

    // 2. Queue for cloud sync
    if (this.convex) {
      await this.addPendingChange({
        table: "library",
        operation: "remove",
        data: { mangaId: id },
        timestamp: Date.now(),
        retries: 0,
      });

      if (this.online) {
        this.syncNow();
      }
    }
  }

  /**
   * Save history entry (local first, then queue for cloud)
   */
  async saveHistoryEntry(entry: HistoryEntry): Promise<void> {
    // 1. Write to local
    await this.localStore.saveHistoryEntry(entry);

    // 2. Queue for cloud sync
    if (this.convex) {
      await this.addPendingChange({
        table: "history",
        operation: "save",
        data: entry,
        timestamp: Date.now(),
        retries: 0,
      });

      if (this.online) {
        this.syncNow();
      }
    }
  }

  /**
   * Save settings (local first, then queue for cloud)
   */
  async saveSettings(settings: UserSettings): Promise<void> {
    await this.localStore.saveSettings(settings);

    if (this.convex) {
      await this.addPendingChange({
        table: "settings",
        operation: "save",
        data: settings,
        timestamp: Date.now(),
        retries: 0,
      });

      if (this.online) {
        this.syncNow();
      }
    }
  }

  /**
   * Remove installed source (local first, then sync settings to cloud)
   */
  async removeInstalledSource(sourceId: string): Promise<void> {
    await this.localStore.removeInstalledSource(sourceId);

    // Sync the updated settings (full replace)
    if (this.convex) {
      const settings = await this.localStore.getSettings();
      await this.addPendingChange({
        table: "settings",
        operation: "save",
        data: settings,
        timestamp: Date.now(),
        retries: 0,
      });

      if (this.online) {
        this.syncNow();
      }
    }
  }

  // ============ SYNC OPERATIONS ============

  /**
   * Process pending changes queue
   */
  async syncNow(): Promise<void> {
    if (!this.convex || !this.online) return;
    if (this._status === "syncing") return;

    this.setStatus("syncing");

    try {
      const pending = await this.getPendingChanges();

      for (const change of pending) {
        // Skip if too many retries
        if (change.retries >= 5) {
          await this.removePendingChange(change.id);
          continue;
        }

        try {
          await this.processPendingChange(change);
          await this.removePendingChange(change.id);
        } catch (error) {
          console.error("[SyncEngine] Failed to sync change:", change, error);
          await this.updatePendingRetry(change.id, change.retries + 1);
        }
      }
    } catch (error) {
      console.error("[SyncEngine] Sync failed:", error);
    }

    await this.updatePendingCount();
  }

  private async processPendingChange(change: PendingChange): Promise<void> {
    if (!this.convex) return;

    switch (change.table) {
      case "library": {
        if (change.operation === "save") {
          const manga = change.data as LibraryManga;
          await this.convex.mutation(api.library.save, {
            mangaId: manga.id,
            title: manga.title,
            cover: manga.cover,
            addedAt: manga.addedAt,
            sources: manga.sources,
            activeRegistryId: manga.activeRegistryId,
            activeSourceId: manga.activeSourceId,
            lastReadChapter: manga.lastReadChapter,
            lastReadAt: manga.lastReadAt,
            latestChapter: manga.latestChapter,
            seenLatestChapter: manga.seenLatestChapter,
          });
        } else if (change.operation === "remove") {
          const data = change.data as { mangaId: string };
          await this.convex.mutation(api.library.remove, data);
        }
        break;
      }
      case "history": {
        if (change.operation === "save") {
          const entry = change.data as HistoryEntry;
          await this.convex.mutation(api.history.save, {
            registryId: entry.registryId,
            sourceId: entry.sourceId,
            mangaId: entry.mangaId,
            chapterId: entry.chapterId,
            progress: entry.progress,
            total: entry.total,
            completed: entry.completed,
            dateRead: entry.dateRead,
          });
        }
        break;
      }
      case "settings": {
        const settings = change.data as UserSettings;
        await this.convex.mutation(api.settings.save, settings);
        break;
      }
    }
  }

  // ============ AUTH LIFECYCLE ============

  /**
   * Called when user signs in - merge local with cloud
   */
  async onSignIn(): Promise<void> {
    if (!this.convex) return;

    try {
      this.setStatus("syncing");

      // 1. Fetch all cloud data
      const [cloudLibrary, cloudSettings] = await Promise.all([
        this.convex.query(api.library.list, {}),
        this.convex.query(api.settings.get, {}),
      ]);

      // 2. Get local data
      const [localLibrary, localSettings] = await Promise.all([
        this.localStore.getLibrary(),
        this.localStore.getSettings(),
      ]);

      // 3. Merge cloud library into local
      const cloudMangaIds = new Set(cloudLibrary.map((m) => m.mangaId));

      // Add cloud-only manga to local
      for (const cloudManga of cloudLibrary) {
        const localManga = localLibrary.find((m) => m.id === cloudManga.mangaId);

        if (!localManga) {
          // Cloud-only: add to local
          await this.localStore.saveLibraryManga({
            id: cloudManga.mangaId,
            title: cloudManga.title,
            cover: cloudManga.cover,
            addedAt: cloudManga.addedAt,
            sources: cloudManga.sources,
            activeRegistryId: cloudManga.activeRegistryId,
            activeSourceId: cloudManga.activeSourceId,
          });
        } else {
          // Both exist: update metadata
          await this.localStore.saveLibraryManga({
            ...localManga,
            title: cloudManga.title,
            cover: cloudManga.cover,
          });
        }

        // Fetch and merge history for this manga
        const cloudHistory = await this.convex.query(api.history.getMangaHistory, {
          registryId: cloudManga.activeRegistryId,
          sourceId: cloudManga.activeSourceId,
          mangaId: cloudManga.sources[0]?.mangaId ?? "",
        });

        for (const cloudEntry of cloudHistory) {
          const localEntry = await this.localStore.getHistoryEntry(
            cloudEntry.registryId,
            cloudEntry.sourceId,
            cloudEntry.mangaId,
            cloudEntry.chapterId
          );

          if (!localEntry) {
            // Cloud-only: add to local
            await this.localStore.saveHistoryEntry({
              id: makeHistoryKey(
                cloudEntry.registryId,
                cloudEntry.sourceId,
                cloudEntry.mangaId,
                cloudEntry.chapterId
              ),
              registryId: cloudEntry.registryId,
              sourceId: cloudEntry.sourceId,
              mangaId: cloudEntry.mangaId,
              chapterId: cloudEntry.chapterId,
              progress: cloudEntry.progress,
              total: cloudEntry.total,
              completed: cloudEntry.completed,
              dateRead: cloudEntry.dateRead,
            });
          } else {
            // Merge: use most recent (by dateRead), not highest progress
            const useCloud = cloudEntry.dateRead > localEntry.dateRead;
            const merged: HistoryEntry = {
              ...localEntry,
              progress: useCloud ? cloudEntry.progress : localEntry.progress,
              total: Math.max(localEntry.total, cloudEntry.total),
              completed: localEntry.completed || cloudEntry.completed,
              dateRead: Math.max(localEntry.dateRead, cloudEntry.dateRead),
            };
            await this.localStore.saveHistoryEntry(merged);
          }
        }
      }

      // 4. Push local-only manga to cloud
      for (const localManga of localLibrary) {
        if (!cloudMangaIds.has(localManga.id)) {
          await this.addPendingChange({
            table: "library",
            operation: "save",
            data: localManga,
            timestamp: Date.now(),
            retries: 0,
          });

          // Also push history for this manga
          const activeSource = localManga.sources[0];
          if (activeSource) {
            const localHistory = await this.localStore.getMangaHistory(
              activeSource.registryId,
              activeSource.sourceId,
              activeSource.mangaId
            );
            for (const entry of Object.values(localHistory)) {
              await this.addPendingChange({
                table: "history",
                operation: "save",
                data: entry,
                timestamp: Date.now(),
                retries: 0,
              });
            }
          }
        }
      }

      // 5. Merge settings
      const mergedSourceIds = new Set([
        ...localSettings.installedSources.map((s) => s.id),
        ...cloudSettings.installedSources.map((s) => s.id),
      ]);

      const mergedSources = [...mergedSourceIds].map((id) => {
        const local = localSettings.installedSources.find((s) => s.id === id);
        const cloud = cloudSettings.installedSources.find((s) => s.id === id);
        if (local && cloud) {
          return local.version > cloud.version ? local : cloud;
        }
        return local ?? cloud!;
      });

      await this.localStore.saveSettings({
        installedSources: mergedSources,
      });

      // If local had different sources, push to cloud
      if (mergedSources.length > cloudSettings.installedSources.length) {
        await this.addPendingChange({
          table: "settings",
          operation: "save",
          data: {
            installedSources: mergedSources,
          },
          timestamp: Date.now(),
          retries: 0,
        });
      }

      // 6. Process pending queue
      await this.syncNow();
    } catch (error) {
      console.error("[SyncEngine] Sign-in merge failed:", error);
    }

    await this.updatePendingCount();
  }

  /**
   * Called when user signs out
   */
  async onSignOut(clearLocal: boolean): Promise<void> {
    // Clear pending queue (no longer authenticated)
    const db = await this.getDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(PENDING_STORE, "readwrite");
      const store = tx.objectStore(PENDING_STORE);
      const request = store.clear();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });

    this._pendingCount = 0;
    this.convex = null;

    if (clearLocal) {
      // Clear local data
      const library = await this.localStore.getLibrary();
      for (const manga of library) {
        await this.localStore.removeLibraryManga(manga.id);
      }
      await this.localStore.saveSettings({
        installedSources: [],
      });
    }

    this.updateStatus();
  }

  // ============ CLOUD → LOCAL MERGE ============

  /**
   * Merge cloud library data into local (called from subscription)
   */
  async mergeCloudLibrary(
    cloudLibrary: Array<{
      mangaId: string;
      title: string;
      cover?: string;
      addedAt: number;
      sources: Array<{ registryId: string; sourceId: string; mangaId: string }>;
      activeRegistryId: string;
      activeSourceId: string;
      // Reading progress
      lastReadChapter?: { id: string; title?: string; chapterNumber?: number; volumeNumber?: number };
      lastReadAt?: number;
      // Chapter availability
      latestChapter?: { id: string; title?: string; chapterNumber?: number; volumeNumber?: number };
      seenLatestChapter?: { id: string; title?: string; chapterNumber?: number; volumeNumber?: number };
    }>
  ): Promise<LibraryManga[]> {
    const localLibrary = await this.localStore.getLibrary();
    const localById = new Map(localLibrary.map((m) => [m.id, m]));
    const result: LibraryManga[] = [];

    for (const cloudManga of cloudLibrary) {
      const localManga = localById.get(cloudManga.mangaId);

      if (!localManga) {
        // Cloud-only: add to local
        const manga: LibraryManga = {
          id: cloudManga.mangaId,
          title: cloudManga.title,
          cover: cloudManga.cover,
          addedAt: cloudManga.addedAt,
          sources: cloudManga.sources,
          activeRegistryId: cloudManga.activeRegistryId,
          activeSourceId: cloudManga.activeSourceId,
          lastReadChapter: cloudManga.lastReadChapter,
          lastReadAt: cloudManga.lastReadAt,
          latestChapter: cloudManga.latestChapter,
          seenLatestChapter: cloudManga.seenLatestChapter,
        };
        await this.localStore.saveLibraryManga(manga);
        result.push(manga);
      } else {
        // Merge: keep the most recent lastReadAt
        const lastReadAt =
          cloudManga.lastReadAt && localManga.lastReadAt
            ? Math.max(cloudManga.lastReadAt, localManga.lastReadAt)
            : cloudManga.lastReadAt ?? localManga.lastReadAt;
        const lastReadChapter =
          lastReadAt === cloudManga.lastReadAt
            ? cloudManga.lastReadChapter ?? localManga.lastReadChapter
            : localManga.lastReadChapter ?? cloudManga.lastReadChapter;

        const manga: LibraryManga = {
          ...localManga,
          title: cloudManga.title,
          cover: cloudManga.cover,
          sources: cloudManga.sources,
          activeRegistryId: cloudManga.activeRegistryId,
          activeSourceId: cloudManga.activeSourceId,
          lastReadChapter,
          lastReadAt,
          latestChapter: cloudManga.latestChapter ?? localManga.latestChapter,
          seenLatestChapter: cloudManga.seenLatestChapter ?? localManga.seenLatestChapter,
        };

        await this.localStore.saveLibraryManga(manga);
        result.push(manga);
        localById.delete(cloudManga.mangaId);
      }
    }

    // Keep local-only manga
    for (const localManga of localById.values()) {
      result.push(localManga);
    }

    return result;
  }

  /**
   * Merge cloud history data into local (called from subscription)
   */
  async mergeCloudHistory(
    cloudHistory: Array<{
      registryId: string;
      sourceId: string;
      mangaId: string;
      chapterId: string;
      progress: number;
      total: number;
      completed: boolean;
      dateRead: number;
    }>
  ): Promise<void> {
    for (const cloudEntry of cloudHistory) {
      const localEntry = await this.localStore.getHistoryEntry(
        cloudEntry.registryId,
        cloudEntry.sourceId,
        cloudEntry.mangaId,
        cloudEntry.chapterId
      );

      if (!localEntry) {
        // Cloud-only: add to local
        await this.localStore.saveHistoryEntry({
          id: makeHistoryKey(
            cloudEntry.registryId,
            cloudEntry.sourceId,
            cloudEntry.mangaId,
            cloudEntry.chapterId
          ),
          registryId: cloudEntry.registryId,
          sourceId: cloudEntry.sourceId,
          mangaId: cloudEntry.mangaId,
          chapterId: cloudEntry.chapterId,
          progress: cloudEntry.progress,
          total: cloudEntry.total,
          completed: cloudEntry.completed,
          dateRead: cloudEntry.dateRead,
        });
      } else {
        // Merge: use most recent (by dateRead), not highest progress
        const useCloud = cloudEntry.dateRead > localEntry.dateRead;
        const merged: HistoryEntry = {
          ...localEntry,
          progress: useCloud ? cloudEntry.progress : localEntry.progress,
          total: Math.max(localEntry.total, cloudEntry.total),
          completed: localEntry.completed || cloudEntry.completed,
          dateRead: Math.max(localEntry.dateRead, cloudEntry.dateRead),
        };
        await this.localStore.saveHistoryEntry(merged);
      }
    }
  }
}
