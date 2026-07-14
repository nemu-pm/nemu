import { v } from "convex/values";
import { internalMutation, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireAuth } from "./_lib";
import {
  isAfterRemovalBarrier,
  maximumRemovalBarrier,
  newestLwwRecord,
  shouldApplyLww, pruneDuplicateRows } from "./lww";
import {
  currentSyncGenerationRows,
  requireSyncGeneration,
  storedSyncGeneration,
} from "./syncGeneration";
import { requireSyncMutationContext } from "./syncCompatibility";

// Each membership performs indexed parent + membership reads. Bound direct
// callers as defense in depth; first-party clients split larger selections.
const MAX_COLLECTION_MUTATION_ITEMS = 256;
const COLLECTION_CASCADE_PAGE_ITEMS = 128;

function requireBoundedMembershipBatch(libraryItemIds: string[]): string[] {
  const uniqueIds = [...new Set(libraryItemIds)];
  if (uniqueIds.length > MAX_COLLECTION_MUTATION_ITEMS) {
    throw new Error(
      `Collection membership batch exceeds ${MAX_COLLECTION_MUTATION_ITEMS} items`,
    );
  }
  return uniqueIds;
}

export const save = mutation({
  args: {
    expectedUserId: v.optional(v.string()),
    collectionId: v.string(),
    name: v.string(),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
    removed: v.optional(v.boolean()),
    generation: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId, generation, resolveClock } =
      await requireSyncMutationContext(ctx, args);
    const legacyNow = Date.now();
    const updatedAt = resolveClock(args.updatedAt, legacyNow);
    const createdAt = resolveClock(args.createdAt, legacyNow);

    const matches = currentSyncGenerationRows(await ctx.db
      .query("collections")
      .withIndex("by_user_collection", (q) =>
        q.eq("userId", userId).eq("collectionId", args.collectionId),
      )
      .collect(), generation);
    const existing = newestLwwRecord(matches, (item) => item.removed === true);
    const lastRemovedAt = maximumRemovalBarrier(matches);

    if (existing && lastRemovedAt !== existing.lastRemovedAt) {
      await ctx.db.patch(existing._id, { lastRemovedAt });
    }

    await pruneDuplicateRows(ctx.db, matches, existing);

    if (existing) {
      if (!shouldApplyLww(existing.updatedAt, updatedAt)) return null;
      await ctx.db.patch(existing._id, {
        name: args.name,
        createdAt,
        updatedAt,
        removed: false,
        lastRemovedAt,
      });
      return null;
    }

    await ctx.db.insert("collections", {
      userId,
      syncGeneration: storedSyncGeneration(generation),
      collectionId: args.collectionId,
      name: args.name,
      createdAt,
      updatedAt,
      removed: false,
    });
    return null;
  },
});

export const remove = mutation({
  args: {
    expectedUserId: v.optional(v.string()),
    collectionId: v.string(),
    updatedAt: v.optional(v.number()),
    generation: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId, generation, resolveClock } =
      await requireSyncMutationContext(ctx, args);
    const updatedAt = resolveClock(args.updatedAt, Date.now());

    const matches = currentSyncGenerationRows(await ctx.db
      .query("collections")
      .withIndex("by_user_collection", (q) =>
        q.eq("userId", userId).eq("collectionId", args.collectionId),
      )
      .collect(), generation);
    const collection = newestLwwRecord(matches, (item) => item.removed === true);
    const lastRemovedAt = maximumRemovalBarrier(matches);

    if (collection && lastRemovedAt !== collection.lastRemovedAt) {
      await ctx.db.patch(collection._id, { lastRemovedAt });
    }

    await pruneDuplicateRows(ctx.db, matches, collection);

    let removalAccepted = false;
    if (collection) {
      if (shouldApplyLww(collection.updatedAt, updatedAt)) {
        await ctx.db.patch(collection._id, {
          removed: true,
          updatedAt,
          lastRemovedAt:
            lastRemovedAt === undefined
              ? updatedAt
              : Math.max(lastRemovedAt, updatedAt),
        });
        removalAccepted = true;
      } else if (collection.removed && collection.updatedAt === updatedAt) {
        // An idempotent client retry must also be able to restart a durable
        // cascade whose earlier scheduled continuation failed.
        removalAccepted = true;
      }
    } else {
      await ctx.db.insert("collections", {
        userId,
        syncGeneration: storedSyncGeneration(generation),
        collectionId: args.collectionId,
        name: "",
        createdAt: updatedAt,
        updatedAt,
        removed: true,
        lastRemovedAt: updatedAt,
      });
      removalAccepted = true;
    }

    if (!removalAccepted) return null;

    // A collection may contain tens of thousands of memberships. Schedule a
    // bounded durable cascade instead of exceeding Convex's per-transaction
    // indexed-range/read limits in this user mutation.
    await ctx.scheduler.runAfter(0, internal.collections.cascadeRemovedItems, {
      userId,
      collectionId: args.collectionId,
      generation,
      updatedAt,
    });
    return null;
  },
});

