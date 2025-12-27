import type { IndexedDBUserDataStore } from "@/data/indexeddb";
import type { LibraryStore } from "@/stores/library";
import type { HistoryStore } from "@/stores/history";
import type { SettingsStore } from "@/stores/settings";
/**
 * Sync status
 * 
 * - offline: no network or not authenticated
 * - syncing: actively syncing data
 * - synced: all data is synced
 */
export type SyncStatus = "offline" | "syncing" | "synced";

export interface DataServices {
  /** Low-level storage - only for sync/auth operations */
  localStore: IndexedDBUserDataStore;
}

export interface StoreHooks {
  useLibraryStore: LibraryStore;
  useHistoryStore: HistoryStore;
  useSettingsStore: SettingsStore;
}
