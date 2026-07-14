// App-wide data access:
// - `DataServicesProvider` owns the lifetime of the current profile's services container.
// - hooks re-exported here are the stable surface the UI should consume.
export {
  DataServicesProvider,
  useDataServices,
  useStores,
  useSetProfileId,
  useProfileId,
  useProgressStoreApi,
  // This module is the existing stable hook facade, so adding another hook
  // intentionally follows the same non-component export pattern.
  // eslint-disable-next-line react-refresh/only-export-components
  useSourceSettingsStoreApi,
} from "./services-provider";
export { useAuth, useSyncStatus, useSignOut, useSyncStore, useAllMangaProgress, useProgressLoading, useSourceLinkProgress, useChapterProgress, useChapterProgressLoader } from "@/sync/hooks";
export type { DataServices, StoreHooks, SyncStatus } from "@/sync/types";
