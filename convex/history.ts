import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireAuth } from "./_lib";

export const historyEntryValidator = v.object({
  registryId: v.string(),
  sourceId: v.string(),
  mangaId: v.string(),
  chapterId: v.string(),
  progress: v.number(),
  total: v.number(),
  completed: v.boolean(),
  dateRead: v.number(),
  // Chapter metadata (cached for display)
  chapterNumber: v.optional(v.number()),
  volumeNumber: v.optional(v.number()),
  chapterTitle: v.optional(v.string()),
});

/** Get a single history entry */
export const get = query({
  args: {
    registryId: v.string(),
    sourceId: v.string(),
    mangaId: v.string(),
    chapterId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    return await ctx.db
      .query("history")
      .withIndex("by_user_chapter", (q) =>
        q
          .eq("userId", userId)
          .eq("registryId", args.registryId)
          .eq("sourceId", args.sourceId)
          .eq("mangaId", args.mangaId)
          .eq("chapterId", args.chapterId)
      )
      .first();
  },
});

/** Get all history for a manga */
export const getMangaHistory = query({
  args: {
    registryId: v.string(),
    sourceId: v.string(),
    mangaId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    return await ctx.db
      .query("history")
      .withIndex("by_user_manga", (q) =>
        q
          .eq("userId", userId)
          .eq("registryId", args.registryId)
          .eq("sourceId", args.sourceId)
          .eq("mangaId", args.mangaId)
      )
      .collect();
  },
});

/** Get recent history entries */
export const getRecent = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const limit = args.limit ?? 50;

    return await ctx.db
      .query("history")
      .withIndex("by_user_recent", (q) => q.eq("userId", userId))
      .order("desc")
      .take(limit);
  },
});

/**
 * Incremental sync: list history entries since a cursor (updatedAt timestamp).
 * Returns flat HistoryEntry[] ordered by updatedAt ascending.
 * Includes nextCursor for pagination.
 */
export const listSince = query({
  args: {
    cursor: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const limit = Math.min(args.limit ?? 100, 500);
    const cursor = args.cursor ?? 0;

    // Query entries with updatedAt > cursor, ordered ascending
    // Note: entries without updatedAt are treated as updatedAt=0 (legacy data)
    const entries = await ctx.db
      .query("history")
      .withIndex("by_user_updated", (q) => q.eq("userId", userId).gt("updatedAt", cursor))
      .order("asc")
      .take(limit + 1);

    const hasMore = entries.length > limit;
    const results = hasMore ? entries.slice(0, limit) : entries;

    // Next cursor is the last entry's updatedAt (or undefined if no more)
    const lastEntry = results[results.length - 1];
    const nextCursor = hasMore && lastEntry?.updatedAt ? lastEntry.updatedAt : undefined;

    return {
      entries: results.map((e) => ({
        registryId: e.registryId,
        sourceId: e.sourceId,
        mangaId: e.mangaId,
        chapterId: e.chapterId,
        progress: e.progress,
        total: e.total,
        completed: e.completed,
        dateRead: e.dateRead,
        updatedAt: e.updatedAt ?? e.dateRead,
        chapterNumber: e.chapterNumber,
        volumeNumber: e.volumeNumber,
        chapterTitle: e.chapterTitle,
      })),
      nextCursor,
      hasMore,
    };
  },
});

