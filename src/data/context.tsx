// Re-export from sync provider for backwards compatibility
// The SyncProvider now handles auth-aware store switching
export { SyncProvider as DataProvider } from "@/sync/provider";
// eslint-disable-next-line react-refresh/only-export-components
export { useDataServices, useStores, useAuth } from "@/sync/hooks";
export type { DataServices, StoreHooks } from "@/sync/types";
