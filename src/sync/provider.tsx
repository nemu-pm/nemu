/**
 * SyncProvider (Phase 7 - Option A)
 *
 * This provider is TRULY thin. It ONLY:
 * - Wires SyncCore to the appropriate transport based on auth
 * - Provides canonical library ops that delegate to SyncCore.enqueue()
 * - Updates UI state (auth, user info, sync status)
 * - Handles dialogs (IDB blocked, import)
 * - Subscribes to SyncCore.onApplied() to trigger store refreshes
 *
 * NO reactive subscription hooks from transport.
 * SyncCore does all pulls via one-shot methods on interval/manual triggers.
 */

import { useEffect, useState, useRef, useMemo, useCallback, type ReactNode } from "react";
import { useConvexAuth, useConvex } from "convex/react";
import type { ConvexReactClient } from "convex/react";
import { useTranslation } from "react-i18next";
import { IDB_UI_EVENT, IndexedDBUserDataStore } from "@/data/indexeddb";
import { IndexedDBCacheStore } from "@/data/cache";
import type { HistoryEntry, LocalLibraryItem, LocalSourceLink, LocalMangaProgress, LocalChapterProgress } from "@/data/schema";
import { makeSourceLinkCursorId } from "@/data/schema";
import { RegistryManager } from "@/lib/sources/registry";
import { createLibraryStore, type CanonicalLibraryOps, type SaveItemClocks } from "@/stores/library";
import { createHistoryStore, type HistoryStoreOps } from "@/stores/history";
import { createSettingsStore, type SettingsStoreOps } from "@/stores/settings";
import { getSourceSettingsStore } from "@/stores/source-settings";
import { getSyncStore } from "@/stores/sync";
import { authClient } from "@/lib/auth-client";
import { SyncContext } from "./context";
import type { DataServices, StoreHooks, SyncContextValue } from "./types";
import { SyncCore } from "./core/SyncCore";
import { createSyncCoreRepos } from "./core/adapters";
import { ConvexTransport } from "./convex-transport";
import { NullTransport } from "./transports/NullTransport";
import type { PushLibraryItem, PushLibrarySourceLink, PushChapterProgress } from "./transport";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";

// Re-export types and hooks
export type { DataServices, StoreHooks, MangaProgressIndex } from "./types";
// eslint-disable-next-line react-refresh/only-export-components
export { useDataServices, useStores, useAuth, useSyncContext, useSyncStatus, useSignOut, useSyncStore, useMangaProgressIndex, useChapterProgress, useChapterProgressLoader } from "./hooks";

type IdbBlockedEventDetail = {
  dbName: string;
  requestedVersion?: number;
  kind: "blocked" | "versionchange";
};

const IDB_UI_EVENT_BUFFER_KEY = "nemu:idb-ui-event";
const MOCK_BLOCK_STICKY_KEY = "nemu:idb-mock-blocked-sticky";
const LAST_PROFILE_KEY = "nemu:last-profile";
const IMPORT_OFFERED_SESSION_KEY = "nemu:import-offered-session";
const IMPORT_DECISION_KEY_PREFIX = "nemu:import-local-library:decision:"; // `${prefix}${userId}` -> "skipped" | "imported"

type ImportDecision = "skipped" | "imported";

function getImportDecision(userId: string): ImportDecision | null {
  try {
    const raw = localStorage.getItem(`${IMPORT_DECISION_KEY_PREFIX}${userId}`);
    return raw === "skipped" || raw === "imported" ? raw : null;
  } catch {
    return null;
  }
}

function setImportDecision(userId: string, decision: ImportDecision): void {
  try {
    localStorage.setItem(`${IMPORT_DECISION_KEY_PREFIX}${userId}`, decision);
  } catch {}
}

