/**
 * Phase 6: Backfill cursorId for existing entries
 * 
 * This migration populates the cursorId field for entries that were created
 * before Phase 6 dual-write was implemented. Without this, the composite
 * cursor pagination will miss entries with undefined cursorId.
 * 
 * Run this once after deploying Phase 6 changes.
 */

import { mutation } from "../_generated/server";
import { v } from "convex/values";

/** Build cursorId for source links */
function makeSourceLinkCursorId(registryId: string, sourceId: string, sourceMangaId: string): string {
  return `${encodeURIComponent(registryId)}:${encodeURIComponent(sourceId)}:${encodeURIComponent(sourceMangaId)}`;
}

/** Build cursorId for chapter progress */
function makeChapterProgressCursorId(
  registryId: string,
  sourceId: string,
  sourceMangaId: string,
  sourceChapterId: string
): string {
  return `${encodeURIComponent(registryId)}:${encodeURIComponent(sourceId)}:${encodeURIComponent(sourceMangaId)}:${encodeURIComponent(sourceChapterId)}`;
}

/** Build cursorId for manga progress */
function makeMangaProgressCursorId(registryId: string, sourceId: string, sourceMangaId: string): string {
  return makeSourceLinkCursorId(registryId, sourceId, sourceMangaId);
}

/**
 * Backfill cursorId for library_source_links
 * Run with: npx convex run migrations/backfill_cursor_ids:backfillSourceLinks
 */
export const backfillSourceLinks = mutation({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;
    
    // Find entries without cursorId
    const entries = await ctx.db
      .query("library_source_links")
      .filter((q) => q.eq(q.field("cursorId"), undefined))
      .take(limit);

    let updated = 0;
    for (const entry of entries) {
      const cursorId = makeSourceLinkCursorId(
        entry.registryId,
        entry.sourceId,
        entry.sourceMangaId
      );
      await ctx.db.patch(entry._id, { cursorId });
      updated++;
    }

    return {
      updated,
      hasMore: entries.length === limit,
      message: `Updated ${updated} library_source_links entries`,
    };
  },
});

/**
 * Backfill cursorId for chapter_progress
 * Run with: npx convex run migrations/backfill_cursor_ids:backfillChapterProgress
 */
export const backfillChapterProgress = mutation({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;
    
    // Find entries without cursorId
    const entries = await ctx.db
      .query("chapter_progress")
      .filter((q) => q.eq(q.field("cursorId"), undefined))
      .take(limit);

    let updated = 0;
    for (const entry of entries) {
      const cursorId = makeChapterProgressCursorId(
        entry.registryId,
        entry.sourceId,
        entry.sourceMangaId,
        entry.sourceChapterId
      );
      await ctx.db.patch(entry._id, { cursorId });
      updated++;
    }

    return {
      updated,
      hasMore: entries.length === limit,
      message: `Updated ${updated} chapter_progress entries`,
    };
  },
});

/**
 * Backfill cursorId for manga_progress
 * Run with: npx convex run migrations/backfill_cursor_ids:backfillMangaProgress
 */
export const backfillMangaProgress = mutation({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;
    
    // Find entries without cursorId
    const entries = await ctx.db
      .query("manga_progress")
      .filter((q) => q.eq(q.field("cursorId"), undefined))
      .take(limit);

    let updated = 0;
    for (const entry of entries) {
      const cursorId = makeMangaProgressCursorId(
        entry.registryId,
        entry.sourceId,
        entry.sourceMangaId
      );
      await ctx.db.patch(entry._id, { cursorId });
      updated++;
    }

    return {
      updated,
      hasMore: entries.length === limit,
      message: `Updated ${updated} manga_progress entries`,
    };
  },
});

/**
 * Run all backfills until complete
 * Run with: npx convex run migrations/backfill_cursor_ids:backfillAll
 */
export const backfillAll = mutation({
  args: {},
  handler: async (ctx) => {
    const results = {
      sourceLinks: { updated: 0, hasMore: true },
      chapterProgress: { updated: 0, hasMore: true },
      mangaProgress: { updated: 0, hasMore: true },
    };

    // Backfill in batches
    const batchSize = 100;

    // Source links
    while (results.sourceLinks.hasMore) {
      const entries = await ctx.db
        .query("library_source_links")
        .filter((q) => q.eq(q.field("cursorId"), undefined))
        .take(batchSize);

      for (const entry of entries) {
        const cursorId = makeSourceLinkCursorId(
          entry.registryId,
          entry.sourceId,
          entry.sourceMangaId
        );
        await ctx.db.patch(entry._id, { cursorId });
        results.sourceLinks.updated++;
      }
      results.sourceLinks.hasMore = entries.length === batchSize;
    }

    // Chapter progress
    while (results.chapterProgress.hasMore) {
      const entries = await ctx.db
        .query("chapter_progress")
        .filter((q) => q.eq(q.field("cursorId"), undefined))
        .take(batchSize);

      for (const entry of entries) {
        const cursorId = makeChapterProgressCursorId(
          entry.registryId,
          entry.sourceId,
          entry.sourceMangaId,
          entry.sourceChapterId
        );
        await ctx.db.patch(entry._id, { cursorId });
        results.chapterProgress.updated++;
      }
      results.chapterProgress.hasMore = entries.length === batchSize;
    }

    // Manga progress
    while (results.mangaProgress.hasMore) {
      const entries = await ctx.db
        .query("manga_progress")
        .filter((q) => q.eq(q.field("cursorId"), undefined))
        .take(batchSize);

      for (const entry of entries) {
        const cursorId = makeMangaProgressCursorId(
          entry.registryId,
          entry.sourceId,
          entry.sourceMangaId
        );
        await ctx.db.patch(entry._id, { cursorId });
        results.mangaProgress.updated++;
      }
      results.mangaProgress.hasMore = entries.length === batchSize;
    }

    return {
      sourceLinks: results.sourceLinks.updated,
      chapterProgress: results.chapterProgress.updated,
      mangaProgress: results.mangaProgress.updated,
      message: "Backfill complete",
    };
  },
});

