/**
 * Phase 4 + Phase 6: Incremental sync endpoints (sync.md)
 *
 * Cursor-based `listSince` queries for all new tables.
 *
 * Phase 6 upgrades:
 * - Uses composite cursor { updatedAt: number, cursorId: string } for deterministic pagination
 * - Query: (updatedAt > cursor.updatedAt) OR (updatedAt == cursor.updatedAt AND cursorId > cursor.cursorId)
 * - Returns cursorId for each entry to enable client-side idempotent upserts
 *
 * All queries:
 * - Are ordered by (updatedAt, cursorId) ascending
 * - Return `nextCursor` for pagination (last entry's { updatedAt, cursorId })
 * - Support optional `limit` parameter (default 100, max 500)
 */

import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireAuth } from "./_lib";

// ============================================================================
// Phase 6: Composite cursor type and helpers
// ============================================================================

const compositeCursorValidator = v.object({
  updatedAt: v.number(),
  cursorId: v.string(),
});

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
  return `${encodeURIComponent(registryId)}:${encodeURIComponent(sourceId)}:${encodeURIComponent(sourceMangaId)}`;
}

// ============================================================================
// library_items.listSince (Phase 6: composite cursor)
// ============================================================================

export const libraryItemsListSince = query({
  args: {
    // Phase 6: Support both legacy (number) and new composite cursor
    cursor: v.optional(v.union(v.number(), compositeCursorValidator)),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const limit = Math.min(args.limit ?? 100, 500);

    // Phase 6: Parse cursor (backward compatible)
    const cursorUpdatedAt = typeof args.cursor === "number"
      ? args.cursor
      : args.cursor?.updatedAt ?? 0;
    const cursorId = typeof args.cursor === "object" ? args.cursor.cursorId : "";

    // Phase 6: Two-phase query for composite cursor correctness
    // IMPORTANT: fetch tie-breakers FIRST so we never skip rows at cursor boundaries.
    // 1) Entries with updatedAt == cursorUpdatedAt AND libraryItemId > cursorId
    // 2) Entries with updatedAt > cursorUpdatedAt
    const entriesAtTimestamp = await ctx.db
      .query("library_items")
      .withIndex("by_user_cursor", (q) =>
        q.eq("userId", userId).eq("updatedAt", cursorUpdatedAt).gt("libraryItemId", cursorId)
      )
      .order("asc")
      .take(limit + 1);

    const remaining = Math.max(0, limit + 1 - entriesAtTimestamp.length);
    const entriesAfterTimestamp =
      remaining > 0
        ? await ctx.db
            .query("library_items")
            .withIndex("by_user_cursor", (q) =>
              q.eq("userId", userId).gt("updatedAt", cursorUpdatedAt)
            )
            .order("asc")
            .take(remaining)
        : [];

    const allEntries = [...entriesAtTimestamp, ...entriesAfterTimestamp];
    const hasMore = allEntries.length > limit;
    const results = hasMore ? allEntries.slice(0, limit) : allEntries;
    const lastEntry = results[results.length - 1];

    // Phase 6: Composite cursor for next page
    const nextCursor = hasMore && lastEntry
      ? { updatedAt: lastEntry.updatedAt, cursorId: lastEntry.libraryItemId }
      : undefined;

    return {
      entries: results.map((e) => ({
        // cursorId = libraryItemId for this table
        cursorId: e.libraryItemId,
        libraryItemId: e.libraryItemId,
        metadata: e.metadata,
        externalIds: e.externalIds,
        // Library membership state (HLC-based)
        inLibrary: e.inLibrary,
        inLibraryClock: e.inLibraryClock,
        // Phase 6.5.5: Normalized overrides shape
        overrides: e.overrides,
        // Sync timestamps
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
      })),
      nextCursor,
      hasMore,
    };
  },
});

// ============================================================================
// library_source_links.listSince (Phase 6: composite cursor)
// ============================================================================

