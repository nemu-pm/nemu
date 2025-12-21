import { useEffect, useState, useRef, useMemo, useCallback, type ReactNode } from "react";
import { useConvexAuth, useConvex, useQuery } from "convex/react";
import type { ConvexReactClient } from "convex/react";
import { IndexedDBUserDataStore } from "@/data/indexeddb";
import { IndexedDBCacheStore } from "@/data/cache";
import { RegistryManager } from "@/lib/sources/registry";
import { createLibraryStore } from "@/stores/library";
import { createHistoryStore } from "@/stores/history";
import { createSettingsStore } from "@/stores/settings";
import { getSourceSettingsStore } from "@/stores/source-settings";
import { getSyncStore } from "@/stores/sync";
import { authClient } from "@/lib/auth-client";
import { api } from "../../convex/_generated/api";
import { SyncContext } from "./context";
import { SyncEngine } from "./engine";
import type { DataServices, StoreHooks, SyncContextValue } from "./types";

// Re-export types and hooks
export type { DataServices, StoreHooks } from "./types";
// eslint-disable-next-line react-refresh/only-export-components
export { useDataServices, useStores, useAuth, useSyncContext, useSyncStatus, useSignOut, useSyncStore } from "./hooks";

// Track if initial merge has been done
const MERGED_KEY = "nemu:cloud-merged";