/** Save/update a history entry */
export const save = mutation({
  args: historyEntryValidator,
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const now = Date.now();

    const existing = await ctx.db
      .query("history")
      .withIndex("by_user_chapter", (q) =>
        q
          .eq("userId", userId)
          .eq("registryId", args.registryId)
          .eq("sourceId", args.sourceId)
          .eq("mangaId", args.mangaId)
          .eq("chapterId", args.chapterId)
      )
      .first();

    // Compute merged values (high-water mark semantics)
    const mergedProgress = existing ? Math.max(existing.progress, args.progress) : args.progress;
    const mergedTotal = existing ? Math.max(existing.total, args.total) : args.total;
    const mergedCompleted = existing ? existing.completed || args.completed : args.completed;
    const mergedDateRead = existing ? Math.max(existing.dateRead, args.dateRead) : args.dateRead;
    const mergedChapterNumber = args.chapterNumber ?? existing?.chapterNumber;
    const mergedVolumeNumber = args.volumeNumber ?? existing?.volumeNumber;
    const mergedChapterTitle = args.chapterTitle ?? existing?.chapterTitle;

    if (existing) {
      // Merge: keep highest progress, completed if either is completed
      // Update chapter metadata if provided (prefer newer)
      await ctx.db.patch(existing._id, {
        progress: mergedProgress,
        total: mergedTotal,
        completed: mergedCompleted,
        dateRead: mergedDateRead,
        updatedAt: now,
        // Update metadata if provided
        ...(args.chapterNumber !== undefined && { chapterNumber: args.chapterNumber }),
        ...(args.volumeNumber !== undefined && { volumeNumber: args.volumeNumber }),
        ...(args.chapterTitle !== undefined && { chapterTitle: args.chapterTitle }),
      });
    } else {
      await ctx.db.insert("history", {
        userId,
        registryId: args.registryId,
        sourceId: args.sourceId,
        mangaId: args.mangaId,
        chapterId: args.chapterId,
        progress: args.progress,
        total: args.total,
        completed: args.completed,
        dateRead: args.dateRead,
        updatedAt: now,
        chapterNumber: args.chapterNumber,
        volumeNumber: args.volumeNumber,
        chapterTitle: args.chapterTitle,
      });
    }

    // Phase 2: Dual-write to chapter_progress
    await dualWriteChapterProgress(ctx, userId, {
      registryId: args.registryId,
      sourceId: args.sourceId,
      sourceMangaId: args.mangaId,
      sourceChapterId: args.chapterId,
      progress: mergedProgress,
      total: mergedTotal,
      completed: mergedCompleted,
      lastReadAt: mergedDateRead,
      chapterNumber: mergedChapterNumber,
      volumeNumber: mergedVolumeNumber,
      chapterTitle: mergedChapterTitle,
      updatedAt: now,
    });

    // Phase 2: Dual-write to manga_progress (materialized summary)
    await dualWriteMangaProgress(ctx, userId, {
      registryId: args.registryId,
      sourceId: args.sourceId,
      sourceMangaId: args.mangaId,
      sourceChapterId: args.chapterId,
      lastReadAt: mergedDateRead,
      chapterNumber: mergedChapterNumber,
      volumeNumber: mergedVolumeNumber,
      chapterTitle: mergedChapterTitle,
      updatedAt: now,
    });
  },
});

// ============================================================================
// Phase 2 + Phase 6: Dual-write helpers (sync.md)
// ============================================================================

import type { MutationCtx } from "./_generated/server";

/** Phase 6: Build cursorId for chapter progress */
function makeChapterProgressCursorId(
  registryId: string,
  sourceId: string,
  sourceMangaId: string,
  sourceChapterId: string
): string {
  return `${encodeURIComponent(registryId)}:${encodeURIComponent(sourceId)}:${encodeURIComponent(sourceMangaId)}:${encodeURIComponent(sourceChapterId)}`;
}

/** Phase 6: Build cursorId for manga progress */
function makeMangaProgressCursorId(registryId: string, sourceId: string, sourceMangaId: string): string {
  return `${encodeURIComponent(registryId)}:${encodeURIComponent(sourceId)}:${encodeURIComponent(sourceMangaId)}`;
}

/**
 * Dual-write to chapter_progress table
 * Phase 6: Populates cursorId for deterministic pagination
 */
