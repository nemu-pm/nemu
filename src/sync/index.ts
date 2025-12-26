/**
 * Sync module exports (Phase 8 - Subscription-based)
 *
 * Simplified exports - no more SyncCore, cursors, or HLC.
 * Convex subscriptions handle real-time sync directly.
 */

export { SyncProvider } from "./provider";
export {
  useSyncContext,
  useDataServices,
  useStores,
  useAuth,
  useSyncStatus,
  useSignOut,
  useMangaProgressIndex,
  useChapterProgress,
  useChapterProgressLoader,
} from "./hooks";
export type { DataServices, StoreHooks, SyncContextValue, MangaProgressIndex, SyncStatus } from "./types";

// Transport types (kept for type compatibility)
export type {
  SyncLibraryItem,
  SyncLibrarySourceLink,
  SyncChapterProgress,
  SyncMangaProgress,
} from "./transport";
