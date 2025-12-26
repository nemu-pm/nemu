/**
 * SyncTransport abstraction (sync.md)
 *
 * This interface decouples sync logic from Convex.
 * The rest of the app depends only on SyncTransport, not on Convex types.
 *
 * Features:
 * - Uses composite cursor { updatedAt: number, cursorId: string } for deterministic pagination
 * - All sync types include cursorId for idempotent upserts
 * - HLC-based IntentClock fields for user-intent ordering
 *
 * Future implementations:
 * - HttpTransport (self-hosted REST + polling/WebSocket)
 * - SqliteTransport (local sync server backed by SQLite)
 */

import type { MangaMetadata, ExternalIds, ChapterSummary, CompositeCursor, UserOverrides } from "@/data/schema";
import type { UserSettings } from "@/data/schema";

// Re-export for convenience
export type { CompositeCursor } from "@/data/schema";

// ============================================================================
// Sync types (transport-agnostic)
// ============================================================================

/**
 * Library item from sync (matches ideal schema library_items).
 * Uses HLC-based IntentClock fields for user-intent ordering.
 */
export interface SyncLibraryItem {
  cursorId: string; // = libraryItemId
  libraryItemId: string;
  metadata: MangaMetadata;
  externalIds?: ExternalIds;

  // Library membership state
  inLibrary?: boolean; // Default true
  inLibraryClock?: string; // IntentClock

  // User overrides (normalized shape)
  // Contains both metadata overrides and cover override with independent clocks
  overrides?: UserOverrides;

  // Sync fields
  createdAt: number;
  updatedAt: number;
}