async function dualWriteChapterProgress(
  ctx: MutationCtx,
  userId: string,
  data: {
    registryId: string;
    sourceId: string;
    sourceMangaId: string;
    sourceChapterId: string;
    progress: number;
    total: number;
    completed: boolean;
    lastReadAt: number;
    chapterNumber?: number;
    volumeNumber?: number;
    chapterTitle?: string;
    updatedAt: number;
  }
) {
  const existing = await ctx.db
    .query("chapter_progress")
    .withIndex("by_user_chapter", (q) =>
      q
        .eq("userId", userId)
        .eq("registryId", data.registryId)
        .eq("sourceId", data.sourceId)
        .eq("sourceMangaId", data.sourceMangaId)
        .eq("sourceChapterId", data.sourceChapterId)
    )
    .first();

  // Try to find libraryItemId from library_source_links
  const sourceLink = await ctx.db
    .query("library_source_links")
    .withIndex("by_user_source_manga", (q) =>
      q
        .eq("userId", userId)
        .eq("registryId", data.registryId)
        .eq("sourceId", data.sourceId)
        .eq("sourceMangaId", data.sourceMangaId)
    )
    .first();
  const libraryItemId = sourceLink?.libraryItemId;

  // Phase 6: Canonical cursorId
  const cursorId = makeChapterProgressCursorId(
    data.registryId,
    data.sourceId,
    data.sourceMangaId,
    data.sourceChapterId
  );

  if (existing) {
    await ctx.db.patch(existing._id, {
      cursorId, // Phase 6
      progress: data.progress,
      total: data.total,
      completed: data.completed,
      lastReadAt: data.lastReadAt,
      chapterNumber: data.chapterNumber,
      volumeNumber: data.volumeNumber,
      chapterTitle: data.chapterTitle,
      libraryItemId,
      updatedAt: data.updatedAt,
    });
  } else {
    await ctx.db.insert("chapter_progress", {
      userId,
      registryId: data.registryId,
      sourceId: data.sourceId,
      sourceMangaId: data.sourceMangaId,
      sourceChapterId: data.sourceChapterId,
      cursorId, // Phase 6
      libraryItemId,
      progress: data.progress,
      total: data.total,
      completed: data.completed,
      lastReadAt: data.lastReadAt,
      chapterNumber: data.chapterNumber,
      volumeNumber: data.volumeNumber,
      chapterTitle: data.chapterTitle,
      updatedAt: data.updatedAt,
    });
  }
}

/**
 * Dual-write to manga_progress table (materialized "last read" summary)
 * Phase 6: Populates cursorId for deterministic pagination
 */
async function dualWriteMangaProgress(
  ctx: MutationCtx,
  userId: string,
  data: {
    registryId: string;
    sourceId: string;
    sourceMangaId: string;
    sourceChapterId: string;
    lastReadAt: number;
    chapterNumber?: number;
    volumeNumber?: number;
    chapterTitle?: string;
    updatedAt: number;
  }
) {
  const existing = await ctx.db
    .query("manga_progress")
    .withIndex("by_user_source_manga", (q) =>
      q
        .eq("userId", userId)
        .eq("registryId", data.registryId)
        .eq("sourceId", data.sourceId)
        .eq("sourceMangaId", data.sourceMangaId)
    )
    .first();

  // Try to find libraryItemId from library_source_links
  const sourceLink = await ctx.db
    .query("library_source_links")
    .withIndex("by_user_source_manga", (q) =>
      q
        .eq("userId", userId)
        .eq("registryId", data.registryId)
        .eq("sourceId", data.sourceId)
        .eq("sourceMangaId", data.sourceMangaId)
    )
    .first();
  const libraryItemId = sourceLink?.libraryItemId;

  // Phase 6: Canonical cursorId
  const cursorId = makeMangaProgressCursorId(data.registryId, data.sourceId, data.sourceMangaId);

  if (existing) {
    // Only update if this read is more recent
    if (data.lastReadAt >= existing.lastReadAt) {
      await ctx.db.patch(existing._id, {
        cursorId, // Phase 6
        lastReadAt: data.lastReadAt,
        lastReadSourceChapterId: data.sourceChapterId,
        lastReadChapterNumber: data.chapterNumber,
        lastReadVolumeNumber: data.volumeNumber,
        lastReadChapterTitle: data.chapterTitle,
        libraryItemId,
        updatedAt: data.updatedAt,
      });
    }
  } else {
    await ctx.db.insert("manga_progress", {
      userId,
      registryId: data.registryId,
      sourceId: data.sourceId,
      sourceMangaId: data.sourceMangaId,
      cursorId, // Phase 6
      libraryItemId,
      lastReadAt: data.lastReadAt,
      lastReadSourceChapterId: data.sourceChapterId,
      lastReadChapterNumber: data.chapterNumber,
      lastReadVolumeNumber: data.volumeNumber,
      lastReadChapterTitle: data.chapterTitle,
      updatedAt: data.updatedAt,
    });
  }
}

