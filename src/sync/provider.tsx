import { useEffect, useState, useRef, useMemo, useCallback, type ReactNode } from "react";
import { useConvexAuth, useConvex, useQuery } from "convex/react";
import type { ConvexReactClient } from "convex/react";
import { IndexedDBUserDataStore } from "@/data/indexeddb";
import { IndexedDBCacheStore } from "@/data/cache";
import { RegistryManager } from "@/lib/sources/registry";
import { createLibraryStore } from "@/stores/library";
import { createHistoryStore } from "@/stores/history";
import { createSettingsStore } from "@/stores/settings";
import { api } from "../../convex/_generated/api";
import { SyncContext } from "./context";
import { SyncEngine, type SyncStatus } from "./engine";
import type { DataServices, StoreHooks, SyncContextValue } from "./types";

// Re-export types and hooks
export type { DataServices, StoreHooks } from "./types";
// eslint-disable-next-line react-refresh/only-export-components
export { useDataServices, useStores, useAuth, useSyncContext, useSyncStatus, useSignOut } from "./hooks";

// Track if initial merge has been done
const MERGED_KEY = "nemu:cloud-merged";

export function SyncProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const convex = useConvex();

  // Local stores (always available) - stable references
  const [localStore] = useState(() => new IndexedDBUserDataStore());
  const [cacheStore] = useState(() => new IndexedDBCacheStore());

  // Sync engine (stable reference)
  const [syncEngine] = useState(() => new SyncEngine(localStore));

  // Sync status
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("offline");
  const [pendingCount, setPendingCount] = useState(0);

  // Track auth state for store switching
  const [authKey, setAuthKey] = useState(0);
  const prevAuthRef = useRef<boolean | null>(null);
  const hasMerged = useRef(false);

  // Subscribe to cloud data when authenticated
  const cloudLibrary = useQuery(api.library.list, isAuthenticated ? {} : "skip");
  const cloudSettings = useQuery(api.settings.get, isAuthenticated ? {} : "skip");

  // Initialize sync engine
  useEffect(() => {
    syncEngine.initialize(isAuthenticated ? (convex as ConvexReactClient) : undefined);

    const unsubStatus = syncEngine.onStatusChange((status) => {
      setSyncStatus(status);
      setPendingCount(syncEngine.pendingCount);
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
      getChapterProgress: (mangaId: string, chapterId: string) =>
        localStore.getChapterProgress(mangaId, chapterId),
      saveChapterProgress: (
        mangaId: string,
        chapterId: string,
        progress: Parameters<typeof localStore.saveChapterProgress>[2]
      ) => syncEngine.saveChapterProgress(mangaId, chapterId, progress),
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
          history: item.history as Record<
            string,
            { progress: number; total: number; completed: boolean; dateRead: number }
          >,
        }))
      )
      .then((mergedMangas) => {
        useLibraryStore.setState({ mangas: mergedMangas, loading: false });
      });
  }, [cloudLibrary, isAuthenticated, stores, syncEngine]);

  // Sync settings from cloud
  useEffect(() => {
    if (!isAuthenticated || !cloudSettings) return;

    const { useSettingsStore } = stores;

    // Settings use last-write-wins for readingMode
    // Installed sources already merged by SyncEngine
    useSettingsStore.setState({
      readingMode: cloudSettings.readingMode,
    });

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
  }, [stores]);

  // Sign out handler
  const signOut = useCallback(
    async (clearLocal: boolean) => {
      await syncEngine.onSignOut(clearLocal);
      sessionStorage.removeItem(MERGED_KEY);
      hasMerged.current = false;
    },
    [syncEngine]
  );

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
