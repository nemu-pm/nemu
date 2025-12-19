import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// Get all library manga for the current user
export const list = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    return await ctx.db
      .query("library")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .collect();
  },
});

// Get a single library manga
export const get = query({
  args: { mangaId: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    return await ctx.db
      .query("library")
      .withIndex("by_user_manga", (q) =>
        q.eq("userId", identity.subject).eq("mangaId", args.mangaId)
      )
      .first();
  },
});

// Save/update a library manga
export const save = mutation({
  args: {
    mangaId: v.string(),
    title: v.string(),
    cover: v.optional(v.string()),
    addedAt: v.number(),
    sources: v.array(
      v.object({
        registryId: v.string(),
        sourceId: v.string(),
        mangaId: v.string(),
      })
    ),
    activeRegistryId: v.string(),
    activeSourceId: v.string(),
    history: v.record(
      v.string(),
      v.object({
        progress: v.number(),
        total: v.number(),
        completed: v.boolean(),
        dateRead: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject;

    // Check if manga already exists
    const existing = await ctx.db
      .query("library")
      .withIndex("by_user_manga", (q) =>
        q.eq("userId", userId).eq("mangaId", args.mangaId)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        title: args.title,
        cover: args.cover,
        addedAt: args.addedAt,
        sources: args.sources,
        activeRegistryId: args.activeRegistryId,
        activeSourceId: args.activeSourceId,
        history: args.history,
      });
    } else {
      await ctx.db.insert("library", {
        userId,
        ...args,
      });
    }
  },
});

// Remove a manga from library
export const remove = mutation({
  args: { mangaId: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("library")
      .withIndex("by_user_manga", (q) =>
        q.eq("userId", identity.subject).eq("mangaId", args.mangaId)
      )
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});

// Save chapter progress (partial update)
export const saveChapterProgress = mutation({
  args: {
    mangaId: v.string(),
    chapterId: v.string(),
    progress: v.object({
      progress: v.number(),
      total: v.number(),
      completed: v.boolean(),
      dateRead: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const manga = await ctx.db
      .query("library")
      .withIndex("by_user_manga", (q) =>
        q.eq("userId", identity.subject).eq("mangaId", args.mangaId)
      )
      .first();

    if (manga) {
      await ctx.db.patch(manga._id, {
        history: {
          ...manga.history,
          [args.chapterId]: args.progress,
        },
      });
    }
  },
});