export const librarySourceLinksListSince = query({
  args: {
    cursor: v.optional(v.union(v.number(), compositeCursorValidator)),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const limit = Math.min(args.limit ?? 100, 500);

    const cursorUpdatedAt = typeof args.cursor === "number"
      ? args.cursor
      : args.cursor?.updatedAt ?? 0;
    const cursorIdValue = typeof args.cursor === "object" ? args.cursor.cursorId : "";

    // Phase 6: Two-phase query for composite cursor (tie-breakers first)
    const entriesAtTimestamp = await ctx.db
      .query("library_source_links")
      .withIndex("by_user_cursor", (q) =>
        q.eq("userId", userId).eq("updatedAt", cursorUpdatedAt).gt("cursorId", cursorIdValue)
      )
      .order("asc")
      .take(limit + 1);

    const remaining = Math.max(0, limit + 1 - entriesAtTimestamp.length);
    const entriesAfterTimestamp =
      remaining > 0
        ? await ctx.db
            .query("library_source_links")
            .withIndex("by_user_cursor", (q) =>
              q.eq("userId", userId).gt("updatedAt", cursorUpdatedAt)
            )
            .order("asc")
            .take(remaining)
        : [];

    const allEntries = [...entriesAtTimestamp, ...entriesAfterTimestamp];
    const hasMore = allEntries.length > limit;
    const results = hasMore ? allEntries.slice(0, limit) : allEntries;
    const lastEntry = results[results.length - 1];

    const nextCursor = hasMore && lastEntry
      ? {
          updatedAt: lastEntry.updatedAt,
          cursorId: lastEntry.cursorId ?? makeSourceLinkCursorId(lastEntry.registryId, lastEntry.sourceId, lastEntry.sourceMangaId),
        }
      : undefined;

    return {
      entries: results.map((e) => ({
        // Phase 6: cursorId for idempotent upserts
        cursorId: e.cursorId ?? makeSourceLinkCursorId(e.registryId, e.sourceId, e.sourceMangaId),
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
        deletedAt: e.deletedAt,
      })),
      nextCursor,
      hasMore,
    };
  },
});

// ============================================================================
// chapter_progress.listSince (Phase 6: composite cursor)
// ============================================================================

export const chapterProgressListSince = query({
  args: {
    cursor: v.optional(v.union(v.number(), compositeCursorValidator)),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const limit = Math.min(args.limit ?? 100, 500);

    const cursorUpdatedAt = typeof args.cursor === "number"
      ? args.cursor
      : args.cursor?.updatedAt ?? 0;
    const cursorIdValue = typeof args.cursor === "object" ? args.cursor.cursorId : "";

    // Phase 6: Two-phase query for composite cursor (tie-breakers first)
    const entriesAtTimestamp = await ctx.db
      .query("chapter_progress")
      .withIndex("by_user_cursor", (q) =>
        q.eq("userId", userId).eq("updatedAt", cursorUpdatedAt).gt("cursorId", cursorIdValue)
      )
      .order("asc")
      .take(limit + 1);

    const remaining = Math.max(0, limit + 1 - entriesAtTimestamp.length);
    const entriesAfterTimestamp =
      remaining > 0
        ? await ctx.db
            .query("chapter_progress")
            .withIndex("by_user_cursor", (q) =>
              q.eq("userId", userId).gt("updatedAt", cursorUpdatedAt)
            )
            .order("asc")
            .take(remaining)
        : [];

    const allEntries = [...entriesAtTimestamp, ...entriesAfterTimestamp];
    const hasMore = allEntries.length > limit;
    const results = hasMore ? allEntries.slice(0, limit) : allEntries;
    const lastEntry = results[results.length - 1];

    const nextCursor = hasMore && lastEntry
      ? {
          updatedAt: lastEntry.updatedAt,
          cursorId: lastEntry.cursorId ?? makeChapterProgressCursorId(
            lastEntry.registryId,
            lastEntry.sourceId,
            lastEntry.sourceMangaId,
            lastEntry.sourceChapterId
          ),
        }
      : undefined;

    return {
      entries: results.map((e) => ({
        // Phase 6: cursorId for idempotent upserts
        cursorId: e.cursorId ?? makeChapterProgressCursorId(e.registryId, e.sourceId, e.sourceMangaId, e.sourceChapterId),
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
        deletedAt: e.deletedAt,
      })),
      nextCursor,
      hasMore,
    };
  },
});

