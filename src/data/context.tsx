// App-wide data access:
// - `DataServicesProvider` owns the lifetime of the current profile's services container.
// - hooks re-exported here are the stable surface the UI should consume.
export { DataServicesProvider, useDataServices, useStores, useSetProfileId, useProfileId, useProgressStoreApi } from "./services-provider";
export { useAuth, useSyncStatus, useSignOut, useSyncStore, useAllMangaProgress, useProgressLoading, useSourceLinkProgress, useChapterProgress, useChapterProgressLoader } from "@/sync/hooks";
export type { DataServices, StoreHooks, SyncStatus } from "@/sync/types";