/** Remove history for a manga */
export const removeMangaHistory = mutation({
  args: {
    registryId: v.string(),
    sourceId: v.string(),
    mangaId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    const entries = await ctx.db
      .query("history")
      .withIndex("by_user_manga", (q) =>
        q
          .eq("userId", userId)
          .eq("registryId", args.registryId)
          .eq("sourceId", args.sourceId)
          .eq("mangaId", args.mangaId)
      )
      .collect();

    for (const entry of entries) {
      await ctx.db.delete(entry._id);
    }

    // Phase 2+: keep new normalized tables consistent
    const chapterRows = await ctx.db
      .query("chapter_progress")
      .withIndex("by_user_source_manga", (q) =>
        q
          .eq("userId", userId)
          .eq("registryId", args.registryId)
          .eq("sourceId", args.sourceId)
          .eq("sourceMangaId", args.mangaId)
      )
      .collect();
    for (const row of chapterRows) {
      await ctx.db.delete(row._id);
    }

    const mangaRow = await ctx.db
      .query("manga_progress")
      .withIndex("by_user_source_manga", (q) =>
        q
          .eq("userId", userId)
          .eq("registryId", args.registryId)
          .eq("sourceId", args.sourceId)
          .eq("sourceMangaId", args.mangaId)
      )
      .first();
    if (mangaRow) {
      await ctx.db.delete(mangaRow._id);
    }
  },
});

/** Clear all history for the user */
export const clearAll = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);

    const entries = await ctx.db
      .query("history")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    for (const entry of entries) {
      await ctx.db.delete(entry._id);
    }

    // Phase 2+: keep new normalized tables consistent
    const chapterRows = await ctx.db
      .query("chapter_progress")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const row of chapterRows) {
      await ctx.db.delete(row._id);
    }

    const mangaRows = await ctx.db
      .query("manga_progress")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const row of mangaRows) {
      await ctx.db.delete(row._id);
    }
  },
});

/**
 * Get all history for user's library - for reactive subscription
 * Returns grouped by registryId:sourceId:mangaId with most recent entry per chapter
 */
export const getForLibrary = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);

    const entries = await ctx.db
      .query("history")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    // Group by source manga key
    const grouped: Record<
      string,
      {
        registryId: string;
        sourceId: string;
        mangaId: string;
        lastReadChapterId: string;
        lastReadAt: number;
        // Chapter metadata for display
        lastReadChapterNumber?: number;
        lastReadVolumeNumber?: number;
        lastReadChapterTitle?: string;
        chapters: Record<string, { progress: number; total: number; completed: boolean; dateRead: number }>;
      }
    > = {};

    for (const entry of entries) {
      const key = `${entry.registryId}:${entry.sourceId}:${entry.mangaId}`;

      if (!grouped[key]) {
        grouped[key] = {
          registryId: entry.registryId,
          sourceId: entry.sourceId,
          mangaId: entry.mangaId,
          lastReadChapterId: entry.chapterId,
          lastReadAt: entry.dateRead,
          lastReadChapterNumber: entry.chapterNumber,
          lastReadVolumeNumber: entry.volumeNumber,
          lastReadChapterTitle: entry.chapterTitle,
          chapters: {},
        };
      }

      // Track most recent read
      if (entry.dateRead > grouped[key].lastReadAt) {
        grouped[key].lastReadChapterId = entry.chapterId;
        grouped[key].lastReadAt = entry.dateRead;
        grouped[key].lastReadChapterNumber = entry.chapterNumber;
        grouped[key].lastReadVolumeNumber = entry.volumeNumber;
        grouped[key].lastReadChapterTitle = entry.chapterTitle;
      }

      // Store chapter progress
      grouped[key].chapters[entry.chapterId] = {
        progress: entry.progress,
        total: entry.total,
        completed: entry.completed,
        dateRead: entry.dateRead,
      };
    }

    return grouped;
  },
});