// ============================================================================
// manga_progress.listSince (Phase 6: composite cursor)
// ============================================================================

export const mangaProgressListSince = query({
  args: {
    cursor: v.optional(v.union(v.number(), compositeCursorValidator)),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const limit = Math.min(args.limit ?? 100, 500);

    const cursorUpdatedAt = typeof args.cursor === "number"
      ? args.cursor
      : args.cursor?.updatedAt ?? 0;
    const cursorIdValue = typeof args.cursor === "object" ? args.cursor.cursorId : "";

    // Phase 6: Two-phase query for composite cursor (tie-breakers first)
    const entriesAtTimestamp = await ctx.db
      .query("manga_progress")
      .withIndex("by_user_cursor", (q) =>
        q.eq("userId", userId).eq("updatedAt", cursorUpdatedAt).gt("cursorId", cursorIdValue)
      )
      .order("asc")
      .take(limit + 1);

    const remaining = Math.max(0, limit + 1 - entriesAtTimestamp.length);
    const entriesAfterTimestamp =
      remaining > 0
        ? await ctx.db
            .query("manga_progress")
            .withIndex("by_user_cursor", (q) =>
              q.eq("userId", userId).gt("updatedAt", cursorUpdatedAt)
            )
            .order("asc")
            .take(remaining)
        : [];

    const allEntries = [...entriesAtTimestamp, ...entriesAfterTimestamp];
    const hasMore = allEntries.length > limit;
    const results = hasMore ? allEntries.slice(0, limit) : allEntries;
    const lastEntry = results[results.length - 1];

    const nextCursor = hasMore && lastEntry
      ? {
          updatedAt: lastEntry.updatedAt,
          cursorId: lastEntry.cursorId ?? makeMangaProgressCursorId(lastEntry.registryId, lastEntry.sourceId, lastEntry.sourceMangaId),
        }
      : undefined;

    return {
      entries: results.map((e) => ({
        // Phase 6: cursorId for idempotent upserts
        cursorId: e.cursorId ?? makeMangaProgressCursorId(e.registryId, e.sourceId, e.sourceMangaId),
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
      })),
      nextCursor,
      hasMore,
    };
  },
});

// ============================================================================
// Convenience: get all sync data since cursor (batched) (Phase 6: composite cursor)
// ============================================================================

/**
 * Get all sync deltas since a given cursor timestamp.
 * Returns deltas for library_items, library_source_links, chapter_progress, manga_progress.
 * Useful for initial sync or catching up after offline period.
 *
 * Phase 6 note: This endpoint uses a simplified shared cursor approach.
 * For precise composite cursor handling across tables, use the individual listSince endpoints.
 * The shared cursor here uses updatedAt only, which is still safe but may cause
 * some re-fetching of rows at cursor boundaries. This is acceptable because:
 * - Client apply methods are idempotent (keyed by cursorId)
 * - The individual endpoints handle tie-breakers correctly
 */
