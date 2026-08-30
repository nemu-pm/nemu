import { v } from "convex/values";
import { internalMutation, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireAuth } from "./_lib";
import {
  isAfterRemovalBarrier,
  maximumRemovalBarrier,
  newestLwwRecord,
  pruneDuplicateRows,
  shouldApplyLww,
} from "./lww";
import {
  currentSyncGenerationRows,
  getCurrentSyncGeneration,
  requireSyncGeneration,
  storedSyncGeneration,
} from "./syncGeneration";
import { requireSyncMutationContext } from "./syncCompatibility";
import {
  finishRemovalCascade,
  isRemovalCascadeOwner,
  newRemovalCascadeLock,
  REMOVAL_CASCADE_LEASE_MS,
  REMOVAL_CASCADE_MAX_RECOVERY_ATTEMPTS,
  removalCascadeLeaseIsActive,
  type RemovalCascadeLock,
} from "./removalCascade";
import {
  MAX_LIBRARY_MERGE_ALIAS_HOPS,
  resolveLibraryMergeAlias,
} from "./libraryMerge";

// Each membership performs indexed parent + membership reads. Bound direct
// callers as defense in depth; first-party clients split larger selections.
const MAX_COLLECTION_MUTATION_ITEMS = 256;
// In addition to the one parent and one membership read per item, cap the
// aggregate alias traversal work so an adversarial batch of maximum-depth
// chains cannot exceed Convex's transaction read budget.
const MAX_COLLECTION_MUTATION_ALIAS_HOPS = 512;
const COLLECTION_CASCADE_PAGE_ITEMS = 128;
export const COLLECTION_CASCADE_LEASE_MS = REMOVAL_CASCADE_LEASE_MS;
export const COLLECTION_CASCADE_MAX_RECOVERY_ATTEMPTS =
  REMOVAL_CASCADE_MAX_RECOVERY_ATTEMPTS;

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

    const matches = currentSyncGenerationRows(
      await ctx.db
        .query("collections")
        .withIndex("by_user_collection", (q) =>
          q.eq("userId", userId).eq("collectionId", args.collectionId),
        )
        .collect(),
      generation,
    );
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
    const now = Date.now();
    const updatedAt = resolveClock(args.updatedAt, now);

    const matches = currentSyncGenerationRows(
      await ctx.db
        .query("collections")
        .withIndex("by_user_collection", (q) =>
          q.eq("userId", userId).eq("collectionId", args.collectionId),
        )
        .collect(),
      generation,
    );
    const collection = newestLwwRecord(
      matches,
      (item) => item.removed === true,
    );
    const lastRemovedAt = maximumRemovalBarrier(matches);

    if (collection && lastRemovedAt !== collection.lastRemovedAt) {
      await ctx.db.patch(collection._id, { lastRemovedAt });
    }

    await pruneDuplicateRows(ctx.db, matches, collection);

    let cascadeLock: RemovalCascadeLock | undefined;
    if (collection) {
      if (shouldApplyLww(collection.updatedAt, updatedAt)) {
        cascadeLock = newRemovalCascadeLock({
          scope: "collection",
          generation,
          parentId: args.collectionId,
          removedAt: updatedAt,
          startedAt: now,
          previousLock: collection.membershipRemovalCascade,
        });
        await ctx.db.patch(collection._id, {
          removed: true,
          updatedAt,
          lastRemovedAt:
            lastRemovedAt === undefined
              ? updatedAt
              : Math.max(lastRemovedAt, updatedAt),
          membershipRemovalCascade: cascadeLock,
        });
      } else if (collection.removed && collection.updatedAt === updatedAt) {
        const existingLock = collection.membershipRemovalCascade;
        if (
          existingLock?.removedAt === updatedAt &&
          existingLock.status === "completed"
        ) {
          return null;
        }
        cascadeLock =
          existingLock?.removedAt === updatedAt &&
          removalCascadeLeaseIsActive(existingLock, now)
            ? existingLock
            : newRemovalCascadeLock({
                scope: "collection",
                generation,
                parentId: args.collectionId,
                removedAt: updatedAt,
                startedAt: now,
                previousLock: existingLock,
              });
        if (cascadeLock !== existingLock) {
          await ctx.db.patch(collection._id, {
            membershipRemovalCascade: cascadeLock,
          });
        }
      }
    } else {
      cascadeLock = newRemovalCascadeLock({
        scope: "collection",
        generation,
        parentId: args.collectionId,
        removedAt: updatedAt,
        startedAt: now,
      });
      await ctx.db.insert("collections", {
        userId,
        syncGeneration: storedSyncGeneration(generation),
        collectionId: args.collectionId,
        name: "",
        createdAt: updatedAt,
        updatedAt,
        removed: true,
        lastRemovedAt: updatedAt,
        membershipRemovalCascade: cascadeLock,
      });
    }

    if (!cascadeLock) return null;

    // A collection may contain tens of thousands of memberships. Schedule a
    // bounded durable cascade instead of exceeding Convex's per-transaction
    // indexed-range/read limits in this user mutation.
    await ctx.scheduler.runAfter(0, internal.collections.cascadeRemovedItems, {
      userId,
      collectionId: args.collectionId,
      generation,
      updatedAt,
      operationId: cascadeLock.operationId,
    });
    await ctx.scheduler.runAfter(
      Math.max(0, cascadeLock.leaseExpiresAt! - now),
      internal.collections.recoverRemovedItemsCascade,
      {
        userId,
        collectionId: args.collectionId,
        generation,
        updatedAt,
        operationId: cascadeLock.operationId,
      },
    );
    return null;
  },
});