/** Library source link from sync (matches ideal schema library_source_links) */
export interface SyncLibrarySourceLink {
  cursorId: string; // "${registryId}:${sourceId}:${sourceMangaId}" (URL-encoded)
  libraryItemId: string;
  registryId: string;
  sourceId: string;
  sourceMangaId: string;
  latestChapter?: ChapterSummary;
  latestChapterSortKey?: string;
  latestFetchedAt?: number;
  updateAckChapter?: ChapterSummary;
  updateAckChapterSortKey?: string;
  updateAckAt?: number;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

/** Chapter progress from sync (matches ideal schema chapter_progress) */
export interface SyncChapterProgress {
  cursorId: string; // "${registryId}:${sourceId}:${sourceMangaId}:${sourceChapterId}" (URL-encoded)
  registryId: string;
  sourceId: string;
  sourceMangaId: string;
  sourceChapterId: string;
  libraryItemId?: string;
  progress: number;
  total: number;
  completed: boolean;
  lastReadAt: number;
  chapterNumber?: number;
  volumeNumber?: number;
  chapterTitle?: string;
  updatedAt: number;
  deletedAt?: number;
}

/** Manga progress from sync (materialized summary - matches ideal schema manga_progress) */
export interface SyncMangaProgress {
  cursorId: string; // "${registryId}:${sourceId}:${sourceMangaId}" (URL-encoded)
  registryId: string;
  sourceId: string;
  sourceMangaId: string;
  libraryItemId?: string;
  lastReadAt: number;
  lastReadSourceChapterId?: string;
  lastReadChapterNumber?: number;
  lastReadVolumeNumber?: number;
  lastReadChapterTitle?: string;
  updatedAt: number;
  deletedAt?: number;
}

/** Generic paginated response (uses composite cursor) */
export interface PaginatedResponse<T> {
  entries: T[];
  nextCursor?: CompositeCursor;
  hasMore: boolean;
}

/** Combined sync response (for batched pulls) */
export interface SyncAllResponse {
  libraryItems: SyncLibraryItem[];
  sourceLinks: SyncLibrarySourceLink[];
  chapterProgress: SyncChapterProgress[];
  mangaProgress: SyncMangaProgress[];
  nextCursor?: CompositeCursor;
  hasMore: boolean;
}

// ============================================================================
// Push types (client → server)
// ============================================================================

/** Library item to push */
export interface PushLibraryItem {
  libraryItemId: string;
  metadata: MangaMetadata;
  // Normalized overrides shape
  overrides?: {
    metadata?: Partial<MangaMetadata> | null;
    metadataClock?: string;
    coverUrl?: string | null;
    coverUrlClock?: string;
  };
  externalIds?: ExternalIds;
  inLibrary?: boolean;
  inLibraryClock?: string;
  createdAt: number;
  deletedAt?: number;
}

/** Library source link to push */
export interface PushLibrarySourceLink {
  libraryItemId: string;
  registryId: string;
  sourceId: string;
  sourceMangaId: string;
  latestChapter?: ChapterSummary;
  latestChapterSortKey?: string;
  latestFetchedAt?: number;
  updateAckChapter?: ChapterSummary;
  updateAckChapterSortKey?: string;
  updateAckAt?: number;
  deletedAt?: number;
}

/** Chapter progress to push */
export interface PushChapterProgress {
  registryId: string;
  sourceId: string;
  sourceMangaId: string;
  sourceChapterId: string;
  libraryItemId?: string;
  progress: number;
  total: number;
  completed: boolean;
  lastReadAt: number;
  chapterNumber?: number;
  volumeNumber?: number;
  chapterTitle?: string;
}

// ============================================================================
// Subscription types (reactive queries)
// ============================================================================

/**
 * Subscription result - matches React Query / Convex useQuery pattern.
 * Undefined = loading, value = data ready.
 */
export type SubscriptionResult<T> = T | undefined;

/**
 * Subscription hook type - React hook that returns reactive data.
 * The transport implementation decides how to make it reactive:
 * - Convex: useQuery
 * - HTTP: polling + useState
 * - WebSocket: subscription + useState
 */
export type SubscriptionHook<TArgs, TResult> = (
  args: TArgs | "skip"
) => SubscriptionResult<TResult>;

// ============================================================================
// Legacy full-snapshot types (for backwards compat during migration)
// ============================================================================

/** Legacy cloud library item (full snapshot) */
export interface CloudLibraryItem {
  mangaId: string;
  addedAt: number;
  metadata: MangaMetadata;
  overrides?: Partial<MangaMetadata>;
  coverCustom?: string;
  externalIds?: ExternalIds;
  sources: Array<{
    registryId: string;
    sourceId: string;
    mangaId: string;
    latestChapter?: ChapterSummary;
    updateAcknowledged?: ChapterSummary;
  }>;
  updatedAt?: number;
  deletedAt?: number;
}

/** Legacy cloud settings */
export interface CloudSettings {
  installedSources: Array<{
    id: string;
    registryId: string;
    version: number;
    lang?: string;
  }>;
  updatedAt?: number;
}

/** Legacy cloud history entry */
export interface CloudHistoryEntry {
  registryId: string;
  sourceId: string;
  mangaId: string;
  chapterId: string;
  progress: number;
  total: number;
  completed: boolean;
  dateRead: number;
  updatedAt: number;
  chapterNumber?: number;
  volumeNumber?: number;
  chapterTitle?: string;
}

// ============================================================================
// SyncTransport interface
// ============================================================================

/**
 * Transport abstraction for sync operations.
 *
 * Two modes of operation:
 * 1. Pull methods: one-shot fetch (for catch-up, manual sync)
 * 2. Subscription hooks: reactive queries (for real-time UI updates)
 *
 * Push methods: send local changes to server.
 */
export interface SyncTransport {
  // ============ Reactive Subscriptions (React hooks) ============

  /**
   * Hook to subscribe to library items since cursor.
   * Returns undefined while loading, paginated response when ready.
   */
  useLibraryItemsSince: SubscriptionHook<
    { cursor: CompositeCursor; limit?: number },
    PaginatedResponse<SyncLibraryItem>
  >;

  /**
   * Hook to subscribe to source links since cursor.
   */
  useSourceLinksSince: SubscriptionHook<
    { cursor: CompositeCursor; limit?: number },
    PaginatedResponse<SyncLibrarySourceLink>
  >;