export const cascadeRemovedItems = internalMutation({
  args: {
    userId: v.string(),
    collectionId: v.string(),
    generation: v.number(),
    updatedAt: v.number(),
    cursor: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("collection_items")
      .withIndex("by_user_collection", (q) =>
        q.eq("userId", args.userId).eq("collectionId", args.collectionId),
      )
      .paginate({
        cursor: args.cursor ?? null,
        numItems: COLLECTION_CASCADE_PAGE_ITEMS,
      });
    const libraryItemIds = new Set(
      currentSyncGenerationRows(page.page, args.generation).map(
        (item) => item.libraryItemId,
      ),
    );

    // Re-read each logical key so duplicates split across page boundaries are
    // canonicalized together. The page bound keeps this well below platform
    // transaction limits.
    for (const libraryItemId of libraryItemIds) {
      const matches = currentSyncGenerationRows(await ctx.db
        .query("collection_items")
        .withIndex("by_user_collection_item", (q) =>
          q
            .eq("userId", args.userId)
            .eq("collectionId", args.collectionId)
            .eq("libraryItemId", libraryItemId),
        )
        .collect(), args.generation);
      const newest = newestLwwRecord(matches, (item) => item.removed === true);
      await pruneDuplicateRows(ctx.db, matches, newest);
      if (!newest || !shouldApplyLww(newest.updatedAt, args.updatedAt)) continue;
      await ctx.db.patch(newest._id, {
        removed: true,
        updatedAt: args.updatedAt,
      });
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.collections.cascadeRemovedItems, {
        ...args,
        cursor: page.continueCursor,
      });
    }
    return null;
  },
});

