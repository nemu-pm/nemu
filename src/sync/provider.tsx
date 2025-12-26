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
import { clearSyncState, createSyncCoreRepos } from "./core/adapters";
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
const IMPORT_OFFERED_SESSION_KEY = "nemu:import-offered-session";
const IMPORT_DECISION_KEY_PREFIX = "nemu:import-local-library:decision:";

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

export function makeProfileId(userId: string | null | undefined): string | undefined {
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

  // Profile selection - STRICT ISOLATION
  const sessionProfileId = makeProfileId(session?.user?.id);
  const effectiveProfileId = sessionProfileId;
  
  console.log("[SyncProvider] RENDER - Profile:", { sessionProfileId, effectiveProfileId, isAuthenticated, isLoading, userId: session?.user?.id });

  // ============================================================================
  // Core setup (recreated when profile changes)
  // ============================================================================
  const { localStore, syncCore, hlcManager, transport } = useMemo(() => {
    console.log("[SyncProvider] CREATING new localStore/syncCore for profile:", effectiveProfileId);
    const store = new IndexedDBUserDataStore(effectiveProfileId);
    const repos = createSyncCoreRepos(store, effectiveProfileId);
    const core = new SyncCore({ repos });
    const t = new ConvexTransport();
    return { localStore: store, syncCore: core, hlcManager: repos.hlc!, transport: t };
  }, [effectiveProfileId]);

  const cacheStore = useMemo(() => new IndexedDBCacheStore(), []);
  const registryManager = useMemo(() => new RegistryManager(localStore, localStore, cacheStore), [localStore, cacheStore]);
  const nullTransport = useMemo(() => new NullTransport(), []);

  // ============================================================================
  // REFS for stable ops - stores read from these instead of capturing closures
  // This allows stores to be created ONCE and still use the correct data source
  // ============================================================================
  const localStoreRef = useRef(localStore);
  const syncCoreRef = useRef(syncCore);
  const hlcManagerRef = useRef(hlcManager);
  const isAuthenticatedRef = useRef(isAuthenticated);
  const registryManagerRef = useRef(registryManager);
  const cacheStoreRef = useRef(cacheStore);
  
  // Update refs synchronously during render (safe because these are refs)
  if (localStoreRef.current !== localStore) {
    console.log("[SyncProvider] localStoreRef.current CHANGED from", localStoreRef.current?.profileId, "to", localStore.profileId);
  }
  localStoreRef.current = localStore;
  syncCoreRef.current = syncCore;
  hlcManagerRef.current = hlcManager;
  isAuthenticatedRef.current = isAuthenticated;
  registryManagerRef.current = registryManager;
  cacheStoreRef.current = cacheStore;

  // ============================================================================
  // SyncCore lifecycle + transport wiring
  // ============================================================================
  const [signingOut, setSigningOut] = useState(false);
  const storesRef = useRef<StoreHooks | null>(null);

  useEffect(() => {
    console.log("[SyncProvider] EFFECT - Setting up syncCore. isAuthenticated:", isAuthenticated, "convex:", !!convex, "signingOut:", signingOut);
    if (isAuthenticated && convex && !signingOut) {
      console.log("[SyncProvider] EFFECT - Setting ConvexTransport");
      transport.setConvex(convex as ConvexReactClient);
      syncCore.setTransport(transport);
    } else {
      console.log("[SyncProvider] EFFECT - Setting NullTransport");
      syncCore.setTransport(nullTransport);
    }
    syncCore.start();
    
    // Subscribe to status changes
    const unsubStatus = syncCore.onStatusChange((status) => {
      console.log("[SyncProvider] STATUS CHANGE:", status);
      syncStore.getState().setSyncStatus(status);
      syncStore.getState().setPendingCount(syncCore.pendingCount);
    });

    // Subscribe to apply events - refresh stores when remote data applied
    const unsubApplied = syncCore.onApplied(async (event) => {
      console.log("[SyncProvider] ON_APPLIED:", event.table, "affectedCount:", event.affectedCount, "storesRef.current:", !!storesRef.current);
      if (!storesRef.current) {
        console.warn("[SyncProvider] ON_APPLIED - storesRef.current is NULL! Cannot refresh stores.");
        return;
      }
      
      // Refresh relevant stores based on what table was applied
      if (event.table === "libraryItems" || event.table === "sourceLinks") {
        console.log("[SyncProvider] ON_APPLIED - Calling libraryStore.load(true)");
        storesRef.current.useLibraryStore.getState().load(true);
      }
      
      // Refresh settings store when settings are synced
      if (event.table === "settings") {
        console.log("[SyncProvider] ON_APPLIED - Calling settingsStore.initialize()");
        storesRef.current.useSettingsStore.getState().initialize();
      }
      
      // Refresh manga progress index when progress tables are applied
      if (event.table === "mangaProgress" || event.table === "chapterProgress") {
        try {
          const allProgress = await localStoreRef.current.getAllMangaProgress();
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
  const lastLocalStoreRef = useRef<IndexedDBUserDataStore | null>(null);

  useEffect(() => {
    // Reset loading state when localStore changes (profile switch)
    if (lastLocalStoreRef.current !== localStore) {
      lastLocalStoreRef.current = localStore;
      setMangaProgressLoading(true);
      setMangaProgressIndex(new Map());
    }
    
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
      localStoreRef.current.getChapterProgressForManga(registryId, sourceId, sourceMangaId),
    []
  );

  // ============================================================================
  // Auth state tracking
  // ============================================================================
  useEffect(() => { syncStore.getState().setAuthState(isAuthenticated, isLoading); }, [isAuthenticated, isLoading, syncStore]);
  useEffect(() => {
    if (session?.user) {
      syncStore.getState().setUser({ id: session.user.id, name: session.user.name ?? null, email: session.user.email ?? "", image: session.user.image ?? null });
    } else {
      syncStore.getState().setUser(null);
    }
  }, [session, syncStore]);
  useEffect(() => { if (!isAuthenticated && signingOut) setSigningOut(false); }, [isAuthenticated, signingOut]);

  // ============================================================================
  // Canonical Library Ops - uses REFS so stores don't need recreation
  // ============================================================================
  const canonicalLibraryOps: CanonicalLibraryOps = useMemo(() => ({
    getLibraryEntries: () => {
      console.log("[canonicalLibraryOps] getLibraryEntries() - localStoreRef.current.profileId:", localStoreRef.current.profileId);
      return localStoreRef.current.getLibraryEntries();
    },
    getLibraryItem: (id) => localStoreRef.current.getLibraryItem(id),
    getSourceLinksForItem: (id) => localStoreRef.current.getSourceLinksForLibraryItem(id),

    saveLibraryItem: async (item: LocalLibraryItem, clocks?: SaveItemClocks) => {
      const hlc = hlcManagerRef.current;
      const store = localStoreRef.current;
      const core = syncCoreRef.current;
      const authed = isAuthenticatedRef.current;
      
      const inLibraryClock = clocks?.inLibraryClock === null
        ? await hlc.generateIntentClock()
        : (clocks?.inLibraryClock ?? item.inLibraryClock);
      const metadataClock = clocks?.metadataClock === null
        ? await hlc.generateIntentClock()
        : (clocks?.metadataClock ?? item.overrides?.metadataClock);
      const coverUrlClock = clocks?.coverUrlClock === null
        ? await hlc.generateIntentClock()
        : (clocks?.coverUrlClock ?? item.overrides?.coverUrlClock);
      
      const itemWithClocks: LocalLibraryItem = {
        ...item,
        inLibraryClock,
        overrides: item.overrides || metadataClock || coverUrlClock ? {
          ...item.overrides,
          metadataClock,
          coverUrlClock,
        } : undefined,
      };
      await store.saveLibraryItem(itemWithClocks);
      
      if (authed) {
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
        await core.enqueue({
          table: "library_items",
          operation: "save",
          data: pushItem,
          timestamp: Date.now(),
          retries: 0,
        });
      }
    },

    removeLibraryItem: async (libraryItemId: string, inLibraryClock?: string) => {
      const hlc = hlcManagerRef.current;
      const store = localStoreRef.current;
      const core = syncCoreRef.current;
      const authed = isAuthenticatedRef.current;
      
      const existing = await store.getLibraryItem(libraryItemId);
      if (existing) {
        const clock = inLibraryClock ?? await hlc.generateIntentClock();
        const updated: LocalLibraryItem = {
          ...existing,
          inLibrary: false,
          inLibraryClock: clock,
          updatedAt: Date.now(),
        };
        await store.saveLibraryItem(updated);
        if (authed) {
          await core.enqueue({
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
      const store = localStoreRef.current;
      const core = syncCoreRef.current;
      const authed = isAuthenticatedRef.current;
      
      await store.saveSourceLink(link);
      if (authed) {
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
        await core.enqueue({
          table: "source_links",
          operation: "save",
          data: pushLink,
          timestamp: Date.now(),
          retries: 0,
        });
      }
    },

    removeSourceLink: async (cursorId: string) => {
      const store = localStoreRef.current;
      const core = syncCoreRef.current;
      const authed = isAuthenticatedRef.current;
      
      const existing = await store.getSourceLink(cursorId);
      if (existing) {
        const updated: LocalSourceLink = { ...existing, deletedAt: Date.now(), updatedAt: Date.now() };
        await store.saveSourceLink(updated);
      }
      if (authed && existing) {
        await core.enqueue({
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
  }), []); // Empty deps - uses refs

  // ============================================================================
  // History Store Ops - uses REFS
  // ============================================================================
  const historyOps: HistoryStoreOps = useMemo(() => ({
    getHistoryEntry: async (registryId: string, sourceId: string, mangaId: string, chapterId: string): Promise<HistoryEntry | null> => {
      const store = localStoreRef.current;
      const cursorId = `${encodeURIComponent(registryId)}:${encodeURIComponent(sourceId)}:${encodeURIComponent(mangaId)}:${encodeURIComponent(chapterId)}`;
      const progress = await store.getChapterProgressEntry(cursorId);
      if (!progress) return null;
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
      const store = localStoreRef.current;
      const core = syncCoreRef.current;
      const authed = isAuthenticatedRef.current;
      
      await store.saveHistoryEntry(entry);
      
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
      await store.saveChapterProgressEntry(chapterProgress);
      
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
      await store.saveMangaProgressEntry(mangaProgress);
      
      setMangaProgressIndex((prev) => {
        const next = new Map(prev);
        next.set(mangaCursorId, mangaProgress);
        return next;
      });
      
      if (authed) {
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
        await core.enqueue({ table: "chapter_progress", operation: "save", data: pushProgress, timestamp: Date.now(), retries: 0 });
      }
    },
    getMangaHistory: async (registryId: string, sourceId: string, mangaId: string): Promise<Record<string, HistoryEntry>> => {
      const store = localStoreRef.current;
      const progressMap = await store.getChapterProgressForManga(registryId, sourceId, mangaId);
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
    getRecentHistory: (limit: number) => localStoreRef.current.getRecentHistory(limit),
  }), []); // Empty deps - uses refs

  // ============================================================================
  // Settings Store Ops - uses REFS
  // ============================================================================
  const settingsOps: SettingsStoreOps = useMemo(() => ({
    getInstalledSources: () => localStoreRef.current.getInstalledSources(),
    getInstalledSource: (id: string) => localStoreRef.current.getInstalledSource(id),
    saveInstalledSource: async (source: Parameters<IndexedDBUserDataStore["saveInstalledSource"]>[0]) => {
      const store = localStoreRef.current;
      const core = syncCoreRef.current;
      const authed = isAuthenticatedRef.current;
      
      await store.saveInstalledSource(source);
      const settings = await store.getSettings();
      if (authed) {
        await core.enqueue({ table: "settings", operation: "save", data: settings, timestamp: Date.now(), retries: 0 });
      }
    },
    removeInstalledSource: async (id: string) => {
      const store = localStoreRef.current;
      const core = syncCoreRef.current;
      const authed = isAuthenticatedRef.current;
      
      await store.removeInstalledSource(id);
      const settings = await store.getSettings();
      if (authed) {
        await core.enqueue({ table: "settings", operation: "save", data: settings, timestamp: Date.now(), retries: 0 });
      }
    },
  }), []); // Empty deps - uses refs

  // ============================================================================
  // Services and stores - CREATED ONCE using useRef (not useMemo!)
  // This prevents React Strict Mode from creating duplicate stores
  // ============================================================================
  if (!storesRef.current) {
    console.log("[SyncProvider] CREATING stores ONCE (lazy ref init)");
    registryManagerRef.current.setInstalledSourceStore(settingsOps);
    storesRef.current = {
      useLibraryStore: createLibraryStore(canonicalLibraryOps),
      useHistoryStore: createHistoryStore(historyOps),
      useSettingsStore: createSettingsStore(settingsOps, cacheStoreRef.current, registryManagerRef.current),
    };
    console.log("[SyncProvider] storesRef.current SET:", !!storesRef.current);
  }
  const stores = storesRef.current;

  // When localStore changes (profile switch), reload all stores
  useEffect(() => {
    console.log("[SyncProvider] localStore changed - reloading stores");
    stores.useSettingsStore.getState().initialize().then(() => {
      console.log("[SyncProvider] settingsStore.initialize() DONE after profile switch");
    });
    stores.useLibraryStore.getState().load(false).then(() => {
      console.log("[SyncProvider] libraryStore.load() DONE after profile switch");
    });
    getSourceSettingsStore().getState().initialize();
  }, [localStore, stores]);

  // ============================================================================
  // Import dialog (migrates legacy local data to canonical tables)
  // ============================================================================
  const [showImportDialog, setShowImportDialog] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || isLoading || !session?.user?.id) return;

    const userId = session.user.id;
    if (getImportDecision(userId)) return;
    if (sessionStorage.getItem(IMPORT_OFFERED_SESSION_KEY)) return;

    (async () => {
      try {
        const defaultStore = new IndexedDBUserDataStore();
        const hasLocalLegacy = await defaultStore.hasLibraryData();
        if (!hasLocalLegacy) return;

        let cloudEmpty = false;
        try {
          const firstPage = await transport.pullLibraryItems({ updatedAt: 0, cursorId: "" }, 1);
          cloudEmpty = firstPage.entries.length === 0;
        } catch {
          return;
        }
        if (!cloudEmpty) return;

        const currentEntries = await localStore.getLibraryEntries();
        if (currentEntries.length > 0) return;

        sessionStorage.setItem(IMPORT_OFFERED_SESSION_KEY, "true");
        setShowImportDialog(true);
      } catch (e) {
        console.error("[SyncProvider] Import check failed:", e);
      }
    })();
  }, [isAuthenticated, isLoading, session?.user?.id, localStore, transport]);

  const handleImportLocal = useCallback(async () => {
    if (!session?.user?.id) return;
    setShowImportDialog(false);
    setImportDecision(session.user.id, "imported");

    try {
      const defaultStore = new IndexedDBUserDataStore();
      const legacyData = await defaultStore.getLibrary();
      
      for (const legacy of legacyData) {
        const parts = legacy.id.split(":");
        if (parts.length < 3) continue;
        
        const [registryId, sourceId, ...mangaIdParts] = parts;
        const sourceMangaId = mangaIdParts.join(":");
        
        const libraryItemId = crypto.randomUUID();
        const now = Date.now();
        
        const item: LocalLibraryItem = {
          libraryItemId,
          metadata: legacy.metadata ?? { title: "Unknown" },
          externalIds: legacy.externalIds,
          inLibrary: true,
          createdAt: legacy.addedAt ?? now,
          updatedAt: now,
        };
        
        if (legacy.overrides) {
          item.overrides = { metadata: legacy.overrides };
        }
        if (legacy.coverCustom) {
          item.overrides = { ...item.overrides, coverUrl: legacy.coverCustom };
        }
        
        await canonicalLibraryOps.saveLibraryItem(item, { inLibraryClock: null });
        
        const sourceLink: LocalSourceLink = {
          cursorId: makeSourceLinkCursorId(registryId, sourceId, sourceMangaId),
          libraryItemId,
          registryId,
          sourceId,
          sourceMangaId,
          createdAt: now,
          updatedAt: now,
        };
        
        await canonicalLibraryOps.saveSourceLink(sourceLink);
      }
      
      stores.useLibraryStore.getState().load(false);
    } catch (e) {
      console.error("[SyncProvider] Import failed:", e);
    }
  }, [session?.user?.id, canonicalLibraryOps, stores]);

  const handleSkipImport = useCallback(() => {
    if (!session?.user?.id) return;
    setShowImportDialog(false);
    setImportDecision(session.user.id, "skipped");
  }, [session?.user?.id]);

  // ============================================================================
  // Sign out
  // ============================================================================
  const signOut = useCallback(async (keepData: boolean) => {
    console.log("[SignOut] Starting sign out, keepData:", keepData, "effectiveProfileId:", effectiveProfileId);
    
    try {
      await syncCore.syncNow("manual");
    } catch {}

    setSigningOut(true);
    syncCore.stop();
    
    if (keepData && effectiveProfileId) {
      console.log("[SignOut] Copying data from user profile to local profile...");
      const localProfile = new IndexedDBUserDataStore();
      
      const items = await localStore.getAllLibraryItems({ includeRemoved: true });
      console.log("[SignOut] Found", items.length, "library items to copy (including tombstones)");
      for (const item of items) {
        await localProfile.saveLibraryItem(item);
      }
      
      const links = await localStore.getAllSourceLinks({ includeDeleted: true });
      console.log("[SignOut] Found", links.length, "source links to copy (including tombstones)");
      for (const link of links) {
        await localProfile.saveSourceLink(link);
      }
      
      const chapters = await localStore.getAllChapterProgress();
      console.log("[SignOut] Found", chapters.length, "chapter progress to copy");
      for (const ch of chapters) {
        await localProfile.saveChapterProgressEntry(ch);
      }
      
      const mangas = await localStore.getAllMangaProgress();
      console.log("[SignOut] Found", mangas.length, "manga progress to copy");
      for (const m of mangas) {
        await localProfile.saveMangaProgressEntry(m);
      }
      
      const settings = await localStore.getSettings();
      console.log("[SignOut] Copying settings with", settings.installedSources.length, "installed sources");
      await localProfile.saveSettings(settings);
      
      const verifyItems = await localProfile.getAllLibraryItems({ includeRemoved: true });
      console.log(
        "[SignOut] Verification: local profile now has",
        verifyItems.length,
        "library items (including tombstones)"
      );
    }
    
    console.log("[SignOut] Clearing cloud profile data...");
    await localStore.clearAccountData();
    try {
      await clearSyncState(effectiveProfileId);
    } catch (e) {
      console.error("[SignOut] Failed to clear sync state:", e);
    }
    try {
      if (session?.user?.id) localStorage.removeItem(`${IMPORT_DECISION_KEY_PREFIX}${session.user.id}`);
    } catch {}
    
    sessionStorage.removeItem(IMPORT_OFFERED_SESSION_KEY);
    syncStore.getState().reset();
    console.log("[SignOut] Sign out complete");
  }, [syncCore, localStore, syncStore, effectiveProfileId, session?.user?.id]);

  // ============================================================================
  // IDB blocked dialog
  // ============================================================================
  const [idbBlocked, setIdbBlocked] = useState<IdbBlockedEventDetail | null>(null);
  const [idbDialogOpen, setIdbDialogOpen] = useState(false);

  useEffect(() => {
    if (shouldDebugIdbUi) {
      try {
        const buffered = sessionStorage.getItem(IDB_UI_EVENT_BUFFER_KEY);
        if (buffered) {
          sessionStorage.removeItem(IDB_UI_EVENT_BUFFER_KEY);
          const parsed = JSON.parse(buffered) as IdbBlockedEventDetail;
          setIdbBlocked(parsed);
          setIdbDialogOpen(true);
        }
      } catch {}
    }
    if (shouldForceIdbDialog) {
      setIdbBlocked({ dbName: "nemu-user", kind: "blocked", requestedVersion: 999 });
      setIdbDialogOpen(true);
    }
    const handler = (e: CustomEvent<IdbBlockedEventDetail>) => {
      setIdbBlocked(e.detail);
      setIdbDialogOpen(true);
      if (shouldDebugIdbUi) {
        try { sessionStorage.setItem(IDB_UI_EVENT_BUFFER_KEY, JSON.stringify(e.detail)); } catch {}
      }
    };
    window.addEventListener(IDB_UI_EVENT, handler as EventListener);
    return () => window.removeEventListener(IDB_UI_EVENT, handler as EventListener);
  }, [shouldDebugIdbUi, shouldForceIdbDialog]);

  useEffect(() => {
    if (shouldDebugIdbUi) {
      const sticky = localStorage.getItem(MOCK_BLOCK_STICKY_KEY);
      if (sticky === "true") {
        setIdbBlocked({ dbName: "nemu-user", kind: "blocked" });
        setIdbDialogOpen(true);
      }
    }
  }, [shouldDebugIdbUi]);

  // ============================================================================
  // Sync status
  // ============================================================================
  const syncStatus = syncStore((s) => s.syncStatus);
  const pendingCount = syncStore((s) => s.pendingCount);

  // ============================================================================
  // Context value
  // ============================================================================
  const value: SyncContextValue = useMemo(() => ({
    services: { localStore, cacheStore, registryManager },
    stores,
    isAuthenticated,
    isLoading,
    syncStatus,
    pendingCount,
    signOut,
    syncNow: () => syncCore.syncNow("manual"),
    getSyncDebugSnapshot: () => syncCore.debugSnapshot(),
    debugInfo: {
      sessionProfileId,
      effectiveProfileId,
      userDbName: effectiveProfileId ? `nemu-user::${effectiveProfileId}` : "nemu-user",
      syncDbName: effectiveProfileId ? `nemu-sync::${effectiveProfileId}` : "nemu-sync",
    },
    mangaProgressIndex,
    mangaProgressLoading,
    loadChapterProgress,
  }), [localStore, cacheStore, registryManager, stores, isAuthenticated, isLoading, syncStatus, pendingCount, signOut, syncCore, sessionProfileId, effectiveProfileId, mangaProgressIndex, mangaProgressLoading, loadChapterProgress]);

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
