import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireAuth } from "./_lib";

/** Save/update a chapter progress entry */
export const save = mutation({
  args: {
    registryId: v.string(),
    sourceId: v.string(),
    sourceMangaId: v.string(),
    sourceChapterId: v.string(),
    progress: v.number(),
    total: v.number(),
    completed: v.boolean(),
    lastReadAt: v.number(),
    chapterNumber: v.optional(v.number()),
    volumeNumber: v.optional(v.number()),
    chapterTitle: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const now = Date.now();

    const existing = await ctx.db
      .query("chapter_progress")
      .withIndex("by_user_chapter", (q) =>
        q
          .eq("userId", userId)
          .eq("registryId", args.registryId)
          .eq("sourceId", args.sourceId)
          .eq("sourceMangaId", args.sourceMangaId)
          .eq("sourceChapterId", args.sourceChapterId)
      )
      .first();

    // Compute merged values (high-water mark semantics)
    const mergedProgress = existing ? Math.max(existing.progress, args.progress) : args.progress;
    const mergedTotal = existing ? Math.max(existing.total, args.total) : args.total;
    const mergedCompleted = existing ? existing.completed || args.completed : args.completed;
    const mergedLastReadAt = existing ? Math.max(existing.lastReadAt, args.lastReadAt) : args.lastReadAt;
    const mergedChapterNumber = args.chapterNumber ?? existing?.chapterNumber;
    const mergedVolumeNumber = args.volumeNumber ?? existing?.volumeNumber;
    const mergedChapterTitle = args.chapterTitle ?? existing?.chapterTitle;

    // Try to find libraryItemId from library_source_links
    const sourceLink = await ctx.db
      .query("library_source_links")
      .withIndex("by_user_source_manga", (q) =>
        q
          .eq("userId", userId)
          .eq("registryId", args.registryId)
          .eq("sourceId", args.sourceId)
          .eq("sourceMangaId", args.sourceMangaId)
      )
      .first();
    const libraryItemId = sourceLink?.libraryItemId;

    if (existing) {
      await ctx.db.patch(existing._id, {
        progress: mergedProgress,
        total: mergedTotal,
        completed: mergedCompleted,
        lastReadAt: mergedLastReadAt,
        chapterNumber: mergedChapterNumber,
        volumeNumber: mergedVolumeNumber,
        chapterTitle: mergedChapterTitle,
        libraryItemId,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("chapter_progress", {
        userId,
        registryId: args.registryId,
        sourceId: args.sourceId,
        sourceMangaId: args.sourceMangaId,
        sourceChapterId: args.sourceChapterId,
        libraryItemId,
        progress: mergedProgress,
        total: mergedTotal,
        completed: mergedCompleted,
        lastReadAt: mergedLastReadAt,
        chapterNumber: mergedChapterNumber,
        volumeNumber: mergedVolumeNumber,
        chapterTitle: mergedChapterTitle,
        updatedAt: now,
      });
    }

    // Update manga_progress (materialized summary)
    await updateMangaProgress(ctx, userId, {
      registryId: args.registryId,
      sourceId: args.sourceId,
      sourceMangaId: args.sourceMangaId,
      sourceChapterId: args.sourceChapterId,
      lastReadAt: mergedLastReadAt,
      chapterNumber: mergedChapterNumber,
      volumeNumber: mergedVolumeNumber,
      chapterTitle: mergedChapterTitle,
      libraryItemId,
      updatedAt: now,
    });
  },
});

// ============================================================================
// Helper functions
// ============================================================================

import type { MutationCtx } from "./_generated/server";

async function updateMangaProgress(
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
    libraryItemId?: string;
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

  if (existing) {
    // Only update if this read is more recent
    if (data.lastReadAt >= existing.lastReadAt) {
      await ctx.db.patch(existing._id, {
        lastReadAt: data.lastReadAt,
        lastReadSourceChapterId: data.sourceChapterId,
        lastReadChapterNumber: data.chapterNumber,
        lastReadVolumeNumber: data.volumeNumber,
        lastReadChapterTitle: data.chapterTitle,
        libraryItemId: data.libraryItemId,
        updatedAt: data.updatedAt,
      });
    }
  } else {
    await ctx.db.insert("manga_progress", {
      userId,
      registryId: data.registryId,
      sourceId: data.sourceId,
      sourceMangaId: data.sourceMangaId,
      libraryItemId: data.libraryItemId,
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
    sourceMangaId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    // Delete chapter_progress entries
    const chapterRows = await ctx.db
      .query("chapter_progress")
      .withIndex("by_user_source_manga", (q) =>
        q
          .eq("userId", userId)
          .eq("registryId", args.registryId)
          .eq("sourceId", args.sourceId)
          .eq("sourceMangaId", args.sourceMangaId)
      )
      .collect();
    for (const row of chapterRows) {
      await ctx.db.delete(row._id);
    }

    // Delete manga_progress entry
    const mangaRow = await ctx.db
      .query("manga_progress")
      .withIndex("by_user_source_manga", (q) =>
        q
          .eq("userId", userId)
          .eq("registryId", args.registryId)
          .eq("sourceId", args.sourceId)
          .eq("sourceMangaId", args.sourceMangaId)
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