export const cascadeRemovedItems = internalMutation({
  args: {
    userId: v.string(),
    collectionId: v.string(),
    generation: v.number(),
    updatedAt: v.number(),
    // Optional while continuations from the pre-watchdog deployment drain.
    operationId: v.optional(v.string()),
    cursor: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (
      (await getCurrentSyncGeneration(ctx, args.userId)) !== args.generation
    ) {
      return null;
    }
    const collectionRows = currentSyncGenerationRows(
      await ctx.db
        .query("collections")
        .withIndex("by_user_collection", (q) =>
          q.eq("userId", args.userId).eq("collectionId", args.collectionId),
        )
        .collect(),
      args.generation,
    );
    const collection = newestLwwRecord(
      collectionRows,
      (item) => item.removed === true,
    );
    if (!collection) return null;

    if (args.operationId === undefined) {
      if (maximumRemovalBarrier(collectionRows) !== args.updatedAt) return null;
      const existingLock = collection.membershipRemovalCascade;
      if (existingLock && existingLock.removedAt >= args.updatedAt) return null;
      const now = Date.now();
      const cascadeLock = newRemovalCascadeLock({
        scope: "collection",
        generation: args.generation,
        parentId: args.collectionId,
        removedAt: args.updatedAt,
        startedAt: now,
        previousLock: existingLock,
      });
      await ctx.db.patch(collection._id, {
        membershipRemovalCascade: cascadeLock,
      });
      await ctx.scheduler.runAfter(
        0,
        internal.collections.cascadeRemovedItems,
        {
          userId: args.userId,
          collectionId: args.collectionId,
          generation: args.generation,
          updatedAt: args.updatedAt,
          operationId: cascadeLock.operationId,
        },
      );
      await ctx.scheduler.runAfter(
        REMOVAL_CASCADE_LEASE_MS,
        internal.collections.recoverRemovedItemsCascade,
        {
          userId: args.userId,
          collectionId: args.collectionId,
          generation: args.generation,
          updatedAt: args.updatedAt,
          operationId: cascadeLock.operationId,
        },
      );
      return null;
    }

    if (
      !isRemovalCascadeOwner(collection.membershipRemovalCascade, {
        removedAt: args.updatedAt,
        operationId: args.operationId,
      })
    ) {
      return null;
    }

    const now = Date.now();
    let cascadeLock = collection.membershipRemovalCascade;
    if (
      (cascadeLock.leaseExpiresAt ?? 0) <=
      now + REMOVAL_CASCADE_LEASE_MS / 2
    ) {
      cascadeLock = {
        ...cascadeLock,
        leaseExpiresAt: now + REMOVAL_CASCADE_LEASE_MS,
      };
      await ctx.db.patch(collection._id, {
        membershipRemovalCascade: cascadeLock,
      });
    }
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
      const matches = currentSyncGenerationRows(
        await ctx.db
          .query("collection_items")
          .withIndex("by_user_collection_item", (q) =>
            q
              .eq("userId", args.userId)
              .eq("collectionId", args.collectionId)
              .eq("libraryItemId", libraryItemId),
          )
          .collect(),
        args.generation,
      );
      const newest = newestLwwRecord(matches, (item) => item.removed === true);
      await pruneDuplicateRows(ctx.db, matches, newest);
      if (!newest || !shouldApplyLww(newest.updatedAt, args.updatedAt))
        continue;
      await ctx.db.patch(newest._id, {
        removed: true,
        updatedAt: args.updatedAt,
      });
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.collections.cascadeRemovedItems,
        {
          ...args,
          cursor: page.continueCursor,
        },
      );
      return null;
    }
    await ctx.db.patch(collection._id, {
      membershipRemovalCascade: finishRemovalCascade(
        cascadeLock,
        "completed",
        now,
      ),
    });
    return null;
  },
});

