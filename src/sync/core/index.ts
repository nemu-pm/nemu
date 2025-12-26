/**
 * Sync core module exports (Phase 7)
 */

// Core
export { SyncCore } from "./SyncCore";
export type {
  SyncCoreOptions,
  SyncCoreRepos,
  SyncMetaRepo,
  PendingOpsRepo,
  HLCManager,
  SettingsRepo,
} from "./SyncCore";

// Types
export type {
  SyncStatus,
  SyncRunReason,
  SyncCoreConfig,
  SyncCursors,
  SyncMetrics,
  SyncMetricsListener,
  PendingOp,
} from "./types";
export { DEFAULT_SYNC_CONFIG, CURSOR_KEYS, ZERO_CURSOR } from "./types";

// Apply functions
export {
  applyLibraryItems,
  applySourceLinks,
  applyChapterProgress,
  applyMangaProgress,
} from "./apply";
export type {
  LibraryItemRepo,
  SourceLinkRepo,
  ChapterProgressRepo,
  MangaProgressRepo,
  ApplyResult,
  SyncLibraryItemEntry,
  SyncSourceLinkEntry,
  SyncChapterProgressEntry,
  SyncMangaProgressEntry,
} from "./apply";

// Adapters (bridge IndexedDB to SyncCore interfaces)
export {
  createSyncMetaRepo,
  createPendingOpsRepo,
  createHLCManager,
  createLibraryItemRepo,
  createSourceLinkRepo,
  createChapterProgressRepo,
  createMangaProgressRepo,
  createSyncCoreRepos,
} from "./adapters";

