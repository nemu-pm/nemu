import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireAuth } from "./_lib";

export const save = mutation({
  args: {
    collectionId: v.string(),
    name: v.string(),
    createdAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const now = Date.now();

    const existing = await ctx.db
      .query("collections")
      .withIndex("by_user_collection", (q) =>
        q.eq("userId", userId).eq("collectionId", args.collectionId)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.name,
        updatedAt: now,
      });
      return;
    }

    await ctx.db.insert("collections", {
      userId,
      collectionId: args.collectionId,
      name: args.name,
      createdAt: args.createdAt,
      updatedAt: now,
    });
  },
});

export const remove = mutation({
  args: {
    collectionId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    const collection = await ctx.db
      .query("collections")
      .withIndex("by_user_collection", (q) =>
        q.eq("userId", userId).eq("collectionId", args.collectionId)
      )
      .first();

    if (collection) {
      await ctx.db.delete(collection._id);
    }

    const items = await ctx.db
      .query("collection_items")
      .withIndex("by_user_collection", (q) =>
        q.eq("userId", userId).eq("collectionId", args.collectionId)
      )
      .collect();

    for (const item of items) {
      await ctx.db.delete(item._id);
    }
  },
});

export const addItems = mutation({
  args: {
    collectionId: v.string(),
    libraryItemIds: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const now = Date.now();
    const uniqueIds = [...new Set(args.libraryItemIds)];

    const collection = await ctx.db
      .query("collections")
      .withIndex("by_user_collection", (q) =>
        q.eq("userId", userId).eq("collectionId", args.collectionId)
      )
      .first();

    if (!collection) {
      throw new Error("Collection not found");
    }

    for (const libraryItemId of uniqueIds) {
      const libraryItem = await ctx.db
        .query("library_items")
        .withIndex("by_user_item", (q) =>
          q.eq("userId", userId).eq("libraryItemId", libraryItemId)
        )
        .first();

      if (!libraryItem) continue;

      const existing = await ctx.db
        .query("collection_items")
        .withIndex("by_user_collection_item", (q) =>
          q.eq("userId", userId).eq("collectionId", args.collectionId).eq("libraryItemId", libraryItemId)
        )
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          updatedAt: now,
        });
        continue;
      }

      await ctx.db.insert("collection_items", {
        userId,
        collectionId: args.collectionId,
        libraryItemId,
        addedAt: now,
        updatedAt: now,
      });
    }
  },
});

export const removeItems = mutation({
  args: {
    collectionId: v.string(),
    libraryItemIds: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    for (const libraryItemId of new Set(args.libraryItemIds)) {
      const existing = await ctx.db
        .query("collection_items")
        .withIndex("by_user_collection_item", (q) =>
          q.eq("userId", userId).eq("collectionId", args.collectionId).eq("libraryItemId", libraryItemId)
        )
        .first();

      if (existing) {
        await ctx.db.delete(existing._id);
      }
    }
  },
});

export const clearAll = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);

    const collections = await ctx.db
      .query("collections")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const collection of collections) {
      await ctx.db.delete(collection._id);
    }

    const items = await ctx.db
      .query("collection_items")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const item of items) {
      await ctx.db.delete(item._id);
    }
  },
});
