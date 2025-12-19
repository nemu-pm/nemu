import type { UserDataStore } from "@/data/store";
import type { CacheStore } from "@/data/cache";
import type { IndexedDBUserDataStore } from "@/data/indexeddb";
import type { RegistryManager } from "@/lib/sources/registry";
import type { LibraryStore } from "@/stores/library";
import type { HistoryStore } from "@/stores/history";
import type { SettingsStore } from "@/stores/settings";

export interface DataServices {
  userStore: UserDataStore;
  localStore: IndexedDBUserDataStore; // Always available for registries
  cacheStore: CacheStore;
  registryManager: RegistryManager;
}

export interface StoreHooks {
  useLibraryStore: LibraryStore;
  useHistoryStore: HistoryStore;
  useSettingsStore: SettingsStore;
}

export interface SyncContextValue {
  services: DataServices;
  stores: StoreHooks;
  isAuthenticated: boolean;
  isLoading: boolean;
}