function makeProfileId(userId: string | null | undefined): string | undefined {
  return userId ? `user:${userId}` : undefined;
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const convex = useConvex();
  const syncStore = getSyncStore();
  const { data: session } = authClient.useSession();
  const { t } = useTranslation();

  // Debug flags
  const shouldDebugIdbUi = import.meta.env.DEV && typeof window !== "undefined" && window.location?.search?.includes("idbMockUpgrade=1");
  const shouldForceIdbDialog = import.meta.env.DEV && typeof window !== "undefined" && window.location?.search?.includes("idbForceDialog=1");

  // Profile selection
  const sessionProfileId = makeProfileId(session?.user?.id);
  const [lastProfileId, setLastProfileId] = useState<string | undefined>(() => {
    try {
      const raw = localStorage.getItem(LAST_PROFILE_KEY);
      return raw && raw.length > 0 ? raw : undefined;
    } catch { return undefined; }
  });
  const effectiveProfileId = sessionProfileId ?? lastProfileId;

  useEffect(() => {
    if (sessionProfileId) {
      try { localStorage.setItem(LAST_PROFILE_KEY, sessionProfileId); setLastProfileId(sessionProfileId); } catch {}
    }
  }, [sessionProfileId]);

  // ============================================================================
  // Core setup (recreated when profile changes)
  // ============================================================================
  const { localStore, syncCore, hlcManager, transport } = useMemo(() => {
    const store = new IndexedDBUserDataStore(effectiveProfileId);
    const repos = createSyncCoreRepos(store, effectiveProfileId);
    const core = new SyncCore({ repos });
    const t = new ConvexTransport();
    return { localStore: store, syncCore: core, hlcManager: repos.hlc!, transport: t };
  }, [effectiveProfileId]);

  const cacheStore = useMemo(() => new IndexedDBCacheStore(), []);
  // RegistryManager needs: registryMetadataStore (localStore has getRegistries etc), installedSourceStore (settingsOps)
  // But settingsOps depends on registryManager... circular! Use localStore for now, update later with setInstalledSourceStore
  const registryManager = useMemo(() => new RegistryManager(localStore, localStore, cacheStore), [localStore, cacheStore]);
  const nullTransport = useMemo(() => new NullTransport(), []);

  // ============================================================================
  // SyncCore lifecycle + transport wiring
  // ============================================================================
  const [signingOut, setSigningOut] = useState(false);
  const storesRef = useRef<StoreHooks | null>(null);

  useEffect(() => {
    if (isAuthenticated && convex && !signingOut) {
      transport.setConvex(convex as ConvexReactClient);
      syncCore.setTransport(transport);
    } else {
      syncCore.setTransport(nullTransport);
    }
    syncCore.start();
    
    // Subscribe to status changes
    const unsubStatus = syncCore.onStatusChange((status) => {
      syncStore.getState().setSyncStatus(status);
      syncStore.getState().setPendingCount(syncCore.pendingCount);
    });

    // Subscribe to apply events - refresh stores when remote data applied
    const unsubApplied = syncCore.onApplied(async (event) => {
      if (!storesRef.current) return;
      
      // Refresh relevant stores based on what table was applied
      if (event.table === "libraryItems" || event.table === "sourceLinks") {
        storesRef.current.useLibraryStore.getState().load(true);
      }
      
      // Refresh manga progress index when progress tables are applied
      if (event.table === "mangaProgress" || event.table === "chapterProgress") {
        try {
          const allProgress = await localStore.getAllMangaProgress();
          const newIndex = new Map<string, LocalMangaProgress>();
          for (const p of allProgress) {
            newIndex.set(p.cursorId, p);
          }
          setMangaProgressIndex(newIndex);
        } catch (e) {
          console.error("[SyncProvider] Failed to refresh manga progress index:", e);
        }
      }
    });

    return () => { unsubStatus(); unsubApplied(); syncCore.stop(); };
  }, [syncCore, isAuthenticated, convex, transport, nullTransport, syncStore, signingOut]);

  // ============================================================================
  // Manga progress index (canonical - replaces legacy libraryHistory)
  // ============================================================================
  const [mangaProgressIndex, setMangaProgressIndex] = useState<Map<string, LocalMangaProgress>>(new Map());
  const [mangaProgressLoading, setMangaProgressLoading] = useState(true);
  const mangaProgressLoadedRef = useRef(false);

  useEffect(() => {
    if (mangaProgressLoadedRef.current) return;
    mangaProgressLoadedRef.current = true;
    localStore.getAllMangaProgress().then((entries) => {
      const index = new Map<string, LocalMangaProgress>();
      for (const entry of entries) {
        index.set(entry.cursorId, entry);
      }
      setMangaProgressIndex(index);
      setMangaProgressLoading(false);
    });
  }, [localStore]);

  // On-demand chapter progress loader
  const loadChapterProgress = useCallback(
    (registryId: string, sourceId: string, sourceMangaId: string) =>
      localStore.getChapterProgressForManga(registryId, sourceId, sourceMangaId),
    [localStore]
  );

  // ============================================================================
  // Auth state tracking
  // ============================================================================
  const [authKey, setAuthKey] = useState(0);
  const prevAuthRef = useRef<boolean | null>(null);

  useEffect(() => { syncStore.getState().setAuthState(isAuthenticated, isLoading); }, [isAuthenticated, isLoading, syncStore]);
  useEffect(() => {
    if (session?.user) {
      syncStore.getState().setUser({ id: session.user.id, name: session.user.name ?? null, email: session.user.email ?? "", image: session.user.image ?? null });
    } else {
      syncStore.getState().setUser(null);
    }
  }, [session, syncStore]);
  useEffect(() => {
    if (isLoading) return;
    if (prevAuthRef.current !== null && prevAuthRef.current !== isAuthenticated) setAuthKey((k) => k + 1);
    prevAuthRef.current = isAuthenticated;
  }, [isAuthenticated, isLoading]);
  useEffect(() => { if (!isAuthenticated && signingOut) setSigningOut(false); }, [isAuthenticated, signingOut]);

  // ============================================================================
  // Canonical Library Ops (delegates to SyncCore.enqueue for push)
  // ============================================================================
  const canonicalLibraryOps: CanonicalLibraryOps = useMemo(() => ({
    getLibraryEntries: () => localStore.getLibraryEntries(),
    getLibraryItem: (id) => localStore.getLibraryItem(id),
    getSourceLinksForItem: (id) => localStore.getSourceLinksForLibraryItem(id),

    saveLibraryItem: async (item: LocalLibraryItem, clocks?: SaveItemClocks) => {
      // Resolve clocks: null = generate new, undefined = preserve existing, string = use provided
      const inLibraryClock = clocks?.inLibraryClock === null
        ? await hlcManager.generateIntentClock()
        : (clocks?.inLibraryClock ?? item.inLibraryClock);
      const metadataClock = clocks?.metadataClock === null
        ? await hlcManager.generateIntentClock()
        : (clocks?.metadataClock ?? item.overrides?.metadataClock);
      const coverUrlClock = clocks?.coverUrlClock === null
        ? await hlcManager.generateIntentClock()
        : (clocks?.coverUrlClock ?? item.overrides?.coverUrlClock);
      
      // Write resolved clocks back to local item
      const itemWithClocks: LocalLibraryItem = {
        ...item,
        inLibraryClock,
        overrides: item.overrides || metadataClock || coverUrlClock ? {
          ...item.overrides,
          metadataClock,
          coverUrlClock,
        } : undefined,
      };
      await localStore.saveLibraryItem(itemWithClocks);
      
      if (isAuthenticated) {
        // Build PushLibraryItem (transport-ready shape)
        const pushItem: PushLibraryItem = {
          libraryItemId: itemWithClocks.libraryItemId,
          metadata: itemWithClocks.metadata,
          externalIds: itemWithClocks.externalIds,
          inLibrary: itemWithClocks.inLibrary,
          inLibraryClock: itemWithClocks.inLibraryClock,
          createdAt: itemWithClocks.createdAt,
        };
        if (itemWithClocks.overrides) {
          pushItem.overrides = {
            metadata: itemWithClocks.overrides.metadata,
            metadataClock: itemWithClocks.overrides.metadataClock,
            coverUrl: itemWithClocks.overrides.coverUrl,
            coverUrlClock: itemWithClocks.overrides.coverUrlClock,
          };
        }
        
        await syncCore.enqueue({
          table: "library_items",
          operation: "save",
          data: pushItem,
          timestamp: Date.now(),
          retries: 0,
        });
      }
    },

    removeLibraryItem: async (libraryItemId: string, inLibraryClock?: string) => {
      // Soft-delete: set inLibrary=false
      const existing = await localStore.getLibraryItem(libraryItemId);
      if (existing) {
        const clock = inLibraryClock ?? await hlcManager.generateIntentClock();
        const updated: LocalLibraryItem = {
          ...existing,
          inLibrary: false,
          inLibraryClock: clock,
          updatedAt: Date.now(),
        };
        await localStore.saveLibraryItem(updated);
        if (isAuthenticated) {
        await syncCore.enqueue({
          table: "library_items",
          operation: "remove",
          data: { libraryItemId, inLibraryClock: clock },
          timestamp: Date.now(),
          retries: 0,
        });
        }
      }
    },

    saveSourceLink: async (link: LocalSourceLink) => {
      await localStore.saveSourceLink(link);
      if (isAuthenticated) {
        // Build PushLibrarySourceLink (transport-ready shape, excludes cursorId/createdAt/updatedAt)
        const pushLink: PushLibrarySourceLink = {
          libraryItemId: link.libraryItemId,
          registryId: link.registryId,
          sourceId: link.sourceId,
          sourceMangaId: link.sourceMangaId,
          latestChapter: link.latestChapter,
          latestChapterSortKey: link.latestChapterSortKey,
          latestFetchedAt: link.latestFetchedAt,
          updateAckChapter: link.updateAckChapter,
          updateAckChapterSortKey: link.updateAckChapterSortKey,
          updateAckAt: link.updateAckAt,
          deletedAt: link.deletedAt,
        };
        await syncCore.enqueue({
          table: "source_links",
          operation: "save",
          data: pushLink,
          timestamp: Date.now(),
          retries: 0,
        });
      }
    },

    removeSourceLink: async (cursorId: string) => {
      // Soft-delete: set deletedAt
      const existing = await localStore.getSourceLink(cursorId);
      if (existing) {
        const updated: LocalSourceLink = { ...existing, deletedAt: Date.now(), updatedAt: Date.now() };
        await localStore.saveSourceLink(updated);
      }
      if (isAuthenticated && existing) {
        // Include full identifiers for transport.deleteSourceLink
        await syncCore.enqueue({
          table: "source_links",
          operation: "remove",
          data: {
            libraryItemId: existing.libraryItemId,
            registryId: existing.registryId,
            sourceId: existing.sourceId,
            sourceMangaId: existing.sourceMangaId,
          },
          timestamp: Date.now(),
          retries: 0,
        });
      }
    },
  }), [localStore, isAuthenticated, hlcManager, syncCore]);

  // ============================================================================
  // History Store Ops (sync-aware) - reads/writes canonical progress tables
  // ============================================================================
  const historyOps: HistoryStoreOps = useMemo(() => ({
    getHistoryEntry: async (registryId: string, sourceId: string, mangaId: string, chapterId: string): Promise<HistoryEntry | null> => {
      // Read from canonical chapter_progress table
      const cursorId = `${encodeURIComponent(registryId)}:${encodeURIComponent(sourceId)}:${encodeURIComponent(mangaId)}:${encodeURIComponent(chapterId)}`;
      const progress = await localStore.getChapterProgressEntry(cursorId);
      if (!progress) return null;
      // Convert to HistoryEntry format for backward compat
      return {
        id: cursorId,
        registryId: progress.registryId,
        sourceId: progress.sourceId,
        mangaId: progress.sourceMangaId,
        chapterId: progress.sourceChapterId,
        progress: progress.progress,
        total: progress.total,
        completed: progress.completed,
        dateRead: progress.lastReadAt,
        chapterNumber: progress.chapterNumber,
        volumeNumber: progress.volumeNumber,
        chapterTitle: progress.chapterTitle,
      };
    },
    saveHistoryEntry: async (entry: HistoryEntry) => {
      // Save to legacy history store (for backward compat)
      await localStore.saveHistoryEntry(entry);
      
      // Also save to canonical chapter_progress table
      const chapterCursorId = `${encodeURIComponent(entry.registryId)}:${encodeURIComponent(entry.sourceId)}:${encodeURIComponent(entry.mangaId)}:${encodeURIComponent(entry.chapterId)}`;
      const chapterProgress: LocalChapterProgress = {
        cursorId: chapterCursorId,
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
        updatedAt: Date.now(),
      };
      await localStore.saveChapterProgressEntry(chapterProgress);
      
      // Update manga_progress summary
      const mangaCursorId = `${encodeURIComponent(entry.registryId)}:${encodeURIComponent(entry.sourceId)}:${encodeURIComponent(entry.mangaId)}`;
      const mangaProgress: LocalMangaProgress = {
        cursorId: mangaCursorId,
        registryId: entry.registryId,
        sourceId: entry.sourceId,
        sourceMangaId: entry.mangaId,
        lastReadAt: entry.dateRead,
        lastReadSourceChapterId: entry.chapterId,
        lastReadChapterNumber: entry.chapterNumber,
        lastReadVolumeNumber: entry.volumeNumber,
        lastReadChapterTitle: entry.chapterTitle,
        updatedAt: Date.now(),
      };
      await localStore.saveMangaProgressEntry(mangaProgress);
      
      // Update in-memory index
      setMangaProgressIndex((prev) => {
        const next = new Map(prev);
        next.set(mangaCursorId, mangaProgress);
        return next;
      });
      
      if (isAuthenticated) {
        // Build PushChapterProgress (transport-ready shape, excludes cursorId/updatedAt)
        const pushProgress: PushChapterProgress = {
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
        };
        await syncCore.enqueue({ table: "chapter_progress", operation: "save", data: pushProgress, timestamp: Date.now(), retries: 0 });
      }
    },
    getMangaHistory: async (registryId: string, sourceId: string, mangaId: string): Promise<Record<string, HistoryEntry>> => {
      // Read from canonical chapter_progress table
      const progressMap = await localStore.getChapterProgressForManga(registryId, sourceId, mangaId);
      const result: Record<string, HistoryEntry> = {};
      for (const [chapterId, progress] of Object.entries(progressMap)) {
        result[chapterId] = {
          id: progress.cursorId,
          registryId: progress.registryId,
          sourceId: progress.sourceId,
          mangaId: progress.sourceMangaId,
          chapterId: progress.sourceChapterId,
          progress: progress.progress,
          total: progress.total,
          completed: progress.completed,
          dateRead: progress.lastReadAt,
          chapterNumber: progress.chapterNumber,
          volumeNumber: progress.volumeNumber,
          chapterTitle: progress.chapterTitle,
        };
      }
      return result;
    },
    getRecentHistory: (limit: number) => localStore.getRecentHistory(limit),
  }), [localStore, isAuthenticated, syncCore]);

  // ============================================================================
  // Settings Store Ops (sync-aware) - also serves as InstalledSourceStore for RegistryManager
  // ============================================================================
  const settingsOps: SettingsStoreOps = useMemo(() => ({
    getInstalledSources: () => localStore.getInstalledSources(),
    getInstalledSource: (id: string) => localStore.getInstalledSource(id),
    saveInstalledSource: async (source: Parameters<typeof localStore.saveInstalledSource>[0]) => {
      await localStore.saveInstalledSource(source);
      const settings = await localStore.getSettings();
      if (isAuthenticated) {
        await syncCore.enqueue({ table: "settings", operation: "save", data: settings, timestamp: Date.now(), retries: 0 });
      }
    },
    removeInstalledSource: async (id: string) => {
      await localStore.removeInstalledSource(id);
      const settings = await localStore.getSettings();
      if (isAuthenticated) {
        await syncCore.enqueue({ table: "settings", operation: "save", data: settings, timestamp: Date.now(), retries: 0 });
      }
    },
  }), [localStore, isAuthenticated, syncCore]);

  // ============================================================================
  // Services and stores
  // ============================================================================
  const { services, stores } = useMemo(() => {
    registryManager.setInstalledSourceStore(settingsOps);
    const newStores: StoreHooks = {
      useLibraryStore: createLibraryStore(canonicalLibraryOps),
      useHistoryStore: createHistoryStore(historyOps),
      useSettingsStore: createSettingsStore(settingsOps, cacheStore, registryManager),
    };
    storesRef.current = newStores;
    const newServices: DataServices = { localStore, cacheStore, registryManager };
    return { services: newServices, stores: newStores };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authKey, localStore, cacheStore, registryManager, canonicalLibraryOps, historyOps, settingsOps]);

  useEffect(() => {
    stores.useSettingsStore.getState().initialize();
    stores.useLibraryStore.getState().load(false);
    getSourceSettingsStore().getState().initialize();
  }, [stores]);

  // ============================================================================
  // Import dialog (migrates legacy local data to canonical tables)
  // ============================================================================
  const [showImportDialog, setShowImportDialog] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || isLoading || !session?.user?.id) return;

    const userId = session.user.id;
    if (getImportDecision(userId)) return;
    if (sessionStorage.getItem(IMPORT_OFFERED_SESSION_KEY)) return;

    // Offer import only if:
    // - default (local/offline) profile has legacy library rows, AND
    // - cloud account appears empty (avoid duplicating into an already-synced account), AND
    // - current (user:<id>) profile doesn't already have canonical library entries.
    (async () => {
      try {
        const defaultStore = new IndexedDBUserDataStore();
        const hasLocalLegacy = await defaultStore.hasLibraryData();
        if (!hasLocalLegacy) return;

        // Conservative: only offer import when we can confirm the cloud library is empty.
        // This avoids accidental duplication for existing accounts where local canonical
        // might still be empty briefly before the first pull completes.
        let cloudEmpty = false;
        try {
          const firstPage = await transport.pullLibraryItems({ updatedAt: 0, cursorId: "" }, 1);
          cloudEmpty = firstPage.entries.length === 0;
        } catch {
          // If we can't verify cloud emptiness (offline / transient error), don't prompt.
          return;
        }

        if (!cloudEmpty) return;

        const currentEntries = await localStore.getLibraryEntries();
        if (currentEntries.length === 0) {
          setShowImportDialog(true);
        }
      } finally {
        // Avoid re-opening in the same tab session even if auth/loading toggles.
        try { sessionStorage.setItem(IMPORT_OFFERED_SESSION_KEY, "true"); } catch {}
      }
    })();
  }, [isAuthenticated, isLoading, session?.user?.id, localStore, transport]);

  const handleImportLocal = useCallback(async () => {
    if (!session?.user?.id) return;
    setShowImportDialog(false);
    const defaultStore = new IndexedDBUserDataStore();
    const [legacyLib, settings] = await Promise.all([defaultStore.getLibrary(), defaultStore.getSettings()]);

    // Convert legacy LibraryManga to canonical tables
    const now = Date.now();
    for (const manga of legacyLib) {
      const item: LocalLibraryItem = {
        libraryItemId: manga.id,
        metadata: manga.metadata,
        externalIds: manga.externalIds,
        inLibrary: true,
        overrides: manga.overrides || manga.coverCustom ? {
          metadata: manga.overrides,
          coverUrl: manga.coverCustom,
        } : undefined,
        createdAt: manga.addedAt,
        updatedAt: now,
      };
      // Import represents a new user intent; generate clocks so later merges/deletes are correct.
      await canonicalLibraryOps.saveLibraryItem(item, {
        inLibraryClock: null,
        metadataClock: item.overrides ? null : undefined,
        coverUrlClock: item.overrides ? null : undefined,
      });

      for (const source of manga.sources) {
        const link: LocalSourceLink = {
          cursorId: makeSourceLinkCursorId(source.registryId, source.sourceId, source.mangaId),
          libraryItemId: manga.id,
          registryId: source.registryId,
          sourceId: source.sourceId,
          sourceMangaId: source.mangaId,
          latestChapter: source.latestChapter,
          updateAckChapter: source.updateAcknowledged,
          createdAt: now,
          updatedAt: now,
        };
        await canonicalLibraryOps.saveSourceLink(link);
      }
    }

    if (settings.installedSources.length > 0) {
      // Save each installed source
      for (const source of settings.installedSources) {
        await settingsOps.saveInstalledSource(source);
      }
    }

    stores.useLibraryStore.getState().load();
    stores.useSettingsStore.getState().initialize();
    setImportDecision(session.user.id, "imported");
  }, [session?.user?.id, canonicalLibraryOps, settingsOps, stores]);

  const handleSkipImport = useCallback(() => {
    if (session?.user?.id) {
      setImportDecision(session.user.id, "skipped");
    }
    setShowImportDialog(false);
  }, [session?.user?.id]);

  // ============================================================================
  // IDB blocked dialog
  // ============================================================================
  const [idbBlocked, setIdbBlocked] = useState<IdbBlockedEventDetail | null>(null);
  const [idbDialogOpen, setIdbDialogOpen] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(IDB_UI_EVENT_BUFFER_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { detail?: IdbBlockedEventDetail };
        if (parsed?.detail?.kind) {
          setIdbBlocked(parsed.detail);
          setIdbDialogOpen(true);
        }
        sessionStorage.removeItem(IDB_UI_EVENT_BUFFER_KEY);
      }
    } catch {}
    try {
      if (shouldDebugIdbUi && sessionStorage.getItem(MOCK_BLOCK_STICKY_KEY) === "1") {
        setIdbBlocked({ dbName: "nemu-user", kind: "blocked" });
        setIdbDialogOpen(true);
      }
    } catch {}
    const handler = (ev: Event) => {
      const d = (ev as CustomEvent<IdbBlockedEventDetail>).detail;
      if (d?.kind) {
        setIdbBlocked(d);
        setIdbDialogOpen(true);
      }
    };
    window.addEventListener(IDB_UI_EVENT, handler as EventListener);
    return () => window.removeEventListener(IDB_UI_EVENT, handler as EventListener);
  }, [shouldDebugIdbUi]);

  useEffect(() => {
    if (shouldForceIdbDialog) {
      setIdbBlocked({ dbName: "nemu-user", kind: "blocked" });
      setIdbDialogOpen(true);
    }
  }, [shouldForceIdbDialog]);

  // ============================================================================
  // Sign out
  // ============================================================================
  const signOut = useCallback(async (clearLocal: boolean) => {
    // Best-effort: flush a sync run before wiping local data, so we don't silently
    // drop pending ops for users who expect cloud state to be preserved.
    if (clearLocal) {
      try {
        await syncCore.syncNow("manual");
      } catch {}
    }

    setSigningOut(true);
    syncCore.stop();
    if (clearLocal) {
      await localStore.clearAccountData();
      try {
        localStorage.removeItem(LAST_PROFILE_KEY);
      } catch {}
      setLastProfileId(undefined);
    }
    sessionStorage.removeItem(IMPORT_OFFERED_SESSION_KEY);
    syncStore.getState().reset();
  }, [syncCore, localStore, syncStore]);

  // ============================================================================
  // Context value
  // ============================================================================
  const syncStatus = syncStore((s) => s.syncStatus);
  const pendingCount = syncStore((s) => s.pendingCount);

  const value: SyncContextValue = useMemo(() => ({
    services,
    stores,
    isAuthenticated,
    isLoading,
    syncStatus,
    pendingCount,
    signOut,
    mangaProgressIndex,
    mangaProgressLoading,
    loadChapterProgress,
  }), [services, stores, isAuthenticated, isLoading, syncStatus, pendingCount, signOut, mangaProgressIndex, mangaProgressLoading, loadChapterProgress]);

  const idbDescription = idbBlocked?.kind === "versionchange"
    ? t("storage.idbLock.descriptionVersionChange")
    : t("storage.idbLock.descriptionBlocked");

  return (
    <SyncContext.Provider value={value}>
      {children}
      <ResponsiveDialog open={idbDialogOpen} onOpenChange={setIdbDialogOpen} dismissible={false}>
        <ResponsiveDialogContent showCloseButton={false}>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>{t("storage.idbLock.title")}</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>{idbDescription}</ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <ResponsiveDialogFooter>
            <Button onClick={() => window.location.reload()}>{t("storage.idbLock.reload")}</Button>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>

      <ResponsiveDialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <ResponsiveDialogContent>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>{t("import.title")}</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>{t("import.description")}</ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <ResponsiveDialogFooter>
            <Button variant="outline" onClick={handleSkipImport}>{t("import.skip")}</Button>
            <Button onClick={handleImportLocal}>{t("import.confirm")}</Button>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </SyncContext.Provider>
  );
}