  /**
   * Hook to subscribe to chapter progress since cursor.
   */
  useChapterProgressSince: SubscriptionHook<
    { cursor: CompositeCursor; limit?: number },
    PaginatedResponse<SyncChapterProgress>
  >;

  /**
   * Hook to subscribe to manga progress since cursor.
   */
  useMangaProgressSince: SubscriptionHook<
    { cursor: CompositeCursor; limit?: number },
    PaginatedResponse<SyncMangaProgress>
  >;

  // ============ Legacy Full-Snapshot Subscriptions ============
  // These return full data (not deltas) for backwards compat during migration

  /**
   * Hook to get full library (legacy full-snapshot subscription).
   */
  useLibrary: SubscriptionHook<Record<string, never>, CloudLibraryItem[]>;

  /**
   * Hook to get settings (legacy full-snapshot subscription).
   */
  useSettings: SubscriptionHook<Record<string, never>, CloudSettings>;

  /**
   * Hook to get history since cursor (legacy incremental subscription).
   */
  useHistorySince: SubscriptionHook<
    { cursor: number; limit?: number },
    { entries: CloudHistoryEntry[]; nextCursor?: number; hasMore: boolean }
  >;

  /**
   * Hook to get OAuth provider.
   */
  useOAuthProvider: SubscriptionHook<Record<string, never>, string | null>;

  // ============ One-shot Pull (server → client) ============

  /**
   * Pull library items since cursor (one-shot, non-reactive).
   * Use for catch-up sync after offline period.
   */
  pullLibraryItems(
    cursor: CompositeCursor,
    limit?: number
  ): Promise<PaginatedResponse<SyncLibraryItem>>;

  /**
   * Pull library source links since cursor.
   */
  pullSourceLinks(
    cursor: CompositeCursor,
    limit?: number
  ): Promise<PaginatedResponse<SyncLibrarySourceLink>>;

  /**
   * Pull chapter progress since cursor.
   */
  pullChapterProgress(
    cursor: CompositeCursor,
    limit?: number
  ): Promise<PaginatedResponse<SyncChapterProgress>>;

  /**
   * Pull manga progress since cursor.
   */
  pullMangaProgress(
    cursor: CompositeCursor,
    limit?: number
  ): Promise<PaginatedResponse<SyncMangaProgress>>;

  /**
   * Pull all sync data since cursor (batched).
   * Useful for initial sync or catching up after offline period.
   */
  pullAll(cursor: CompositeCursor, limit?: number): Promise<SyncAllResponse>;

  /**
   * Pull settings (full snapshot).
   * Settings are small; no cursor/pagination.
   */
  pullSettings(): Promise<UserSettings>;

  // ============ Push (client → server) ============

  /**
   * Push a library item (create/update).
   * Server handles upsert logic.
   */
  pushLibraryItem(item: PushLibraryItem): Promise<void>;

  /**
   * Push a library source link (create/update).
   * Server handles upsert logic.
   */
  pushSourceLink(link: PushLibrarySourceLink): Promise<void>;

  /**
   * Push chapter progress (create/update with high-water mark merge).
   * Server handles merge semantics.
   */
  pushChapterProgress(progress: PushChapterProgress): Promise<void>;

  /**
   * Push settings (full replace for now).
   * Used for installed sources sync.
   */
  pushSettings(settings: UserSettings): Promise<void>;

  /**
   * Delete a library item (soft delete via tombstone).
   */
  deleteLibraryItem(libraryItemId: string, inLibraryClock: string): Promise<void>;

  /**
   * Delete a library source link (soft delete via tombstone).
   */
  deleteSourceLink(
    libraryItemId: string,
    registryId: string,
    sourceId: string,
    sourceMangaId: string
  ): Promise<void>;

  // ============ Lifecycle ============

  /** Start the transport (connect, authenticate, etc.) */
  start(): Promise<void>;

  /** Stop the transport (disconnect, cleanup) */
  stop(): Promise<void>;

  /** Check if transport is connected/ready */
  isReady(): boolean;
}

