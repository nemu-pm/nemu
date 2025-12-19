import { useEffect, useState, useRef, useMemo, type ReactNode } from "react";
import { useConvexAuth, useConvex, useQuery } from "convex/react";
import type { ConvexReactClient } from "convex/react";
import { IndexedDBUserDataStore } from "@/data/indexeddb";
import { IndexedDBCacheStore } from "@/data/cache";
import { ConvexUserDataStore } from "@/data/convex";
import { RegistryManager } from "@/lib/sources/registry";
import { createLibraryStore } from "@/stores/library";
import { createHistoryStore } from "@/stores/history";
import { createSettingsStore } from "@/stores/settings";
import { api } from "../../convex/_generated/api";
import { SyncContext } from "./context";
import type { DataServices, StoreHooks, SyncContextValue } from "./types";

// Re-export types and hooks
export type { DataServices, StoreHooks } from "./types";
// eslint-disable-next-line react-refresh/only-export-components
export { useDataServices, useStores, useAuth, useSyncContext } from "./hooks";

/**
 * Merge local data to cloud on first sign-in
 */
async function mergeLocalToCloud(
  local: IndexedDBUserDataStore,
  cloud: ConvexUserDataStore
): Promise<void> {
  try {
    const [localLibrary, localSettings] = await Promise.all([
      local.getLibrary(),
      local.getSettings(),
    ]);

    const [cloudLibrary, cloudSettings] = await Promise.all([
      cloud.getLibrary(),
      cloud.getSettings(),
    ]);

    // Upload local-only manga (cloud wins for conflicts)
    const cloudIds = new Set(cloudLibrary.map((m) => m.id));
    for (const manga of localLibrary) {
      if (!cloudIds.has(manga.id)) {
        await cloud.saveLibraryManga(manga);
      }
    }

    // Merge installed sources (union, cloud wins for version conflicts)
    const cloudSourceIds = new Set(
      cloudSettings.installedSources.map((s) => s.id)
    );
    const newSources = localSettings.installedSources.filter(
      (s) => !cloudSourceIds.has(s.id)
    );

    if (newSources.length > 0) {
      await cloud.saveSettings({
        ...cloudSettings,
        installedSources: [...cloudSettings.installedSources, ...newSources],
      });
    }
  } catch (error) {
    console.error("[SyncProvider] Merge failed:", error);
  }
}

// Merged first sign-in key
const MERGED_KEY = "nemu:cloud-merged";

export function SyncProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const convex = useConvex();

  // Local stores (always available) - stable references
  const [localStore] = useState(() => new IndexedDBUserDataStore());
  const [cacheStore] = useState(() => new IndexedDBCacheStore());

  // Track auth state for store switching
  const [authKey, setAuthKey] = useState(0);
  const prevAuthRef = useRef<boolean | null>(null);

  // Track if we've merged for this session
  const hasMerged = useRef(false);

  // Subscribe to cloud data when authenticated
  const cloudLibrary = useQuery(api.library.list, isAuthenticated ? {} : "skip");
  const cloudSettings = useQuery(api.settings.get, isAuthenticated ? {} : "skip");

  // Update auth key when auth state changes (after loading)
  useEffect(() => {
    if (isLoading) return;
    if (prevAuthRef.current !== null && prevAuthRef.current !== isAuthenticated) {
      setAuthKey((k) => k + 1);
    }
    prevAuthRef.current = isAuthenticated;
  }, [isAuthenticated, isLoading]);

  // Registry manager - stable reference, but updates its installed source store
  const [registryManager] = useState(
    () => new RegistryManager(localStore, localStore, cacheStore)
  );

  // Compute services and stores based on auth state
  const { services, stores } = useMemo(() => {
    const userStore = isAuthenticated
      ? new ConvexUserDataStore(convex as ConvexReactClient)
      : localStore;

    // Update registry manager to use correct store for installed sources
    registryManager.setInstalledSourceStore(userStore);

    const newStores: StoreHooks = {
      useLibraryStore: createLibraryStore(userStore),
      useHistoryStore: createHistoryStore(userStore),
      useSettingsStore: createSettingsStore(userStore, cacheStore, registryManager),
    };

    const newServices: DataServices = {
      userStore,
      localStore,
      cacheStore,
      registryManager,
    };

    return { services: newServices, stores: newStores };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, authKey, convex, localStore, cacheStore, registryManager]);

  // Merge local data on first sign-in
  useEffect(() => {
    if (!isAuthenticated || isLoading) return;
    if (hasMerged.current || sessionStorage.getItem(MERGED_KEY)) return;

    hasMerged.current = true;
    sessionStorage.setItem(MERGED_KEY, "true");
    mergeLocalToCloud(localStore, services.userStore as ConvexUserDataStore);
  }, [isAuthenticated, isLoading, localStore, services.userStore]);

  // Sync cloud library data to stores
  useEffect(() => {
    if (!isAuthenticated || !cloudLibrary) return;

    const { useLibraryStore } = stores;
    const currentMangas = useLibraryStore.getState().mangas;

    // Only update if data actually changed
    const cloudIds = new Set(cloudLibrary.map((m) => m.mangaId));
    const localIds = new Set(currentMangas.map((m) => m.id));

    const hasChanges =
      cloudLibrary.length !== currentMangas.length ||
      [...cloudIds].some((id) => !localIds.has(id));

    if (hasChanges) {
      const mangas = cloudLibrary.map((item) => ({
        id: item.mangaId,
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
      }));
      useLibraryStore.setState({ mangas, loading: false });
    }
  }, [cloudLibrary, isAuthenticated, stores]);

  // Sync settings from cloud
  useEffect(() => {
    if (!isAuthenticated || !cloudSettings) return;

    const { useSettingsStore } = stores;
    useSettingsStore.setState({
      readingMode: cloudSettings.readingMode,
      installedSources: cloudSettings.installedSources,
    });
  }, [cloudSettings, isAuthenticated, stores]);

  // Initialize stores when they change
  useEffect(() => {
    stores.useSettingsStore.getState().initialize();
    stores.useLibraryStore.getState().load();
  }, [stores]);

  const value: SyncContextValue = useMemo(
    () => ({ services, stores, isAuthenticated, isLoading }),
    [services, stores, isAuthenticated, isLoading]
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}
