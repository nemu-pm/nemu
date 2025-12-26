import type { CacheStore } from "@/data/cache";
import type { IndexedDBUserDataStore } from "@/data/indexeddb";
import type { RegistryManager } from "@/lib/sources/registry";
import type { LibraryStore } from "@/stores/library";
import type { HistoryStore } from "@/stores/history";
import type { SettingsStore } from "@/stores/settings";
import type { SyncStatus } from "./core/types";
import type { LocalMangaProgress, LocalChapterProgress } from "@/data/schema";

export interface DataServices {
  localStore: IndexedDBUserDataStore;
  cacheStore: CacheStore;
  registryManager: RegistryManager;
}

export interface StoreHooks {
  useLibraryStore: LibraryStore;
  useHistoryStore: HistoryStore;
  useSettingsStore: SettingsStore;
}

/**
 * Manga progress index - keyed by cursorId (registryId:sourceId:sourceMangaId)
 * Provides fast lookup for "last read" info per source-manga
 */
export type MangaProgressIndex = Map<string, LocalMangaProgress>;

export interface SyncContextValue {
  services: DataServices;
  stores: StoreHooks;
  isAuthenticated: boolean;
  isLoading: boolean;
  // Sync v2 additions
  syncStatus: SyncStatus;
  pendingCount: number;
  signOut: (keepData: boolean) => Promise<void>;
  syncNow?: () => Promise<void>;
  getSyncDebugSnapshot?: () => Promise<unknown>;
  debugInfo?: {
    sessionProfileId?: string;
    effectiveProfileId?: string;
    userDbName: string;
    syncDbName: string;
  };
  // Canonical progress (replaces legacy libraryHistory)
  mangaProgressIndex: MangaProgressIndex;
  mangaProgressLoading: boolean;
  // On-demand chapter progress loader
  loadChapterProgress: (registryId: string, sourceId: string, sourceMangaId: string) => Promise<Record<string, LocalChapterProgress>>;
}