export const recoverRemovedItemsCascade = internalMutation({
  args: {
    userId: v.string(),
    collectionId: v.string(),
    generation: v.number(),
    updatedAt: v.number(),
    operationId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (
      (await getCurrentSyncGeneration(ctx, args.userId)) !== args.generation
    ) {
      return null;
    }
    const collectionRows = currentSyncGenerationRows(
      await ctx.db
        .query("collections")
        .withIndex("by_user_collection", (q) =>
          q.eq("userId", args.userId).eq("collectionId", args.collectionId),
        )
        .collect(),
      args.generation,
    );
    const collection = newestLwwRecord(
      collectionRows,
      (item) => item.removed === true,
    );
    const cascadeLock = collection?.membershipRemovalCascade;
    if (
      !collection ||
      !isRemovalCascadeOwner(cascadeLock, {
        removedAt: args.updatedAt,
        operationId: args.operationId,
      })
    ) {
      return null;
    }

    const now = Date.now();
    if ((cascadeLock.leaseExpiresAt ?? 0) > now) {
      await ctx.scheduler.runAfter(
        cascadeLock.leaseExpiresAt! - now,
        internal.collections.recoverRemovedItemsCascade,
        args,
      );
      return null;
    }

    const recoveryAttempts = cascadeLock.recoveryAttempts + 1;
    if (recoveryAttempts > REMOVAL_CASCADE_MAX_RECOVERY_ATTEMPTS) {
      await ctx.db.patch(collection._id, {
        membershipRemovalCascade: finishRemovalCascade(
          { ...cascadeLock, recoveryAttempts },
          "exhausted",
          now,
        ),
      });
      console.error(
        "[collection-membership-cascade] recovery exhausted",
        JSON.stringify({
          generation: args.generation,
          recoveryAttempts,
        }),
      );
      return null;
    }

    const renewedLock: RemovalCascadeLock = {
      ...cascadeLock,
      leaseExpiresAt: now + REMOVAL_CASCADE_LEASE_MS,
      recoveryAttempts,
    };
    await ctx.db.patch(collection._id, {
      membershipRemovalCascade: renewedLock,
    });
    await ctx.scheduler.runAfter(0, internal.collections.cascadeRemovedItems, {
      ...args,
    });
    await ctx.scheduler.runAfter(
      REMOVAL_CASCADE_LEASE_MS,
      internal.collections.recoverRemovedItemsCascade,
      args,
    );
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

    const collectionMatches = currentSyncGenerationRows(
      await ctx.db
        .query("collections")
        .withIndex("by_user_collection", (q) =>
          q.eq("userId", userId).eq("collectionId", args.collectionId),
        )
        .collect(),
      generation,
    );
    const collection = newestLwwRecord(
      collectionMatches,
      (item) => item.removed === true,
    );
    const collectionLastRemovedAt = maximumRemovalBarrier(collectionMatches);

    if (collection && collectionLastRemovedAt !== collection.lastRemovedAt) {
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

    const processedLibraryItemIds = new Set<string>();
    let remainingAliasHops = MAX_COLLECTION_MUTATION_ALIAS_HOPS;
    for (const requestedLibraryItemId of uniqueIds) {
      const resolved = await resolveLibraryMergeAlias(
        ctx,
        userId,
        generation,
        requestedLibraryItemId,
        {
          maxHops: Math.min(remainingAliasHops, MAX_LIBRARY_MERGE_ALIAS_HOPS),
        },
      );
      remainingAliasHops -= resolved.chain.length - 1;
      if (
        resolved.chain.length > 1 &&
        (!resolved.item || resolved.item.inLibrary === false)
      ) {
        continue;
      }
      const libraryItemId = resolved.libraryItemId;
      if (processedLibraryItemIds.has(libraryItemId)) continue;
      processedLibraryItemIds.add(libraryItemId);
      const libraryLastRemovedAt = maximumRemovalBarrier(resolved.rows);
      if (!isAfterRemovalBarrier(libraryLastRemovedAt, updatedAt)) {
        continue;
      }
      const matches = currentSyncGenerationRows(
        await ctx.db
          .query("collection_items")
          .withIndex("by_user_collection_item", (q) =>
            q
              .eq("userId", userId)
              .eq("collectionId", args.collectionId)
              .eq("libraryItemId", libraryItemId),
          )
          .collect(),
        generation,
      );
      const existing = newestLwwRecord(
        matches,
        (item) => item.removed === true,
      );

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

    const collectionParents = currentSyncGenerationRows(
      await ctx.db
        .query("collections")
        .withIndex("by_user_collection", (q) =>
          q.eq("userId", userId).eq("collectionId", args.collectionId),
        )
        .collect(),
      generation,
    );
    const collectionLastRemovedAt = maximumRemovalBarrier(collectionParents);
    if (!isAfterRemovalBarrier(collectionLastRemovedAt, updatedAt)) {
      return null;
    }

    const processedLibraryItemIds = new Set<string>();
    let remainingAliasHops = MAX_COLLECTION_MUTATION_ALIAS_HOPS;
    for (const requestedLibraryItemId of requireBoundedMembershipBatch(
      args.libraryItemIds,
    )) {
      const resolved = await resolveLibraryMergeAlias(
        ctx,
        userId,
        generation,
        requestedLibraryItemId,
        {
          maxHops: Math.min(remainingAliasHops, MAX_LIBRARY_MERGE_ALIAS_HOPS),
        },
      );
      remainingAliasHops -= resolved.chain.length - 1;
      if (
        resolved.chain.length > 1 &&
        (!resolved.item || resolved.item.inLibrary === false)
      ) {
        continue;
      }
      const libraryItemId = resolved.libraryItemId;
      if (processedLibraryItemIds.has(libraryItemId)) continue;
      processedLibraryItemIds.add(libraryItemId);
      const libraryLastRemovedAt = maximumRemovalBarrier(resolved.rows);
      if (!isAfterRemovalBarrier(libraryLastRemovedAt, updatedAt)) {
        continue;
      }
      const matches = currentSyncGenerationRows(
        await ctx.db
          .query("collection_items")
          .withIndex("by_user_collection_item", (q) =>
            q
              .eq("userId", userId)
              .eq("collectionId", args.collectionId)
              .eq("libraryItemId", libraryItemId),
          )
          .collect(),
        generation,
      );
      const existing = newestLwwRecord(
        matches,
        (item) => item.removed === true,
      );

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
