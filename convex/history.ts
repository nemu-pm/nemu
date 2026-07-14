import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation } from "./_generated/server";
import { requireAuth, requireAuthForUser } from "./_lib";
import {
  mergeChapterProgressHighWater,
  newestLwwRecord,
  shouldApplyLww, pruneDuplicateRows } from "./lww";
import {
  assertFiniteNumber,
  assertNonNegativeSafeInteger,
  currentSyncGenerationRows,
  getCurrentSyncGeneration,
  requireSyncGeneration,
  resolveSyncClock,
  storedSyncGeneration,
} from "./syncGeneration";
import { requireSyncMutationContext } from "./syncCompatibility";

const HISTORY_RETARGET_PAGE_ITEMS = 128;
const HISTORY_RETARGET_CONFLICT = "HISTORY_RETARGET_CONFLICT";

type HistoryRetargetLock = {
  sourceLibraryItemId: string;
  targetLibraryItemId: string;
  updatedAt: number;
};

function isMatchingHistoryRetargetLock(
  lock: HistoryRetargetLock | undefined,
  sourceLibraryItemId: string,
  targetLibraryItemId: string,
): lock is HistoryRetargetLock {
  return Boolean(
    lock &&
      lock.sourceLibraryItemId === sourceLibraryItemId &&
      lock.targetLibraryItemId === targetLibraryItemId,
  );
}

