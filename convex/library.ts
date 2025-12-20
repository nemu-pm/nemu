import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import {
  requireAuth,
  sourceRefValidator,
  chapterProgressValidator,
  mergeChapterProgress,
  SEVEN_DAYS_MS,
} from "./_lib";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);

    const items = await ctx.db
      .query("library")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    return items.filter((item) => !item.deletedAt);
  },
});

export const get = query({
  args: { mangaId: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    const item = await ctx.db
      .query("library")
      .withIndex("by_user_manga", (q) =>
        q.eq("userId", userId).eq("mangaId", args.mangaId)
      )
      .first();

    if (item?.deletedAt) return null;
    return item;
  },
});

export const save = mutation({
  args: {
    mangaId: v.string(),
    title: v.string(),
    cover: v.optional(v.string()),
    addedAt: v.number(),
    sources: v.array(sourceRefValidator),
    activeRegistryId: v.string(),
    activeSourceId: v.string(),
    history: v.record(v.string(), chapterProgressValidator),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const now = Date.now();

    const existing = await ctx.db
      .query("library")
      .withIndex("by_user_manga", (q) =>
        q.eq("userId", userId).eq("mangaId", args.mangaId)
      )
      .first();

    if (existing) {
      const mergedHistory = { ...existing.history };
      for (const [chapterId, progress] of Object.entries(args.history)) {
        mergedHistory[chapterId] = mergeChapterProgress(
          mergedHistory[chapterId],
          progress
        );
      }

      await ctx.db.patch(existing._id, {
        title: args.title,
        cover: args.cover,
        addedAt: Math.min(existing.addedAt, args.addedAt),
        sources: args.sources,
        activeRegistryId: args.activeRegistryId,
        activeSourceId: args.activeSourceId,
        history: mergedHistory,
        updatedAt: now,
        deletedAt: undefined,
      });
    } else {
      await ctx.db.insert("library", {
        userId,
        mangaId: args.mangaId,
        title: args.title,
        cover: args.cover,
        addedAt: args.addedAt,
        sources: args.sources,
        activeRegistryId: args.activeRegistryId,
        activeSourceId: args.activeSourceId,
        history: args.history,
        updatedAt: now,
      });
    }
  },
});

export const remove = mutation({
  args: { mangaId: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    const existing = await ctx.db
      .query("library")
      .withIndex("by_user_manga", (q) =>
        q.eq("userId", userId).eq("mangaId", args.mangaId)
      )
      .first();

    if (existing) {
      const now = Date.now();
      await ctx.db.patch(existing._id, {
        deletedAt: now,
        updatedAt: now,
      });
    }
  },
});

export const saveChapterProgress = mutation({
  args: {
    mangaId: v.string(),
    chapterId: v.string(),
    progress: chapterProgressValidator,
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    const manga = await ctx.db
      .query("library")
      .withIndex("by_user_manga", (q) =>
        q.eq("userId", userId).eq("mangaId", args.mangaId)
      )
      .first();

    if (manga) {
      await ctx.db.patch(manga._id, {
        history: {
          ...manga.history,
          [args.chapterId]: mergeChapterProgress(
            manga.history[args.chapterId],
            args.progress
          ),
        },
        updatedAt: Date.now(),
      });
    }
  },
});

export const cleanupDeleted = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);
    const cutoff = Date.now() - SEVEN_DAYS_MS;

    const items = await ctx.db
      .query("library")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    for (const item of items) {
      if (item.deletedAt && item.deletedAt < cutoff) {
        await ctx.db.delete(item._id);
      }
    }
  },
});
