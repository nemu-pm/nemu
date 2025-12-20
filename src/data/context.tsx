// Re-export from sync provider
// The SyncProvider now handles auth-aware store switching and cloud sync
export { SyncProvider as DataProvider } from "@/sync/provider";
// eslint-disable-next-line react-refresh/only-export-components
export { useDataServices, useStores, useAuth, useSyncStatus, useSignOut } from "@/sync/hooks";
export type { DataServices, StoreHooks, SyncStatus } from "@/sync";