/** Save/update a chapter progress entry */
export const save = mutation({
  args: {
    expectedUserId: v.optional(v.string()),
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
    updatedAt: v.optional(v.number()),
    generation: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { userId, generation, resolveClock } =
      await requireSyncMutationContext(ctx, args);
    const updatedAt = resolveClock(args.updatedAt, Date.now());
    const progress = assertNonNegativeSafeInteger(args.progress, "progress");
    const total = assertNonNegativeSafeInteger(args.total, "total");
    const lastReadAt = resolveSyncClock(
      args.lastReadAt,
      generation,
      Date.now(),
    );
    const chapterNumber = assertFiniteNumber(
      args.chapterNumber,
      "chapterNumber",
    );
    const volumeNumber = assertFiniteNumber(args.volumeNumber, "volumeNumber");

    const existingRows = currentSyncGenerationRows(await ctx.db
      .query("chapter_progress")
      .withIndex("by_user_chapter", (q) =>
        q
          .eq("userId", userId)
          .eq("registryId", args.registryId)
          .eq("sourceId", args.sourceId)
          .eq("sourceMangaId", args.sourceMangaId)
          .eq("sourceChapterId", args.sourceChapterId)
      )
      .collect(), generation);
    const existing = newestLwwRecord(existingRows);
    await pruneDuplicateRows(ctx.db, existingRows, existing);
    const merged = mergeChapterProgressHighWater(existing, {
      progress,
      total,
      completed: args.completed,
      lastReadAt,
      chapterNumber,
      volumeNumber,
      chapterTitle: args.chapterTitle,
      updatedAt,
    });

    // Try to find libraryItemId from library_source_links
    const sourceLinks = currentSyncGenerationRows(await ctx.db
      .query("library_source_links")
      .withIndex("by_user_source_manga", (q) =>
        q
          .eq("userId", userId)
          .eq("registryId", args.registryId)
          .eq("sourceId", args.sourceId)
          .eq("sourceMangaId", args.sourceMangaId)
      )
      .collect(), generation);
    const sourceLink = newestLwwRecord(
      sourceLinks,
      (link) => link.removed === true,
    );
    const libraryItemId = sourceLink?.removed ? undefined : sourceLink?.libraryItemId;

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...merged,
        libraryItemId,
      });
    } else {
      await ctx.db.insert("chapter_progress", {
        userId,
        syncGeneration: storedSyncGeneration(generation),
        registryId: args.registryId,
        sourceId: args.sourceId,
        sourceMangaId: args.sourceMangaId,
        sourceChapterId: args.sourceChapterId,
        libraryItemId,
        ...merged,
      });
    }

    // Update manga_progress (materialized summary)
    await updateMangaProgress(ctx, userId, generation, {
      registryId: args.registryId,
      sourceId: args.sourceId,
      sourceMangaId: args.sourceMangaId,
      sourceChapterId: args.sourceChapterId,
      // Feed the materialized summary the incoming read event, not the
      // chapter-level high-water timestamp paired with this event's chapter.
      lastReadAt,
      chapterNumber,
      volumeNumber,
      chapterTitle: args.chapterTitle,
      libraryItemId,
      updatedAt: merged.updatedAt,
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
  generation: number,
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
  const existingRows = currentSyncGenerationRows(await ctx.db
    .query("manga_progress")
    .withIndex("by_user_source_manga", (q) =>
      q
        .eq("userId", userId)
        .eq("registryId", data.registryId)
        .eq("sourceId", data.sourceId)
        .eq("sourceMangaId", data.sourceMangaId)
    )
    .collect(), generation);
  const existing = newestLwwRecord(existingRows);
  await pruneDuplicateRows(ctx.db, existingRows, existing);

  if (existing) {
    const eventWins =
      data.lastReadAt > existing.lastReadAt ||
      (data.lastReadAt === existing.lastReadAt &&
        shouldApplyLww(existing.updatedAt, data.updatedAt));
    const mergedUpdatedAt = Math.max(existing.updatedAt, data.updatedAt);
    if (eventWins) {
      await ctx.db.patch(existing._id, {
        lastReadAt: data.lastReadAt,
        lastReadSourceChapterId: data.sourceChapterId,
        lastReadChapterNumber: data.chapterNumber,
        lastReadVolumeNumber: data.volumeNumber,
        lastReadChapterTitle: data.chapterTitle,
        libraryItemId: data.libraryItemId,
        updatedAt: mergedUpdatedAt,
      });
    } else if (
      mergedUpdatedAt !== existing.updatedAt ||
      data.libraryItemId !== existing.libraryItemId
    ) {
      // A high-water page update can arrive with an older read event. Preserve
      // the summary event, but still advance its sync clock/current linkage.
      await ctx.db.patch(existing._id, {
        libraryItemId: data.libraryItemId,
        updatedAt: mergedUpdatedAt,
      });
    }
  } else {
    await ctx.db.insert("manga_progress", {
      userId,
      syncGeneration: storedSyncGeneration(generation),
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
    expectedUserId: v.optional(v.string()),
    registryId: v.string(),
    sourceId: v.string(),
    sourceMangaId: v.string(),
    updatedAt: v.optional(v.number()),
    generation: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { userId, generation, resolveClock } =
      await requireSyncMutationContext(ctx, args);
    const updatedAt = resolveClock(args.updatedAt, Date.now());

    // Delete chapter_progress entries
    const chapterRows = currentSyncGenerationRows(await ctx.db
      .query("chapter_progress")
      .withIndex("by_user_source_manga", (q) =>
        q
          .eq("userId", userId)
          .eq("registryId", args.registryId)
          .eq("sourceId", args.sourceId)
          .eq("sourceMangaId", args.sourceMangaId)
      )
      .collect(), generation);
    const mangaRows = currentSyncGenerationRows(await ctx.db
      .query("manga_progress")
      .withIndex("by_user_source_manga", (q) =>
        q
          .eq("userId", userId)
          .eq("registryId", args.registryId)
          .eq("sourceId", args.sourceId)
          .eq("sourceMangaId", args.sourceMangaId)
      )
      .collect(), generation);
    if (
      [...chapterRows, ...mangaRows].some(
        (row) => !shouldApplyLww(row.updatedAt, updatedAt),
      )
    ) {
      return;
    }

    for (const row of chapterRows) {
      await ctx.db.delete(row._id);
    }
    // Delete every duplicate materialized summary only after the logical
    // delete is newer than every canonical/provisional progress row.
    for (const row of mangaRows) {
      await ctx.db.delete(row._id);
    }
  },
});

/** Move history rows from a merged-away library item to the surviving item. */
export const retargetLibraryItem = mutation({
  args: {
    expectedUserId: v.string(),
    sourceLibraryItemId: v.string(),
    targetLibraryItemId: v.string(),
    updatedAt: v.optional(v.number()),
    generation: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthForUser(ctx, args.expectedUserId);
    const generation = await requireSyncGeneration(ctx, userId, args.generation);
    if (args.sourceLibraryItemId === args.targetLibraryItemId) return null;

    let updatedAt = resolveSyncClock(args.updatedAt, generation, Date.now());
    const [sourceItems, targetItems] = await Promise.all([
      ctx.db
        .query("library_items")
        .withIndex("by_user_item", (q) =>
          q.eq("userId", userId).eq("libraryItemId", args.sourceLibraryItemId),
        )
        .collect(),
      ctx.db
        .query("library_items")
        .withIndex("by_user_item", (q) =>
          q.eq("userId", userId).eq("libraryItemId", args.targetLibraryItemId),
        )
        .collect(),
    ]);
    const currentItems = [
      ...currentSyncGenerationRows(sourceItems, generation),
      ...currentSyncGenerationRows(targetItems, generation),
    ];
    const hasSource = currentItems.some(
      (item) => item.libraryItemId === args.sourceLibraryItemId,
    );
    const hasTarget = currentItems.some(
      (item) => item.libraryItemId === args.targetLibraryItemId,
    );
    if (!hasSource || !hasTarget) {
      // A legitimate offline-only item may never have reached this account's
      // cloud snapshot. Moved source links and progress winners were already
      // pushed to the target before this best-effort structural cleanup.
      return null;
    }

    const activeLocks = currentItems
      .map((item) => item.historyRetargetLock)
      .filter((lock): lock is HistoryRetargetLock => lock !== undefined);
    if (
      activeLocks.some(
        (lock) =>
          !isMatchingHistoryRetargetLock(
            lock,
            args.sourceLibraryItemId,
            args.targetLibraryItemId,
          ),
      )
    ) {
      throw new Error(HISTORY_RETARGET_CONFLICT);
    }
    const matchingClock = activeLocks.reduce<number | undefined>(
      (maximum, lock) =>
        maximum === undefined ? lock.updatedAt : Math.max(maximum, lock.updatedAt),
      undefined,
    );
    if (matchingClock !== undefined) updatedAt = matchingClock;
    const historyRetargetLock = {
      sourceLibraryItemId: args.sourceLibraryItemId,
      targetLibraryItemId: args.targetLibraryItemId,
      updatedAt,
    };
    for (const item of currentItems) {
      if (
        item.historyRetargetLock?.sourceLibraryItemId ===
          historyRetargetLock.sourceLibraryItemId &&
        item.historyRetargetLock?.targetLibraryItemId ===
          historyRetargetLock.targetLibraryItemId &&
        item.historyRetargetLock?.updatedAt === historyRetargetLock.updatedAt
      ) {
        continue;
      }
      await ctx.db.patch(item._id, { historyRetargetLock });
    }
    await ctx.scheduler.runAfter(0, internal.history.retargetLibraryItemPage, {
      userId,
      generation,
      sourceLibraryItemId: args.sourceLibraryItemId,
      targetLibraryItemId: args.targetLibraryItemId,
      updatedAt,
      phase: "chapter_progress",
    });
    return null;
  },
});

export const retargetLibraryItemPage = internalMutation({
  args: {
    userId: v.string(),
    generation: v.number(),
    sourceLibraryItemId: v.string(),
    targetLibraryItemId: v.string(),
    updatedAt: v.number(),
    phase: v.union(
      v.literal("chapter_progress"),
      v.literal("manga_progress"),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (
      (await getCurrentSyncGeneration(ctx, args.userId)) !== args.generation
    ) {
      return null;
    }
    const [sourceItems, targetItems] = await Promise.all([
      ctx.db
        .query("library_items")
      .withIndex("by_user_item", (q) =>
          q
            .eq("userId", args.userId)
            .eq("libraryItemId", args.sourceLibraryItemId),
        )
        .collect(),
      ctx.db
        .query("library_items")
        .withIndex("by_user_item", (q) =>
          q
            .eq("userId", args.userId)
            .eq("libraryItemId", args.targetLibraryItemId),
        )
        .collect(),
    ]);
    const lockIsActive = [...sourceItems, ...targetItems]
      .filter((item) => item.syncGeneration === storedSyncGeneration(args.generation))
      .some(
        (item) =>
          isMatchingHistoryRetargetLock(
            item.historyRetargetLock,
            args.sourceLibraryItemId,
            args.targetLibraryItemId,
          ) && item.historyRetargetLock.updatedAt === args.updatedAt,
      );
    if (!lockIsActive) return null;

    const rows = await ctx.db
      .query(args.phase)
      .withIndex("by_user_generation_item", (q) =>
        q
          .eq("userId", args.userId)
          .eq("syncGeneration", storedSyncGeneration(args.generation))
          .eq("libraryItemId", args.sourceLibraryItemId),
      )
      .take(HISTORY_RETARGET_PAGE_ITEMS);
    for (const row of rows) {
      await ctx.db.patch(row._id, {
        libraryItemId: args.targetLibraryItemId,
        updatedAt: Math.max(row.updatedAt, args.updatedAt),
      });
    }

    if (rows.length === HISTORY_RETARGET_PAGE_ITEMS) {
      await ctx.scheduler.runAfter(0, internal.history.retargetLibraryItemPage, args);
      return null;
    }
    if (args.phase === "chapter_progress") {
      await ctx.scheduler.runAfter(0, internal.history.retargetLibraryItemPage, {
        ...args,
        phase: "manga_progress",
      });
      return null;
    }

    for (const item of [...sourceItems, ...targetItems]) {
      if (
        item.syncGeneration === storedSyncGeneration(args.generation) &&
        isMatchingHistoryRetargetLock(
          item.historyRetargetLock,
          args.sourceLibraryItemId,
          args.targetLibraryItemId,
        ) &&
        item.historyRetargetLock.updatedAt === args.updatedAt
      ) {
        await ctx.db.patch(item._id, { historyRetargetLock: undefined });
      }
    }
    return null;
  },
});

/** Clear all history for the user */
export const clearAll = mutation({
  args: { generation: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    await requireSyncGeneration(ctx, userId, args.generation);
    throw new Error("SYNC_CLEAR_ALL_REQUIRED");
  },
});
