/**
 * Sync module exports
 * 
 * Architecture:
 * - services.ts: Module singletons (no React)
 * - setup.tsx: SyncSetup component (has hooks, renders dialogs)
 * - hooks.ts: Consumer hooks (direct imports, Zustand selectors)
 */

// Setup component (sibling to app tree)
export { SyncSetup } from "./setup";

// Services (module singletons)
export {
  cacheStore,
  createServicesContainer,
  type ServicesContainer,
  signOut,
  loadChapterProgress,
  getDebugInfo,
  makeProfileId,
} from "./services";

// Hooks
export {
  useDataServices,
  useStores,
  useAuth,
  useSyncStatus,
  useSignOut,
  useSyncStore,
  useAllMangaProgress,
  useProgressLoading,
  useSourceLinkProgress,
  useChapterProgress,
  useChapterProgressLoader,
} from "./hooks";

// Types
export type { DataServices, StoreHooks, SyncStatus } from "./types";

// Transport types (kept for type compatibility)
export type {
  SyncLibraryItem,
  SyncLibrarySourceLink,
  SyncChapterProgress,
  SyncMangaProgress,
} from "./transport";
