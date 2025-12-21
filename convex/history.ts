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

    if (existing) {
      // Merge: keep highest progress, completed if either is completed
      await ctx.db.patch(existing._id, {
        progress: Math.max(existing.progress, args.progress),
        total: Math.max(existing.total, args.total),
        completed: existing.completed || args.completed,
        dateRead: Math.max(existing.dateRead, args.dateRead),
        updatedAt: now,
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
      });
    }
  },
});

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
  },
});

