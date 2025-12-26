/**
 * SyncProvider (Phase 8 - Subscription-based sync)
 *
 * Simplified provider that:
 * - Uses Convex subscriptions directly for real-time sync
 * - Writes to local IDB as cache for offline viewing
 * - Lets Convex handle offline mutations automatically
 *
 * NO cursors, NO SyncCore, NO HLC clocks on client.
 */

import { useEffect, useState, useRef, useMemo, useCallback, type ReactNode } from "react";
import { useConvexAuth, useConvex, useQuery } from "convex/react";
import type { ConvexReactClient } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "../../convex/_generated/api";
import { IDB_UI_EVENT, IndexedDBUserDataStore } from "@/data/indexeddb";
import { IndexedDBCacheStore } from "@/data/cache";
import type { HistoryEntry, LocalLibraryItem, LocalSourceLink, LocalMangaProgress, LocalChapterProgress, UserSettings } from "@/data/schema";
import { makeSourceLinkCursorId } from "@/data/schema";
import { RegistryManager } from "@/lib/sources/registry";
import { createLibraryStore, type CanonicalLibraryOps } from "@/stores/library";
import { createHistoryStore, type HistoryStoreOps } from "@/stores/history";
import { createSettingsStore, type SettingsStoreOps } from "@/stores/settings";
import { getSourceSettingsStore } from "@/stores/source-settings";
import { getSyncStore } from "@/stores/sync";
import { authClient } from "@/lib/auth-client";
import { SyncContext } from "./context";
import type { StoreHooks, SyncContextValue, SyncStatus } from "./types";
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
const LAST_PROFILE_ID_KEY = "nemu:last-profile-id";

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

  const [signingOut, setSigningOut] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("offline");
  const subscriptionStoppedRef = useRef(false);

  // Debug flags
  const shouldDebugIdbUi = import.meta.env.DEV && typeof window !== "undefined" && window.location?.search?.includes("idbMockUpgrade=1");
  const shouldForceIdbDialog = import.meta.env.DEV && typeof window !== "undefined" && window.location?.search?.includes("idbForceDialog=1");

  // Profile selection - STRICT ISOLATION
  const sessionProfileId = makeProfileId(session?.user?.id);
  const lastProfileIdRef = useRef<string | undefined>(undefined);
  const lastProfileIdInitRef = useRef(false);
  if (!lastProfileIdInitRef.current) {
    lastProfileIdInitRef.current = true;
    try {
      const raw = localStorage.getItem(LAST_PROFILE_ID_KEY) ?? undefined;
      lastProfileIdRef.current = raw && raw.startsWith("user:") ? raw : undefined;
    } catch {
      lastProfileIdRef.current = undefined;
    }
  }

  const effectiveProfileId =
    sessionProfileId ??
    ((isAuthenticated || isLoading) ? lastProfileIdRef.current : undefined);
  
  console.log("[SyncProvider] RENDER - Profile:", { sessionProfileId, effectiveProfileId, isAuthenticated, isLoading, userId: session?.user?.id });

  // Persist last signed-in profile for fast boot
  useEffect(() => {
    if (!sessionProfileId) return;
    if (signingOut) return;
    lastProfileIdRef.current = sessionProfileId;
    try {
      localStorage.setItem(LAST_PROFILE_ID_KEY, sessionProfileId);
    } catch {}
  }, [sessionProfileId, signingOut]);

  // Clear persisted profile on definitive logout
  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated) return;
    lastProfileIdRef.current = undefined;
    try {
      localStorage.removeItem(LAST_PROFILE_ID_KEY);
    } catch {}
  }, [isAuthenticated, isLoading]);

  // ============================================================================
  // Local stores (recreated when profile changes)
  // ============================================================================
  const { localStore, cacheStore, registryManager } = useMemo(() => {
    console.log("[SyncProvider] CREATING new localStore for profile:", effectiveProfileId);
    const store = new IndexedDBUserDataStore(effectiveProfileId);
    const cache = new IndexedDBCacheStore();
    const registry = new RegistryManager(store, store, cache);
    return { localStore: store, cacheStore: cache, registryManager: registry };
  }, [effectiveProfileId]);

  // Refs for stable ops
  const localStoreRef = useRef(localStore);
  const registryManagerRef = useRef(registryManager);
  const cacheStoreRef = useRef(cacheStore);
  const convexRef = useRef<ConvexReactClient | null>(null);
  const isAuthenticatedRef = useRef(isAuthenticated);
  
  localStoreRef.current = localStore;
  registryManagerRef.current = registryManager;
  cacheStoreRef.current = cacheStore;
  convexRef.current = convex as ConvexReactClient;
  isAuthenticatedRef.current = isAuthenticated;

  // ============================================================================
  // Convex subscriptions → local IDB (Phase 8)
  // ============================================================================
  const skipSubscriptions = !isAuthenticated || signingOut || subscriptionStoppedRef.current;
  
  // Library items subscription
  const cloudLibraryItems = useQuery(
    api.sync.libraryItemsAll,
    skipSubscriptions ? "skip" : {}
  );
  
  // Source links subscription
  const cloudSourceLinks = useQuery(
    api.sync.sourceLinksAll,
    skipSubscriptions ? "skip" : {}
  );
  
  // Chapter progress subscription
  const cloudChapterProgress = useQuery(
    api.sync.chapterProgressAll,
    skipSubscriptions ? "skip" : {}
  );
  
  // Manga progress subscription
  const cloudMangaProgress = useQuery(
    api.sync.mangaProgressAll,
    skipSubscriptions ? "skip" : {}
  );
  
  // Settings subscription
  const cloudSettings = useQuery(
    api.settings.get,
    skipSubscriptions ? "skip" : {}
  );

  // Track if we're syncing
  const isSyncing = isAuthenticated && (
    cloudLibraryItems === undefined ||
    cloudSourceLinks === undefined ||
    cloudSettings === undefined
  );

  useEffect(() => {
    if (!isAuthenticated) {
      setSyncStatus("offline");
    } else if (isSyncing) {
      setSyncStatus("syncing");
    } else {
      setSyncStatus("synced");
    }
    syncStore.getState().setSyncStatus(isSyncing ? "syncing" : isAuthenticated ? "synced" : "offline");
  }, [isAuthenticated, isSyncing, syncStore]);

  // Refs for stores
  const storesRef = useRef<StoreHooks | null>(null);

  // Apply cloud library items to local IDB
  useEffect(() => {
    if (!cloudLibraryItems || subscriptionStoppedRef.current) return;
    console.log("[SyncProvider] Applying", cloudLibraryItems.length, "library items from cloud");
    
    (async () => {
      const store = localStoreRef.current;
      for (const item of cloudLibraryItems) {
        const local: LocalLibraryItem = {
          libraryItemId: item.cursorId,
          metadata: item.metadata,
          externalIds: item.externalIds,
          inLibrary: item.inLibrary ?? true,
          overrides: item.overrides,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        };
        await store.saveLibraryItem(local);
      }
      storesRef.current?.useLibraryStore.getState().load(true);
    })();
  }, [cloudLibraryItems]);

  // Apply cloud source links to local IDB
  useEffect(() => {
    if (!cloudSourceLinks || subscriptionStoppedRef.current) return;
    console.log("[SyncProvider] Applying", cloudSourceLinks.length, "source links from cloud");
    
    (async () => {
      const store = localStoreRef.current;
      for (const link of cloudSourceLinks) {
        const local: LocalSourceLink = {
          cursorId: link.cursorId ?? `${link.registryId}:${link.sourceId}:${link.sourceMangaId}`,
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
          createdAt: link.createdAt,
          updatedAt: link.updatedAt,
          deletedAt: link.deletedAt,
        };
        await store.saveSourceLink(local);
      }
      storesRef.current?.useLibraryStore.getState().load(true);
    })();
  }, [cloudSourceLinks]);

  // Apply cloud chapter progress to local IDB
  useEffect(() => {
    if (!cloudChapterProgress || subscriptionStoppedRef.current) return;
    console.log("[SyncProvider] Applying", cloudChapterProgress.length, "chapter progress from cloud");
    
    (async () => {
      const store = localStoreRef.current;
      for (const cp of cloudChapterProgress) {
        const local: LocalChapterProgress = {
          cursorId: cp.cursorId ?? `${cp.registryId}:${cp.sourceId}:${cp.sourceMangaId}:${cp.sourceChapterId}`,
          registryId: cp.registryId,
          sourceId: cp.sourceId,
          sourceMangaId: cp.sourceMangaId,
          sourceChapterId: cp.sourceChapterId,
          libraryItemId: cp.libraryItemId,
          progress: cp.progress,
          total: cp.total,
          completed: cp.completed,
          lastReadAt: cp.lastReadAt,
          chapterNumber: cp.chapterNumber,
          volumeNumber: cp.volumeNumber,
          chapterTitle: cp.chapterTitle,
          updatedAt: cp.updatedAt,
          deletedAt: cp.deletedAt,
        };
        await store.saveChapterProgressEntry(local);
      }
    })();
  }, [cloudChapterProgress]);

  // Apply cloud manga progress to local IDB + update UI state
  useEffect(() => {
    if (!cloudMangaProgress || subscriptionStoppedRef.current) return;
    console.log("[SyncProvider] Applying", cloudMangaProgress.length, "manga progress from cloud");
    
    (async () => {
      const store = localStoreRef.current;
      const newIndex = new Map<string, LocalMangaProgress>();
      
      for (const mp of cloudMangaProgress) {
        const cursorId = mp.cursorId ?? `${mp.registryId}:${mp.sourceId}:${mp.sourceMangaId}`;
        const local: LocalMangaProgress = {
          cursorId,
          registryId: mp.registryId,
          sourceId: mp.sourceId,
          sourceMangaId: mp.sourceMangaId,
          libraryItemId: mp.libraryItemId,
          lastReadAt: mp.lastReadAt,
          lastReadSourceChapterId: mp.lastReadSourceChapterId,
          lastReadChapterNumber: mp.lastReadChapterNumber,
          lastReadVolumeNumber: mp.lastReadVolumeNumber,
          lastReadChapterTitle: mp.lastReadChapterTitle,
          updatedAt: mp.updatedAt,
        };
        await store.saveMangaProgressEntry(local);
        newIndex.set(cursorId, local);
      }
      
      setMangaProgressIndex(newIndex);
    })();
  }, [cloudMangaProgress]);

  // Apply cloud settings to local IDB
  useEffect(() => {
    if (!cloudSettings || subscriptionStoppedRef.current) return;
    console.log("[SyncProvider] Applying settings from cloud");
    
    (async () => {
      const store = localStoreRef.current;
      await store.saveSettings({ installedSources: cloudSettings.installedSources ?? [] });
      storesRef.current?.useSettingsStore.getState().initialize();
    })();
  }, [cloudSettings]);

  // ============================================================================
  // Manga progress index (for offline + UI)
  // ============================================================================
  const [mangaProgressIndex, setMangaProgressIndex] = useState<Map<string, LocalMangaProgress>>(new Map());
  const [mangaProgressLoading, setMangaProgressLoading] = useState(true);
  const lastLocalStoreRef = useRef<IndexedDBUserDataStore | null>(null);

  useEffect(() => {
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
  // Canonical Library Ops - write to local IDB + call Convex mutations
  // ============================================================================
  const canonicalLibraryOps: CanonicalLibraryOps = useMemo(() => ({
    getLibraryEntries: () => {
      console.log("[canonicalLibraryOps] getLibraryEntries() - localStoreRef.current.profileId:", localStoreRef.current.profileId);
      return localStoreRef.current.getLibraryEntries();
    },
    getLibraryItem: (id) => localStoreRef.current.getLibraryItem(id),
    getSourceLinksForItem: (id) => localStoreRef.current.getSourceLinksForLibraryItem(id),

    saveLibraryItem: async (item: LocalLibraryItem) => {
      const store = localStoreRef.current;
      const client = convexRef.current;
      const authed = isAuthenticatedRef.current;
      
      // Always save to local IDB first
      await store.saveLibraryItem(item);
      
      // If authenticated, also push to Convex (Convex handles offline queuing)
      if (authed && client) {
        await client.mutation(api.library.save, {
          mangaId: item.libraryItemId,
          addedAt: item.createdAt,
          metadata: item.metadata,
          normalizedOverrides: item.overrides,
          externalIds: item.externalIds,
          sources: [],
          sourcesMode: "merge",
        });
      }
    },

    removeLibraryItem: async (libraryItemId: string) => {
      const store = localStoreRef.current;
      const client = convexRef.current;
      const authed = isAuthenticatedRef.current;
      
      const existing = await store.getLibraryItem(libraryItemId);
      if (existing) {
        const updated: LocalLibraryItem = {
          ...existing,
          inLibrary: false,
          updatedAt: Date.now(),
        };
        await store.saveLibraryItem(updated);
        
        if (authed && client) {
          await client.mutation(api.library.remove, {
            mangaId: libraryItemId,
          });
        }
      }
    },

    saveSourceLink: async (link: LocalSourceLink) => {
      const store = localStoreRef.current;
      const client = convexRef.current;
      const authed = isAuthenticatedRef.current;
      
      await store.saveSourceLink(link);
      
      if (authed && client) {
        // Get library item to push with sources
        const item = await store.getLibraryItem(link.libraryItemId);
        if (item) {
          await client.mutation(api.library.save, {
            mangaId: link.libraryItemId,
            addedAt: item.createdAt,
            metadata: item.metadata,
            sources: [{
              registryId: link.registryId,
              sourceId: link.sourceId,
              mangaId: link.sourceMangaId,
              latestChapter: link.latestChapter,
              updateAcknowledged: link.updateAckChapter,
            }],
            sourcesMode: "merge",
          });
        }
      }
    },

    removeSourceLink: async (cursorId: string) => {
      const store = localStoreRef.current;
      
      const existing = await store.getSourceLink(cursorId);
      if (existing) {
        const updated: LocalSourceLink = { ...existing, deletedAt: Date.now(), updatedAt: Date.now() };
        await store.saveSourceLink(updated);
        // Note: Convex will get updated via subscription sync
      }
    },
  }), []); // Empty deps - uses refs

  // ============================================================================
  // History Store Ops
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
      const client = convexRef.current;
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
      
      // Push to Convex if authenticated
      if (authed && client) {
        await client.mutation(api.history.save, {
          registryId: entry.registryId,
          sourceId: entry.sourceId,
          mangaId: entry.mangaId,
          chapterId: entry.chapterId,
          progress: entry.progress,
          total: entry.total,
          completed: entry.completed,
          dateRead: entry.dateRead,
          chapterNumber: entry.chapterNumber,
          volumeNumber: entry.volumeNumber,
          chapterTitle: entry.chapterTitle,
        });
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
  // Settings Store Ops
  // ============================================================================
  const settingsOps: SettingsStoreOps = useMemo(() => ({
    getInstalledSources: () => localStoreRef.current.getInstalledSources(),
    getInstalledSource: (id: string) => localStoreRef.current.getInstalledSource(id),
    
    saveInstalledSource: async (source: Parameters<IndexedDBUserDataStore["saveInstalledSource"]>[0]) => {
      const store = localStoreRef.current;
      const client = convexRef.current;
      const authed = isAuthenticatedRef.current;
      
      await store.saveInstalledSource(source);
      
      if (authed && client) {
        const settings = await store.getSettings();
        await client.mutation(api.settings.save, settings);
      }
    },
    
    removeInstalledSource: async (id: string) => {
      const store = localStoreRef.current;
      const client = convexRef.current;
      const authed = isAuthenticatedRef.current;
      
      await store.removeInstalledSource(id);
      
      if (authed && client) {
        const settings = await store.getSettings();
        await client.mutation(api.settings.save, settings);
      }
    },
  }), []); // Empty deps - uses refs

  // ============================================================================
  // Stores (created once)
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
    
    Promise.all([
      stores.useSettingsStore.getState().initialize().then(() => {
        console.log("[SyncProvider] settingsStore.initialize() DONE after profile switch");
      }),
      stores.useLibraryStore.getState().load(false).then(() => {
        console.log("[SyncProvider] libraryStore.load() DONE after profile switch");
      }),
    ]);
    
    getSourceSettingsStore().getState().initialize();
  }, [localStore, stores, effectiveProfileId]);

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

        // Check if cloud is empty
        let cloudEmpty = false;
        try {
          const items = await convex.query(api.sync.libraryItemsAll, {});
          cloudEmpty = items.length === 0;
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
  }, [isAuthenticated, isLoading, session?.user?.id, localStore, convex]);

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
        
        await canonicalLibraryOps.saveLibraryItem(item);
        
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

    lastProfileIdRef.current = undefined;
    try {
      localStorage.removeItem(LAST_PROFILE_ID_KEY);
    } catch {}
    
    setSigningOut(true);
    subscriptionStoppedRef.current = true;
    
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
      await localProfile.saveSettings(settings as UserSettings);
      
      const verifyItems = await localProfile.getAllLibraryItems({ includeRemoved: true });
      console.log("[SignOut] Verification: local profile now has", verifyItems.length, "library items (including tombstones)");
    }
    
    console.log("[SignOut] Clearing cloud profile data...");
    await localStore.clearAccountData();
    try {
      if (session?.user?.id) localStorage.removeItem(`${IMPORT_DECISION_KEY_PREFIX}${session.user.id}`);
    } catch {}
    
    sessionStorage.removeItem(IMPORT_OFFERED_SESSION_KEY);
    syncStore.getState().reset();
    console.log("[SignOut] Sign out complete");
  }, [localStore, syncStore, effectiveProfileId, session?.user?.id]);

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
  // Context value
  // ============================================================================
  const value: SyncContextValue = useMemo(() => ({
    services: { localStore, cacheStore, registryManager },
    stores,
    isAuthenticated,
    isLoading,
    syncStatus,
    signOut,
    stopSync: async () => {
      subscriptionStoppedRef.current = true;
    },
    debugInfo: {
      sessionProfileId,
      effectiveProfileId,
      userDbName: effectiveProfileId ? `nemu-user::${effectiveProfileId}` : "nemu-user",
    },
    mangaProgressIndex,
    mangaProgressLoading,
    loadChapterProgress,
  }), [localStore, cacheStore, registryManager, stores, isAuthenticated, isLoading, syncStatus, signOut, sessionProfileId, effectiveProfileId, mangaProgressIndex, mangaProgressLoading, loadChapterProgress]);

  const idbDescription = idbBlocked?.kind === "versionchange"
    ? t("storage.idbLock.descriptionVersionChange")
    : t("storage.idbLock.descriptionBlocked");

  // Syncing dialog - shown during initial sync
  const showSyncingDialog = isAuthenticated && isSyncing && !signingOut;

  return (
    <SyncContext.Provider value={value}>
      {children}
      
      {/* Syncing dialog - shown during profile switch / initial sync */}
      <ResponsiveDialog open={showSyncingDialog} dismissible={false}>
        <ResponsiveDialogContent showCloseButton={false}>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>{t("sync.syncing")}</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>{t("sync.syncingDescription")}</ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <div className="flex justify-center py-4">
            <div className="relative">
              <div className="size-10 rounded-full border-4 border-muted" />
              <div className="absolute inset-0 size-10 rounded-full border-4 border-t-primary animate-spin" />
            </div>
          </div>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
      
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
