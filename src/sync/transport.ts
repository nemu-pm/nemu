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
  id: string; // = libraryItemId
  libraryItemId: string;
  metadata: MangaMetadata;
  externalIds?: ExternalIds;
  inLibrary?: boolean;
  overrides?: UserOverrides;
  createdAt: number;
  updatedAt: number;
}

/**
 * Library source link from sync (matches Convex library_source_links table).
 */
export interface SyncLibrarySourceLink {
  id: string; // "${registryId}:${sourceId}:${sourceMangaId}" (URL-encoded)
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
}

/**
 * Chapter progress from sync (matches Convex chapter_progress table).
 */
export interface SyncChapterProgress {
  id: string; // "${registryId}:${sourceId}:${sourceMangaId}:${sourceChapterId}" (URL-encoded)
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
}

/**
 * Manga progress from sync (matches Convex manga_progress table).
 */
export interface SyncMangaProgress {
  id: string; // "${registryId}:${sourceId}:${sourceMangaId}" (URL-encoded)
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
