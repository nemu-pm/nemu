import type { IndexedDBUserDataStore } from "@/data/indexeddb";
import type { LibraryStore } from "@/stores/library";
import type { HistoryStore } from "@/stores/history";
import type { SettingsStore } from "@/stores/settings";
import type { CollectionsStore } from "@/stores/collections";
/**
 * Sync status
 *
 * - offline: no network or not authenticated
 * - syncing: actively syncing data
 * - synced: all data is synced
 * - limit-exceeded: the account is too large for one snapshot round, or a
 *   server-side set limit was hit. Sync is stopped and needs user action or a
 *   retry; reporting this as "offline" hid a permanent failure behind a
 *   transient-looking label.
 * - upgrade-required: this bundle predates a required sync protocol field, so
 *   the page has to be reloaded before writes can succeed again.
 * - clock-invalid: the server rejected an implausible logical clock. Sync is
 *   stopped until the device date/time is corrected and the app reloads.
 */
export type SyncStatus =
  | "offline"
  | "syncing"
  | "synced"
  | "limit-exceeded"
  | "upgrade-required"
  | "clock-invalid";

export interface DataServices {
  /** Low-level storage - only for sync/auth operations */
  localStore: IndexedDBUserDataStore;
}

export interface StoreHooks {
  useLibraryStore: LibraryStore;
  useHistoryStore: HistoryStore;
  useSettingsStore: SettingsStore;
  useCollectionsStore: CollectionsStore;
}
