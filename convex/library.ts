import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireAuth, sourceRefValidator, SEVEN_DAYS_MS } from "./_lib";

const chapterSummaryValidator = v.object({
  id: v.string(),
  title: v.optional(v.string()),
  chapterNumber: v.optional(v.number()),
  volumeNumber: v.optional(v.number()),
});

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
    // Reading progress
    lastReadChapter: v.optional(chapterSummaryValidator),
    lastReadAt: v.optional(v.number()),
    // Chapter availability
    latestChapter: v.optional(chapterSummaryValidator),
    seenLatestChapter: v.optional(chapterSummaryValidator),
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
      // Merge: keep the most recent lastReadAt
      const lastReadAt =
        args.lastReadAt && existing.lastReadAt
          ? Math.max(args.lastReadAt, existing.lastReadAt)
          : args.lastReadAt ?? existing.lastReadAt;
      const lastReadChapter =
        lastReadAt === args.lastReadAt
          ? args.lastReadChapter ?? existing.lastReadChapter
          : existing.lastReadChapter ?? args.lastReadChapter;

      await ctx.db.patch(existing._id, {
        title: args.title,
        cover: args.cover,
        addedAt: Math.min(existing.addedAt, args.addedAt),
        sources: args.sources,
        activeRegistryId: args.activeRegistryId,
        activeSourceId: args.activeSourceId,
        lastReadChapter,
        lastReadAt,
        latestChapter: args.latestChapter ?? existing.latestChapter,
        seenLatestChapter: args.seenLatestChapter ?? existing.seenLatestChapter,
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
        lastReadChapter: args.lastReadChapter,
        lastReadAt: args.lastReadAt,
        latestChapter: args.latestChapter,
        seenLatestChapter: args.seenLatestChapter,
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

export const clearAll = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);

    // Delete all library items
    const libraryItems = await ctx.db
      .query("library")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    for (const item of libraryItems) {
      await ctx.db.delete(item._id);
    }

    // Delete settings
    const settings = await ctx.db
      .query("settings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (settings) {
      await ctx.db.delete(settings._id);
    }
  },
});
