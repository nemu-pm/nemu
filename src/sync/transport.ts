/**
 * Sync transport types (Phase 8 - Simplified)
 *
 * Types for sync data structures.
 * No longer defines transport interface - Convex used directly.
 */

import type { MangaMetadata, ExternalIds, ChapterSummary, UserOverrides } from "@/data/schema";

// ============================================================================
// Sync types (used by subscriptions)
// ============================================================================

/**
 * Library item from sync (matches Convex library_items table).
 */
export interface SyncLibraryItem {
  cursorId: string; // = libraryItemId
  libraryItemId: string;
  metadata: MangaMetadata;
  externalIds?: ExternalIds;
  inLibrary?: boolean;
  inLibraryClock?: string;
  overrides?: UserOverrides;
  createdAt: number;
  updatedAt: number;
}

/**
 * Library source link from sync (matches Convex library_source_links table).
 */
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

/**
 * Chapter progress from sync (matches Convex chapter_progress table).
 */
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

/**
 * Manga progress from sync (matches Convex manga_progress table).
 * Note: manga_progress does NOT use soft-delete (no deletedAt field).
 */
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
}
