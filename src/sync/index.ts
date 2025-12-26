export { SyncProvider } from "./provider";
export {
  useSyncContext,
  useDataServices,
  useStores,
  useAuth,
  useSyncStatus,
  useSignOut,
} from "./hooks";
export type { DataServices, StoreHooks, SyncContextValue, MangaProgressIndex } from "./types";
export type { SyncStatus } from "./core/types";

// ============================================================================
// Phase 7: SyncCore (backend-agnostic sync orchestration)
// ============================================================================

export {
  SyncCore,
  DEFAULT_SYNC_CONFIG,
  CURSOR_KEYS,
  ZERO_CURSOR,
  applyLibraryItems,
  applySourceLinks,
  applyChapterProgress,
  applyMangaProgress,
  // Adapters
  createSyncMetaRepo,
  createPendingOpsRepo,
  createHLCManager,
  createLibraryItemRepo,
  createSourceLinkRepo,
  createChapterProgressRepo,
  createMangaProgressRepo,
  createSyncCoreRepos,
} from "./core";
export type {
  SyncCoreOptions,
  SyncCoreRepos,
  SyncMetaRepo,
  PendingOpsRepo,
  HLCManager,
  SyncRunReason,
  SyncCoreConfig,
  SyncCursors,
  SyncMetrics,
  SyncMetricsListener,
  PendingOp,
  LibraryItemRepo,
  SourceLinkRepo,
  ChapterProgressRepo,
  MangaProgressRepo,
  ApplyResult,
  SyncLibraryItemEntry,
  SyncSourceLinkEntry,
  SyncChapterProgressEntry,
  SyncMangaProgressEntry,
} from "./core";

// ============================================================================
// Transports
// ============================================================================

export type {
  SyncTransport,
  SyncLibraryItem,
  SyncLibrarySourceLink,
  SyncChapterProgress,
  SyncMangaProgress,
  PaginatedResponse,
  SyncAllResponse,
  SubscriptionHook,
  SubscriptionResult,
} from "./transport";

// Convex transport (kept for backward compatibility)
export {
  ConvexTransport,
  useConvexLibraryItemsSince,
  useConvexSourceLinksSince,
  useConvexChapterProgressSince,
  useConvexMangaProgressSince,
} from "./convex-transport";

// Null transport (logged-out mode)
export { NullTransport, nullTransport } from "./transports/NullTransport";

// Test transport (for testing)
export { TestTransport } from "./transports/TestTransport";

// React hook for SyncCore
export { useSyncCore } from "./useSyncCore";
export type { UseSyncCoreOptions, UseSyncCoreResult } from "./useSyncCore";

// ============================================================================
// HLC (Hybrid Logical Clock) for user-intent ordering
// ============================================================================

export {
  HLC,
  generateNodeId,
  createHLCState,
  formatIntentClock,
  parseIntentClock,
  compareIntentClocks,
  isClockNewer,
  maxClock,
  mergeFieldWithClock,
  mergeLibraryMembership,
  ZERO_CLOCK,
} from "./hlc";
export type { IntentClock, HLCState, ParsedIntentClock } from "./hlc";
