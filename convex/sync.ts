/**
 * Phase 8: Full snapshot queries (subscription-based sync)
 *
 * Simplified endpoints that return full data snapshots.
 * Convex subscriptions handle real-time updates automatically.
 *
 * NO cursors, NO pagination - just simple queries.
 */

import { query } from "./_generated/server";
import { requireAuth } from "./_lib";

/**
 * Get all library items for the user (full snapshot).
 */
export const libraryItemsAll = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);

    const items = await ctx.db
      .query("library_items")
      .withIndex("by_user_item", (q) => q.eq("userId", userId))
      .collect();

    // Filter legacy soft-deleted rows if any still exist; canonical deletion is hard-delete.
    const live = items.filter((e) => e.inLibrary !== false);

    return live.map((e) => ({
      id: e.libraryItemId,
      libraryItemId: e.libraryItemId,
      metadata: e.metadata,
      externalIds: e.externalIds,
      inLibrary: e.inLibrary,
      overrides: e.overrides,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }));
  },
});

/**
 * Get all source links for the user (full snapshot).
 */
export const sourceLinksAll = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);

    const links = await ctx.db
      .query("library_source_links")
      .withIndex("by_user_item", (q) => q.eq("userId", userId))
      .collect();

    return links.map((e) => ({
      id: `${encodeURIComponent(e.registryId)}:${encodeURIComponent(e.sourceId)}:${encodeURIComponent(e.sourceMangaId)}`,
      libraryItemId: e.libraryItemId,
      registryId: e.registryId,
      sourceId: e.sourceId,
      sourceMangaId: e.sourceMangaId,
      latestChapter: e.latestChapter,
      latestChapterSortKey: e.latestChapterSortKey,
      latestFetchedAt: e.latestFetchedAt,
      updateAckChapter: e.updateAckChapter,
      updateAckChapterSortKey: e.updateAckChapterSortKey,
      updateAckAt: e.updateAckAt,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }));
  },
});

/**
 * Get all chapter progress for the user (full snapshot).
 */
export const chapterProgressAll = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);

    const progress = await ctx.db
      .query("chapter_progress")
      .withIndex("by_user_updated", (q) => q.eq("userId", userId))
      .collect();

    return progress.map((e) => ({
      id: `${encodeURIComponent(e.registryId)}:${encodeURIComponent(e.sourceId)}:${encodeURIComponent(e.sourceMangaId)}:${encodeURIComponent(e.sourceChapterId)}`,
      registryId: e.registryId,
      sourceId: e.sourceId,
      sourceMangaId: e.sourceMangaId,
      sourceChapterId: e.sourceChapterId,
      libraryItemId: e.libraryItemId,
      progress: e.progress,
      total: e.total,
      completed: e.completed,
      lastReadAt: e.lastReadAt,
      chapterNumber: e.chapterNumber,
      volumeNumber: e.volumeNumber,
      chapterTitle: e.chapterTitle,
      updatedAt: e.updatedAt,
    }));
  },
});

/**
 * Get all manga progress for the user (full snapshot).
 */
export const mangaProgressAll = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);

    const progress = await ctx.db
      .query("manga_progress")
      .withIndex("by_user_updated", (q) => q.eq("userId", userId))
      .collect();

    return progress.map((e) => ({
      id: `${encodeURIComponent(e.registryId)}:${encodeURIComponent(e.sourceId)}:${encodeURIComponent(e.sourceMangaId)}`,
      registryId: e.registryId,
      sourceId: e.sourceId,
      sourceMangaId: e.sourceMangaId,
      libraryItemId: e.libraryItemId,
      lastReadAt: e.lastReadAt,
      lastReadSourceChapterId: e.lastReadSourceChapterId,
      lastReadChapterNumber: e.lastReadChapterNumber,
      lastReadVolumeNumber: e.lastReadVolumeNumber,
      lastReadChapterTitle: e.lastReadChapterTitle,
      updatedAt: e.updatedAt,
    }));
  },
});