export const getAllSince = query({
  args: {
    cursor: v.optional(v.union(v.number(), compositeCursorValidator)),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const limit = Math.min(args.limit ?? 50, 200);

    // For batched queries, we use updatedAt-only cursor (simpler, and idempotent apply handles duplicates)
    const cursorUpdatedAt = typeof args.cursor === "number"
      ? args.cursor
      : args.cursor?.updatedAt ?? 0;

    const takeN = limit + 1;
    const [libraryItemsRaw, sourceLinksRaw, chapterProgressRaw, mangaProgressRaw] =
      await Promise.all([
        ctx.db
          .query("library_items")
          .withIndex("by_user_updated", (q) =>
            q.eq("userId", userId).gt("updatedAt", cursorUpdatedAt)
          )
          .order("asc")
          .take(takeN),
        ctx.db
          .query("library_source_links")
          .withIndex("by_user_updated", (q) =>
            q.eq("userId", userId).gt("updatedAt", cursorUpdatedAt)
          )
          .order("asc")
          .take(takeN),
        ctx.db
          .query("chapter_progress")
          .withIndex("by_user_updated", (q) =>
            q.eq("userId", userId).gt("updatedAt", cursorUpdatedAt)
          )
          .order("asc")
          .take(takeN),
        ctx.db
          .query("manga_progress")
          .withIndex("by_user_updated", (q) =>
            q.eq("userId", userId).gt("updatedAt", cursorUpdatedAt)
          )
          .order("asc")
          .take(takeN),
      ]);

    const libraryItemsHasMore = libraryItemsRaw.length > limit;
    const sourceLinksHasMore = sourceLinksRaw.length > limit;
    const chapterProgressHasMore = chapterProgressRaw.length > limit;
    const mangaProgressHasMore = mangaProgressRaw.length > limit;

    const libraryItems = libraryItemsHasMore
      ? libraryItemsRaw.slice(0, limit)
      : libraryItemsRaw;
    const sourceLinks = sourceLinksHasMore
      ? sourceLinksRaw.slice(0, limit)
      : sourceLinksRaw;
    const chapterProgress = chapterProgressHasMore
      ? chapterProgressRaw.slice(0, limit)
      : chapterProgressRaw;
    const mangaProgress = mangaProgressHasMore
      ? mangaProgressRaw.slice(0, limit)
      : mangaProgressRaw;

    const hasMore =
      libraryItemsHasMore ||
      sourceLinksHasMore ||
      chapterProgressHasMore ||
      mangaProgressHasMore;

    // Shared nextCursor = the MIN fully-delivered watermark among tables that still have more.
    const watermarks: number[] = [];
    if (libraryItemsHasMore) watermarks.push(libraryItems[libraryItems.length - 1]!.updatedAt);
    if (sourceLinksHasMore) watermarks.push(sourceLinks[sourceLinks.length - 1]!.updatedAt);
    if (chapterProgressHasMore)
      watermarks.push(chapterProgress[chapterProgress.length - 1]!.updatedAt);
    if (mangaProgressHasMore) watermarks.push(mangaProgress[mangaProgress.length - 1]!.updatedAt);

    // Phase 6: Return composite cursor (though cursorId is empty for batched - use per-table endpoints for precision)
    const minWatermark = hasMore && watermarks.length > 0 ? Math.min(...watermarks) : undefined;
    const nextCursor = minWatermark !== undefined
      ? { updatedAt: minWatermark, cursorId: "" }
      : undefined;

    return {
      libraryItems: libraryItems.map((e) => ({
        cursorId: e.libraryItemId,
        libraryItemId: e.libraryItemId,
        metadata: e.metadata,
        externalIds: e.externalIds,
        // Library membership state (HLC-based)
        inLibrary: e.inLibrary,
        inLibraryClock: e.inLibraryClock,
        // Phase 6.5.5: Normalized overrides shape
        overrides: e.overrides,
        // Sync timestamps
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
      })),
      sourceLinks: sourceLinks.map((e) => ({
        cursorId: e.cursorId ?? makeSourceLinkCursorId(e.registryId, e.sourceId, e.sourceMangaId),
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
        deletedAt: e.deletedAt,
      })),
      chapterProgress: chapterProgress.map((e) => ({
        cursorId: e.cursorId ?? makeChapterProgressCursorId(e.registryId, e.sourceId, e.sourceMangaId, e.sourceChapterId),
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
        deletedAt: e.deletedAt,
      })),
      mangaProgress: mangaProgress.map((e) => ({
        cursorId: e.cursorId ?? makeMangaProgressCursorId(e.registryId, e.sourceId, e.sourceMangaId),
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
      })),
      nextCursor,
      hasMore,
    };
  },
});