export function SyncProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const convex = useConvex();
  const syncStore = getSyncStore();
  const { data: session } = authClient.useSession();

  // Local stores (always available) - stable references
  const [localStore] = useState(() => new IndexedDBUserDataStore());
  const [cacheStore] = useState(() => new IndexedDBCacheStore());

  // Sync engine (stable reference)
  const [syncEngine] = useState(() => new SyncEngine(localStore));

  // Get sync status from store
  const syncStatus = syncStore((state) => state.syncStatus);
  const pendingCount = syncStore((state) => state.pendingCount);

  // Track auth state for store switching
  const [authKey, setAuthKey] = useState(0);
  const prevAuthRef = useRef<boolean | null>(null);
  const hasMerged = useRef(false);
  // Track signing out to skip queries before isAuthenticated updates
  const [signingOut, setSigningOut] = useState(false);

  // Subscribe to cloud data when authenticated (skip during sign-out to avoid race)
  const shouldQuery = isAuthenticated && !signingOut;
  const cloudLibrary = useQuery(api.library.list, shouldQuery ? {} : "skip");
  const cloudHistory = useQuery(api.history.getRecent, shouldQuery ? { limit: 1000 } : "skip");
  const cloudSettings = useQuery(api.settings.get, shouldQuery ? {} : "skip");
  const oauthProvider = useQuery(api.auth.getOAuthProvider, shouldQuery ? {} : "skip");

  // Initialize sync engine
  useEffect(() => {
    syncEngine.initialize(isAuthenticated ? (convex as ConvexReactClient) : undefined);

    const unsubStatus = syncEngine.onStatusChange((status) => {
      syncStore.getState().setSyncStatus(status);
      syncStore.getState().setPendingCount(syncEngine.pendingCount);
    });

    return () => {
      unsubStatus();
      syncEngine.dispose();
    };
    // Only run on mount/unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update sync engine when auth changes
  useEffect(() => {
    if (isLoading) return;

    if (isAuthenticated) {
      syncEngine.initialize(convex as ConvexReactClient);
    }
  }, [isAuthenticated, isLoading, convex, syncEngine]);

  // Update auth state in sync store
  useEffect(() => {
    syncStore.getState().setAuthState(isAuthenticated, isLoading);
  }, [isAuthenticated, isLoading, syncStore]);

  // Update user info in sync store
  useEffect(() => {
    if (session?.user) {
      syncStore.getState().setUser({
        id: session.user.id,
        name: session.user.name ?? null,
        email: session.user.email ?? "",
        image: session.user.image ?? null,
      });
    } else {
      syncStore.getState().setUser(null);
    }
  }, [session, syncStore]);

  // Update OAuth provider in sync store
  useEffect(() => {
    if (oauthProvider && typeof oauthProvider === "string") {
      syncStore.getState().setOAuthProvider(oauthProvider as "google" | "apple");
    } else {
      syncStore.getState().setOAuthProvider(null);
    }
  }, [oauthProvider, syncStore]);

  // Update auth key when auth state changes (after loading)
  useEffect(() => {
    if (isLoading) return;
    if (prevAuthRef.current !== null && prevAuthRef.current !== isAuthenticated) {
      setAuthKey((k) => k + 1);
    }
    prevAuthRef.current = isAuthenticated;
  }, [isAuthenticated, isLoading]);

  // Registry manager - stable reference
  const [registryManager] = useState(
    () => new RegistryManager(localStore, localStore, cacheStore)
  );

  // Create a sync-aware user store wrapper
  const syncAwareStore = useMemo(() => {
    return {
      getLibrary: () => localStore.getLibrary(),
      getLibraryManga: (id: string) => localStore.getLibraryManga(id),
      saveLibraryManga: (manga: Parameters<typeof localStore.saveLibraryManga>[0]) =>
        syncEngine.saveLibraryManga(manga),
      removeLibraryManga: (id: string) => syncEngine.removeLibraryManga(id),
      // History methods (separate from library)
      getHistoryEntry: (
        registryId: string,
        sourceId: string,
        mangaId: string,
        chapterId: string
      ) => localStore.getHistoryEntry(registryId, sourceId, mangaId, chapterId),
      saveHistoryEntry: (entry: Parameters<typeof localStore.saveHistoryEntry>[0]) =>
        syncEngine.saveHistoryEntry(entry),
      getMangaHistory: (registryId: string, sourceId: string, mangaId: string) =>
        localStore.getMangaHistory(registryId, sourceId, mangaId),
      getRecentHistory: (limit: number) => localStore.getRecentHistory(limit),
      // Settings
      getSettings: () => localStore.getSettings(),
      saveSettings: (settings: Parameters<typeof localStore.saveSettings>[0]) =>
        syncEngine.saveSettings(settings),
      getInstalledSources: () => localStore.getInstalledSources(),
      getInstalledSource: (id: string) => localStore.getInstalledSource(id),
      saveInstalledSource: async (source: Parameters<typeof localStore.saveInstalledSource>[0]) => {
        await localStore.saveInstalledSource(source);
        // Also sync settings
        const settings = await localStore.getSettings();
        await syncEngine.saveSettings(settings);
      },
      removeInstalledSource: async (id: string) => {
        await syncEngine.removeInstalledSource(id);
      },
      // Registries are local-only
      getRegistries: () => localStore.getRegistries(),
      getRegistry: (id: string) => localStore.getRegistry(id),
      saveRegistry: (registry: Parameters<typeof localStore.saveRegistry>[0]) =>
        localStore.saveRegistry(registry),
      removeRegistry: (id: string) => localStore.removeRegistry(id),
    };
  }, [localStore, syncEngine]);

  // Compute services and stores based on auth state
  const { services, stores } = useMemo(() => {
    // Update registry manager to use sync-aware store for installed sources
    registryManager.setInstalledSourceStore(syncAwareStore);

    const newStores: StoreHooks = {
      useLibraryStore: createLibraryStore(syncAwareStore),
      useHistoryStore: createHistoryStore(syncAwareStore),
      useSettingsStore: createSettingsStore(syncAwareStore, cacheStore, registryManager),
    };

    const newServices: DataServices = {
      userStore: syncAwareStore,
      localStore,
      cacheStore,
      registryManager,
    };

    return { services: newServices, stores: newStores };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authKey, localStore, cacheStore, registryManager, syncAwareStore]);

  // Merge local data on first sign-in
  useEffect(() => {
    if (!isAuthenticated || isLoading) return;
    if (hasMerged.current || sessionStorage.getItem(MERGED_KEY)) return;

    hasMerged.current = true;
    sessionStorage.setItem(MERGED_KEY, "true");

    syncEngine.onSignIn().then(() => {
      // Reload stores after merge
      stores.useLibraryStore.getState().load();
      stores.useSettingsStore.getState().initialize();
    });
  }, [isAuthenticated, isLoading, syncEngine, stores]);

  // Sync cloud library data to local and stores
  useEffect(() => {
    if (!isAuthenticated || !cloudLibrary) return;

    const { useLibraryStore } = stores;

    // Merge cloud data into local and update store
    syncEngine
      .mergeCloudLibrary(
        cloudLibrary.map((item) => ({
          mangaId: item.mangaId,
          title: item.title,
          cover: item.cover,
          addedAt: item.addedAt,
          sources: item.sources,
          activeRegistryId: item.activeRegistryId,
          activeSourceId: item.activeSourceId,
          lastReadChapter: item.lastReadChapter,
          lastReadAt: item.lastReadAt,
          latestChapter: item.latestChapter,
          seenLatestChapter: item.seenLatestChapter,
        }))
      )
      .then((mergedMangas) => {
        useLibraryStore.setState({ mangas: mergedMangas, loading: false });
      });
  }, [cloudLibrary, isAuthenticated, stores, syncEngine]);

  // Track if we've done initial history merge (only merge once per session)
  const historyMergedRef = useRef(false);

  // Sync cloud history data to local - ONLY on initial load
  // Subsequent subscription updates are echoes of our own writes - ignore them
  useEffect(() => {
    if (!isAuthenticated || !cloudHistory) return;
    if (historyMergedRef.current) return;
    
    historyMergedRef.current = true;
    syncEngine.mergeCloudHistory(
      cloudHistory.map((entry) => ({
        registryId: entry.registryId,
        sourceId: entry.sourceId,
        mangaId: entry.mangaId,
        chapterId: entry.chapterId,
        progress: entry.progress,
        total: entry.total,
        completed: entry.completed,
        dateRead: entry.dateRead,
      }))
    );
  }, [cloudHistory, isAuthenticated, syncEngine]);

  // Sync settings from cloud
  useEffect(() => {
    if (!isAuthenticated || !cloudSettings) return;

    const { useSettingsStore } = stores;

    // Merge installed sources
    localStore.getSettings().then((localSettings) => {
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

      useSettingsStore.setState({ installedSources: mergedSources });
    });
  }, [cloudSettings, isAuthenticated, stores, localStore]);

  // Initialize stores when they change
  useEffect(() => {
    stores.useSettingsStore.getState().initialize();
    stores.useLibraryStore.getState().load();
    // Initialize source settings store (for per-source settings persistence)
    getSourceSettingsStore().getState().initialize();
  }, [stores]);

  // Sign out handler
  const signOut = useCallback(
    async (clearLocal: boolean) => {
      // Set signing out immediately to skip queries before auth state updates
      setSigningOut(true);
      await syncEngine.onSignOut(clearLocal);
      sessionStorage.removeItem(MERGED_KEY);
      hasMerged.current = false;
      syncStore.getState().reset();
    },
    [syncEngine, syncStore]
  );

  // Reset signingOut when auth state changes to not-authenticated
  useEffect(() => {
    if (!isAuthenticated && signingOut) {
      setSigningOut(false);
    }
  }, [isAuthenticated, signingOut]);

  const value: SyncContextValue = useMemo(
    () => ({
      services,
      stores,
      isAuthenticated,
      isLoading,
      syncStatus,
      pendingCount,
      signOut,
    }),
    [services, stores, isAuthenticated, isLoading, syncStatus, pendingCount, signOut]
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}