export const addItems = mutation({
  args: {
    expectedUserId: v.optional(v.string()),
    collectionId: v.string(),
    libraryItemIds: v.array(v.string()),
    updatedAt: v.optional(v.number()),
    generation: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId, generation, resolveClock } =
      await requireSyncMutationContext(ctx, args);
    const updatedAt = resolveClock(args.updatedAt, Date.now());
    const uniqueIds = requireBoundedMembershipBatch(args.libraryItemIds);

    const collectionMatches = currentSyncGenerationRows(await ctx.db
      .query("collections")
      .withIndex("by_user_collection", (q) =>
        q.eq("userId", userId).eq("collectionId", args.collectionId),
      )
      .collect(), generation);
    const collection = newestLwwRecord(
      collectionMatches,
      (item) => item.removed === true,
    );
    const collectionLastRemovedAt = maximumRemovalBarrier(collectionMatches);

    if (
      collection &&
      collectionLastRemovedAt !== collection.lastRemovedAt
    ) {
      await ctx.db.patch(collection._id, {
        lastRemovedAt: collectionLastRemovedAt,
      });
    }

    await pruneDuplicateRows(ctx.db, collectionMatches, collection);

    if (!collection || collection.removed) {
      throw new Error("Collection not found");
    }
    if (!isAfterRemovalBarrier(collectionLastRemovedAt, updatedAt)) {
      return null;
    }

    for (const libraryItemId of uniqueIds) {
      const libraryParents = currentSyncGenerationRows(await ctx.db
        .query("library_items")
        .withIndex("by_user_item", (q) =>
          q.eq("userId", userId).eq("libraryItemId", libraryItemId),
        )
        .collect(), generation);
      const libraryLastRemovedAt = maximumRemovalBarrier(libraryParents);
      if (!isAfterRemovalBarrier(libraryLastRemovedAt, updatedAt)) {
        continue;
      }
      const matches = currentSyncGenerationRows(await ctx.db
        .query("collection_items")
        .withIndex("by_user_collection_item", (q) =>
          q
            .eq("userId", userId)
            .eq("collectionId", args.collectionId)
            .eq("libraryItemId", libraryItemId),
        )
        .collect(), generation);
      const existing = newestLwwRecord(matches, (item) => item.removed === true);

      await pruneDuplicateRows(ctx.db, matches, existing);

      if (existing) {
        if (!shouldApplyLww(existing.updatedAt, updatedAt)) continue;
        await ctx.db.patch(existing._id, {
          removed: false,
          updatedAt,
        });
        continue;
      }

      await ctx.db.insert("collection_items", {
        userId,
        syncGeneration: storedSyncGeneration(generation),
        collectionId: args.collectionId,
        libraryItemId,
        addedAt: updatedAt,
        updatedAt,
        removed: false,
      });
    }
    return null;
  },
});

export const removeItems = mutation({
  args: {
    expectedUserId: v.optional(v.string()),
    collectionId: v.string(),
    libraryItemIds: v.array(v.string()),
    updatedAt: v.optional(v.number()),
    generation: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId, generation, resolveClock } =
      await requireSyncMutationContext(ctx, args);
    const updatedAt = resolveClock(args.updatedAt, Date.now());

    const collectionParents = currentSyncGenerationRows(await ctx.db
      .query("collections")
      .withIndex("by_user_collection", (q) =>
        q.eq("userId", userId).eq("collectionId", args.collectionId),
      )
      .collect(), generation);
    const collectionLastRemovedAt = maximumRemovalBarrier(collectionParents);
    if (!isAfterRemovalBarrier(collectionLastRemovedAt, updatedAt)) {
      return null;
    }

    for (const libraryItemId of requireBoundedMembershipBatch(args.libraryItemIds)) {
      const libraryParents = currentSyncGenerationRows(await ctx.db
        .query("library_items")
        .withIndex("by_user_item", (q) =>
          q.eq("userId", userId).eq("libraryItemId", libraryItemId),
        )
        .collect(), generation);
      const libraryLastRemovedAt = maximumRemovalBarrier(libraryParents);
      if (!isAfterRemovalBarrier(libraryLastRemovedAt, updatedAt)) {
        continue;
      }
      const matches = currentSyncGenerationRows(await ctx.db
        .query("collection_items")
        .withIndex("by_user_collection_item", (q) =>
          q
            .eq("userId", userId)
            .eq("collectionId", args.collectionId)
            .eq("libraryItemId", libraryItemId),
        )
        .collect(), generation);
      const existing = newestLwwRecord(matches, (item) => item.removed === true);

      await pruneDuplicateRows(ctx.db, matches, existing);

      if (existing) {
        if (!shouldApplyLww(existing.updatedAt, updatedAt)) continue;
        await ctx.db.patch(existing._id, {
          removed: true,
          updatedAt,
        });
      } else {
        await ctx.db.insert("collection_items", {
          userId,
          syncGeneration: storedSyncGeneration(generation),
          collectionId: args.collectionId,
          libraryItemId,
          addedAt: updatedAt,
          updatedAt,
          removed: true,
        });
      }
    }
    return null;
  },
});

export const clearAll = mutation({
  args: { generation: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    await requireSyncGeneration(ctx, userId, args.generation);
    throw new Error("SYNC_CLEAR_ALL_REQUIRED");
  },
});
