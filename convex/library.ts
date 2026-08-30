import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  canonicalizeLwwRecords,
  isAfterRemovalBarrier,
  maximumRemovalBarrier,
  newestLwwRecord,
  shouldApplyLww,
  pruneDuplicateRows,
} from "./lww";
import {
  currentSyncGenerationRows,
  getCurrentSyncGeneration,
  storedSyncGeneration,
} from "./syncGeneration";
import { requireSyncMutationContext } from "./syncCompatibility";
import { beginSyncReset } from "./syncReset";
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
  newestLibraryMergeAwareItem,
  resolveLibraryMergeAlias,
} from "./libraryMerge";

const metadataValidator = v.object({
  title: v.string(),
  cover: v.optional(v.string()),
  authors: v.optional(v.array(v.string())),
  description: v.optional(v.string()),
  tags: v.optional(v.array(v.string())),
  status: v.optional(v.number()),
  url: v.optional(v.string()),
});

const metadataPartialValidator = v.object({
  title: v.optional(v.string()),
  cover: v.optional(v.string()),
  authors: v.optional(v.array(v.string())),
  description: v.optional(v.string()),
  tags: v.optional(v.array(v.string())),
  status: v.optional(v.number()),
  url: v.optional(v.string()),
});

const externalIdsValidator = v.object({
  mangaUpdates: v.optional(v.number()),
  aniList: v.optional(v.number()),
  mal: v.optional(v.number()),
});

const chapterSummaryValidator = v.object({
  id: v.string(),
  title: v.optional(v.string()),
  chapterNumber: v.optional(v.number()),
  volumeNumber: v.optional(v.number()),
  lang: v.optional(v.string()),
});

const sourceLinkValidator = v.object({
  registryId: v.string(),
  sourceId: v.string(),
  sourceMangaId: v.string(),
  latestChapter: v.optional(chapterSummaryValidator),
  latestChapterSortKey: v.optional(v.string()),
  latestFetchedAt: v.optional(v.number()),
  updateAckChapter: v.optional(chapterSummaryValidator),
  updateAckChapterSortKey: v.optional(v.string()),
  updateAckAt: v.optional(v.number()),
  createdAt: v.optional(v.number()),
  updatedAt: v.optional(v.number()),
  removed: v.optional(v.boolean()),
});

const MAX_LIBRARY_SOURCE_LINKS = 256;
const LIBRARY_MEMBERSHIP_CASCADE_PAGE_ITEMS = 128;
export const LIBRARY_MEMBERSHIP_CASCADE_LEASE_MS = REMOVAL_CASCADE_LEASE_MS;
export const LIBRARY_MEMBERSHIP_CASCADE_MAX_RECOVERY_ATTEMPTS =
  REMOVAL_CASCADE_MAX_RECOVERY_ATTEMPTS;

function requireBoundedSourceLinks<T>(sources: T[]): T[] {
  if (sources.length > MAX_LIBRARY_SOURCE_LINKS) {
    throw new Error(
      `Library source batch exceeds ${MAX_LIBRARY_SOURCE_LINKS} links`,
    );
  }
  return sources;
}

export const save = mutation({
  args: {
    expectedUserId: v.optional(v.string()),
    libraryItemId: v.string(),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
    generation: v.optional(v.number()),
    metadata: metadataValidator,
    overrides: v.optional(
      v.object({
        metadata: v.optional(v.union(metadataPartialValidator, v.null())),
        coverUrl: v.optional(v.union(v.string(), v.null())),
      }),
    ),
    externalIds: v.optional(externalIdsValidator),
    sourceOrder: v.optional(v.array(v.string())),
    sources: v.array(sourceLinkValidator),
    sourcesMode: v.optional(v.union(v.literal("merge"), v.literal("replace"))),
  },
  handler: async (ctx, args) => {
    const { userId, generation, resolveClock } =
      await requireSyncMutationContext(ctx, args);
    const legacyNow = Date.now();
    const updatedAt = resolveClock(args.updatedAt, legacyNow);
    const createdAt = resolveClock(args.createdAt, legacyNow);
    const sources: SourceLinkInput[] = requireBoundedSourceLinks(
      args.sources,
    ).map((source) => ({
      ...source,
      createdAt: resolveClock(source.createdAt, legacyNow),
      updatedAt: resolveClock(source.updatedAt, legacyNow),
    }));

    const existingItems = currentSyncGenerationRows(
      await ctx.db
        .query("library_items")
        .withIndex("by_user_item", (q) =>
          q.eq("userId", userId).eq("libraryItemId", args.libraryItemId),
        )
        .collect(),
      generation,
    );
    const existing = newestLibraryMergeAwareItem(existingItems);
    const parentLastRemovedAt = maximumRemovalBarrier(existingItems);

    if (existing && parentLastRemovedAt !== existing.lastRemovedAt) {
      await ctx.db.patch(existing._id, { lastRemovedAt: parentLastRemovedAt });
    }

    await pruneDuplicateRows(ctx.db, existingItems, existing);

    if (existing?.mergedIntoLibraryItemId !== undefined) {
      // A merge is an identity operation, not an ordinary LWW deletion. A
      // stale offline device may carry a later clock, but it must never revive
      // the old item or move globally keyed source links away from the
      // survivor. Resolve here to fail closed on a corrupt alias chain.
      await resolveLibraryMergeAlias(
        ctx,
        userId,
        generation,
        args.libraryItemId,
      );
      return null;
    }

    if (existing) {
      const mode = args.sourcesMode ?? "merge";

      if (shouldApplyLww(existing.updatedAt, updatedAt)) {
        await ctx.db.patch(existing._id, {
          metadata: args.metadata,
          inLibrary: true,
          createdAt,
          // Preserve existing overrides unless explicitly provided (including null clears).
          // This mutation is also used to upsert source links, and those calls do not always include overrides.
          overrides: args.overrides ?? existing.overrides,
          externalIds: args.externalIds ?? existing.externalIds,
          sourceOrder: args.sourceOrder ?? existing.sourceOrder,
          updatedAt,
          lastRemovedAt: parentLastRemovedAt,
        });
      }

      const replacementTombstones: SourceLinkInput[] = [];
      if (mode === "replace") {
        const existingLinks = await ctx.db
          .query("library_source_links")
          .withIndex("by_user_generation_item", (q) =>
            q
              .eq("userId", userId)
              .eq("syncGeneration", storedSyncGeneration(generation))
              .eq("libraryItemId", args.libraryItemId),
          )
          .take(MAX_LIBRARY_SOURCE_LINKS + 1);
        if (existingLinks.length > MAX_LIBRARY_SOURCE_LINKS) {
          throw new Error(
            `Library source replacement exceeds ${MAX_LIBRARY_SOURCE_LINKS} existing links`,
          );
        }
        const incomingKeys = new Set(sources.map(sourceLinkKey));
        const canonicalLinks = canonicalizeLwwRecords(
          existingLinks,
          sourceLinkKey,
          (link) => link.removed === true,
        );
        for (const link of canonicalLinks) {
          const key = sourceLinkKey(link);
          if (
            incomingKeys.has(key) ||
            !shouldApplyLww(link.updatedAt, updatedAt)
          ) {
            continue;
          }
          replacementTombstones.push({
            registryId: link.registryId,
            sourceId: link.sourceId,
            sourceMangaId: link.sourceMangaId,
            createdAt: link.createdAt,
            updatedAt,
            removed: true,
          });
        }
      }

      await writeSourceLinks(
        ctx,
        userId,
        args.libraryItemId,
        [...sources, ...replacementTombstones],
        parentLastRemovedAt,
        generation,
      );
    } else {
      await ctx.db.insert("library_items", {
        userId,
        syncGeneration: storedSyncGeneration(generation),
        libraryItemId: args.libraryItemId,
        metadata: args.metadata,
        inLibrary: true,
        externalIds: args.externalIds,
        overrides: args.overrides,
        sourceOrder: args.sourceOrder,
        createdAt,
        updatedAt,
      });

      await writeSourceLinks(
        ctx,
        userId,
        args.libraryItemId,
        sources,
        undefined,
        generation,
      );
    }
  },
});

// ============================================================================
// Helper functions
// ============================================================================

import type { MutationCtx } from "./_generated/server";

type ChapterSummaryInput = {
  id: string;
  title?: string;
  chapterNumber?: number;
  volumeNumber?: number;
  lang?: string;
};

type SourceLinkInput = {
  registryId: string;
  sourceId: string;
  sourceMangaId: string;
  latestChapter?: ChapterSummaryInput;
  latestChapterSortKey?: string;
  latestFetchedAt?: number;
  updateAckChapter?: ChapterSummaryInput;
  updateAckChapterSortKey?: string;
  updateAckAt?: number;
  createdAt: number;
  updatedAt: number;
  removed?: boolean;
};

type ExistingLink = {
  _id: Id<"library_source_links">;
  registryId: string;
  sourceId: string;
  sourceMangaId: string;
  latestChapter?: ChapterSummaryInput;
  latestChapterSortKey?: string;
  latestFetchedAt?: number;
  updateAckChapter?: ChapterSummaryInput;
  updateAckChapterSortKey?: string;
  updateAckAt?: number;
  createdAt: number;
  updatedAt: number;
  removed?: boolean;
};

function sourceLinkKey(source: {
  registryId: string;
  sourceId: string;
  sourceMangaId: string;
}): string {
  return `${source.registryId}\u0000${source.sourceId}\u0000${source.sourceMangaId}`;
}

async function writeSourceLinks(
  ctx: MutationCtx,
  userId: string,
  libraryItemId: string,
  sources: SourceLinkInput[],
  parentLastRemovedAt: number | undefined,
  generation: number,
) {
  const buildSortKey = (ch?: {
    chapterNumber?: number;
    volumeNumber?: number;
    id: string;
  }) => {
    if (!ch) return undefined;
    const vol = ch.volumeNumber?.toString().padStart(5, "0") ?? "99999";
    const chNum = ch.chapterNumber?.toString().padStart(8, "0") ?? "99999999";
    return `V${vol}C${chNum}:${ch.id}`;
  };

  for (const source of sources) {
    if (!isAfterRemovalBarrier(parentLastRemovedAt, source.updatedAt)) {
      continue;
    }
    const sourceMatches = currentSyncGenerationRows(
      await ctx.db
        .query("library_source_links")
        .withIndex("by_user_source_manga", (q) =>
          q
            .eq("userId", userId)
            .eq("registryId", source.registryId)
            .eq("sourceId", source.sourceId)
            .eq("sourceMangaId", source.sourceMangaId),
        )
        .collect(),
      generation,
    );
    const existing = newestLwwRecord(
      sourceMatches,
      (link) => link.removed === true,
    ) as ExistingLink | undefined;

    await pruneDuplicateRows(ctx.db, sourceMatches, existing);

    if (existing) {
      if (!shouldApplyLww(existing.updatedAt, source.updatedAt)) continue;

      // Merge chapter info
      const mergedLatest = source.latestChapter ?? existing.latestChapter;
      const mergedAck = source.updateAckChapter ?? existing.updateAckChapter;
      const latestChapterSortKey =
        source.latestChapterSortKey ??
        (source.latestChapter
          ? buildSortKey(source.latestChapter)
          : (existing.latestChapterSortKey ?? buildSortKey(mergedLatest)));
      const updateAckChapterSortKey =
        source.updateAckChapterSortKey ??
        (source.updateAckChapter
          ? buildSortKey(source.updateAckChapter)
          : (existing.updateAckChapterSortKey ?? buildSortKey(mergedAck)));

      await ctx.db.patch(existing._id, {
        libraryItemId,
        latestChapter: mergedLatest,
        latestChapterSortKey,
        latestFetchedAt: source.latestFetchedAt ?? existing.latestFetchedAt,
        updateAckChapter: mergedAck,
        updateAckChapterSortKey,
        updateAckAt: source.updateAckAt ?? existing.updateAckAt,
        removed: source.removed ?? false,
        updatedAt: source.updatedAt,
      });
    } else {
      await ctx.db.insert("library_source_links", {
        userId,
        syncGeneration: storedSyncGeneration(generation),
        libraryItemId,
        registryId: source.registryId,
        sourceId: source.sourceId,
        sourceMangaId: source.sourceMangaId,
        latestChapter: source.latestChapter,
        latestChapterSortKey:
          source.latestChapterSortKey ?? buildSortKey(source.latestChapter),
        latestFetchedAt: source.latestFetchedAt,
        updateAckChapter: source.updateAckChapter,
        updateAckChapterSortKey:
          source.updateAckChapterSortKey ??
          buildSortKey(source.updateAckChapter),
        updateAckAt: source.updateAckAt,
        createdAt: source.createdAt,
        updatedAt: source.updatedAt,
        removed: source.removed ?? false,
      });
    }
  }
}

export const remove = mutation({
  args: {
    expectedUserId: v.optional(v.string()),
    libraryItemId: v.string(),
    /** Merge-only survivor; omitted for an ordinary library deletion. */
    mergeTargetLibraryItemId: v.optional(v.string()),
    updatedAt: v.optional(v.number()),
    generation: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { userId, generation, resolveClock } =
      await requireSyncMutationContext(ctx, args);
    const now = Date.now();
    const updatedAt = resolveClock(args.updatedAt, now);

    let mergeTargetLibraryItemId: string | undefined;
    if (args.mergeTargetLibraryItemId !== undefined) {
      const target = await resolveLibraryMergeAlias(
        ctx,
        userId,
        generation,
        args.mergeTargetLibraryItemId,
      );
      if (target.libraryItemId === args.libraryItemId) {
        throw new Error("Library merge target must differ from its source.");
      }
      if (!target.item || target.item.inLibrary === false) {
        throw new Error("Library merge target is missing or removed.");
      }
      mergeTargetLibraryItemId = target.libraryItemId;
    }

    const libraryItems = currentSyncGenerationRows(
      await ctx.db
        .query("library_items")
        .withIndex("by_user_item", (q) =>
          q.eq("userId", userId).eq("libraryItemId", args.libraryItemId),
        )
        .collect(),
      generation,
    );
    const libraryItem = newestLibraryMergeAwareItem(libraryItems);
    const lastRemovedAt = maximumRemovalBarrier(libraryItems);

    if (libraryItem && lastRemovedAt !== libraryItem.lastRemovedAt) {
      await ctx.db.patch(libraryItem._id, { lastRemovedAt });
    }

    await pruneDuplicateRows(ctx.db, libraryItems, libraryItem);

    if (
      mergeTargetLibraryItemId === undefined &&
      libraryItem?.mergedIntoLibraryItemId !== undefined
    ) {
      const existingAlias = await resolveLibraryMergeAlias(
        ctx,
        userId,
        generation,
        args.libraryItemId,
      );
      if (!existingAlias.item || existingAlias.item.inLibrary === false) {
        throw new Error("Library merge target is missing or removed.");
      }
      mergeTargetLibraryItemId = existingAlias.libraryItemId;
    }

    let cascadeLock: RemovalCascadeLock | undefined;
    if (libraryItem && shouldApplyLww(libraryItem.updatedAt, updatedAt)) {
      cascadeLock = newRemovalCascadeLock({
        scope: "library-item",
        generation,
        parentId: args.libraryItemId,
        removedAt: updatedAt,
        startedAt: now,
        mergeTargetLibraryItemId,
        previousLock: libraryItem.membershipRemovalCascade,
      });
      await ctx.db.patch(libraryItem._id, {
        inLibrary: false,
        updatedAt,
        ...(mergeTargetLibraryItemId === undefined
          ? {}
          : { mergedIntoLibraryItemId: mergeTargetLibraryItemId }),
        lastRemovedAt:
          lastRemovedAt === undefined
            ? updatedAt
            : Math.max(lastRemovedAt, updatedAt),
        membershipRemovalCascade: cascadeLock,
      });
    } else if (
      libraryItem?.inLibrary === false &&
      libraryItem.updatedAt === updatedAt
    ) {
      const existingLock = libraryItem.membershipRemovalCascade;
      const sameMergeTarget =
        existingLock?.mergeTargetLibraryItemId === mergeTargetLibraryItemId;
      if (
        existingLock?.mergeTargetLibraryItemId !== undefined &&
        !sameMergeTarget
      ) {
        throw new Error(
          "Library removal operation already belongs to another merge target.",
        );
      }
      if (
        existingLock?.removedAt === updatedAt &&
        existingLock.status === "completed" &&
        sameMergeTarget
      ) {
        return;
      }
      cascadeLock =
        existingLock?.removedAt === updatedAt &&
        sameMergeTarget &&
        removalCascadeLeaseIsActive(existingLock, now)
          ? existingLock
          : newRemovalCascadeLock({
              scope: "library-item",
              generation,
              parentId: args.libraryItemId,
              removedAt: updatedAt,
              startedAt: now,
              mergeTargetLibraryItemId,
              previousLock: existingLock,
            });
      if (
        cascadeLock !== existingLock ||
        libraryItem.mergedIntoLibraryItemId !== mergeTargetLibraryItemId
      ) {
        await ctx.db.patch(libraryItem._id, {
          membershipRemovalCascade: cascadeLock,
          ...(mergeTargetLibraryItemId === undefined
            ? {}
            : { mergedIntoLibraryItemId: mergeTargetLibraryItemId }),
        });
      }
    } else if (!libraryItem) {
      cascadeLock = newRemovalCascadeLock({
        scope: "library-item",
        generation,
        parentId: args.libraryItemId,
        removedAt: updatedAt,
        startedAt: now,
        mergeTargetLibraryItemId,
      });
      await ctx.db.insert("library_items", {
        userId,
        syncGeneration: storedSyncGeneration(generation),
        libraryItemId: args.libraryItemId,
        metadata: { title: "" },
        inLibrary: false,
        createdAt: updatedAt,
        updatedAt,
        lastRemovedAt: updatedAt,
        ...(mergeTargetLibraryItemId === undefined
          ? {}
          : { mergedIntoLibraryItemId: mergeTargetLibraryItemId }),
        membershipRemovalCascade: cascadeLock,
      });
    }

    if (!cascadeLock) return;

    const mergeTargetArgs =
      mergeTargetLibraryItemId === undefined
        ? {}
        : { mergeTargetLibraryItemId };

    await ctx.scheduler.runAfter(
      0,
      internal.library.cascadeLibraryItemMemberships,
      {
        userId,
        generation,
        libraryItemId: args.libraryItemId,
        removedAt: updatedAt,
        operationId: cascadeLock.operationId,
        ...mergeTargetArgs,
      },
    );
    await ctx.scheduler.runAfter(
      Math.max(0, cascadeLock.leaseExpiresAt! - now),
      internal.library.recoverLibraryItemMembershipCascade,
      {
        userId,
        generation,
        libraryItemId: args.libraryItemId,
        removedAt: updatedAt,
        operationId: cascadeLock.operationId,
        ...mergeTargetArgs,
      },
    );
  },
});

export const cascadeLibraryItemMemberships = internalMutation({
  args: {
    userId: v.string(),
    generation: v.number(),
    libraryItemId: v.string(),
    mergeTargetLibraryItemId: v.optional(v.string()),
    removedAt: v.number(),
    // Optional while scheduled continuations from the pre-lease deployment
    // drain. Such a worker is adopted into a fresh, fenced operation below.
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
    const libraryItems = currentSyncGenerationRows(
      await ctx.db
        .query("library_items")
        .withIndex("by_user_item", (q) =>
          q.eq("userId", args.userId).eq("libraryItemId", args.libraryItemId),
        )
        .collect(),
      args.generation,
    );
    const libraryItem = newestLibraryMergeAwareItem(libraryItems);
    if (!libraryItem) return null;

    if (args.operationId === undefined) {
      // A continuation created by the pre-watchdog deployment has no durable
      // owner. Adopt only the current removal barrier, restart from page zero,
      // and let a newer/terminal operation fence this stale job.
      if (maximumRemovalBarrier(libraryItems) !== args.removedAt) return null;
      const existingLock = libraryItem.membershipRemovalCascade;
      if (existingLock && existingLock.removedAt >= args.removedAt) {
        return null;
      }
      const now = Date.now();
      const cascadeLock = newRemovalCascadeLock({
        scope: "library-item",
        generation: args.generation,
        parentId: args.libraryItemId,
        removedAt: args.removedAt,
        startedAt: now,
        mergeTargetLibraryItemId: args.mergeTargetLibraryItemId,
        previousLock: existingLock,
      });
      await ctx.db.patch(libraryItem._id, {
        membershipRemovalCascade: cascadeLock,
      });
      const mergeTargetArgs =
        args.mergeTargetLibraryItemId === undefined
          ? {}
          : { mergeTargetLibraryItemId: args.mergeTargetLibraryItemId };
      await ctx.scheduler.runAfter(
        0,
        internal.library.cascadeLibraryItemMemberships,
        {
          userId: args.userId,
          generation: args.generation,
          libraryItemId: args.libraryItemId,
          removedAt: args.removedAt,
          operationId: cascadeLock.operationId,
          ...mergeTargetArgs,
        },
      );
      await ctx.scheduler.runAfter(
        REMOVAL_CASCADE_LEASE_MS,
        internal.library.recoverLibraryItemMembershipCascade,
        {
          userId: args.userId,
          generation: args.generation,
          libraryItemId: args.libraryItemId,
          removedAt: args.removedAt,
          operationId: cascadeLock.operationId,
          ...mergeTargetArgs,
        },
      );
      return null;
    }

    if (
      !isRemovalCascadeOwner(libraryItem.membershipRemovalCascade, {
        removedAt: args.removedAt,
        operationId: args.operationId,
        mergeTargetLibraryItemId: args.mergeTargetLibraryItemId,
      })
    ) {
      return null;
    }

    const now = Date.now();
    let cascadeLock = libraryItem.membershipRemovalCascade;
    if (
      (cascadeLock.leaseExpiresAt ?? 0) <=
      now + REMOVAL_CASCADE_LEASE_MS / 2
    ) {
      cascadeLock = {
        ...cascadeLock,
        leaseExpiresAt: now + REMOVAL_CASCADE_LEASE_MS,
      };
      await ctx.db.patch(libraryItem._id, {
        membershipRemovalCascade: cascadeLock,
      });
    }

    let mergeTarget:
      | { libraryItemId: string; updatedAt: number; lastRemovedAt?: number }
      | undefined;
    if (args.mergeTargetLibraryItemId !== undefined) {
      if (args.mergeTargetLibraryItemId === args.libraryItemId) return null;
      const resolvedTarget = await resolveLibraryMergeAlias(
        ctx,
        args.userId,
        args.generation,
        args.mergeTargetLibraryItemId,
      );
      if (
        resolvedTarget.libraryItemId === args.libraryItemId ||
        !resolvedTarget.item ||
        resolvedTarget.item.inLibrary === false
      ) {
        // Keep the durable lock active. The watchdog can retry if a preceding
        // target-save mutation is merely delayed, but never delete the source
        // memberships when there is no valid survivor to receive them.
        return null;
      }
      mergeTarget = {
        libraryItemId: resolvedTarget.libraryItemId,
        updatedAt: resolvedTarget.item.updatedAt,
        lastRemovedAt: maximumRemovalBarrier(resolvedTarget.rows),
      };
    }

    const page = await ctx.db
      .query("collection_items")
      .withIndex("by_user_generation_item", (q) =>
        q
          .eq("userId", args.userId)
          .eq("syncGeneration", storedSyncGeneration(args.generation))
          .eq("libraryItemId", args.libraryItemId),
      )
      .paginate({
        cursor: args.cursor ?? null,
        numItems: LIBRARY_MEMBERSHIP_CASCADE_PAGE_ITEMS,
      });
    const collectionIds = new Set(page.page.map((item) => item.collectionId));
    for (const collectionId of collectionIds) {
      const matches = currentSyncGenerationRows(
        await ctx.db
          .query("collection_items")
          .withIndex("by_user_collection_item", (q) =>
            q
              .eq("userId", args.userId)
              .eq("collectionId", collectionId)
              .eq("libraryItemId", args.libraryItemId),
          )
          .collect(),
        args.generation,
      );
      const newest = newestLwwRecord(matches, (item) => item.removed === true);
      await pruneDuplicateRows(ctx.db, matches, newest);
      if (!newest) {
        continue;
      }

      if (mergeTarget && newest.removed !== true) {
        const collectionRows = currentSyncGenerationRows(
          await ctx.db
            .query("collections")
            .withIndex("by_user_collection", (q) =>
              q.eq("userId", args.userId).eq("collectionId", collectionId),
            )
            .collect(),
          args.generation,
        );
        const collection = newestLwwRecord(
          collectionRows,
          (item) => item.removed === true,
        );
        if (collection && collection.removed !== true) {
          const transferAt = Math.max(
            args.removedAt,
            newest.updatedAt,
            mergeTarget.updatedAt,
            collection.updatedAt,
          );
          const collectionLastRemovedAt = maximumRemovalBarrier(collectionRows);
          if (
            isAfterRemovalBarrier(mergeTarget.lastRemovedAt, transferAt) &&
            isAfterRemovalBarrier(collectionLastRemovedAt, transferAt)
          ) {
            const targetMatches = currentSyncGenerationRows(
              await ctx.db
                .query("collection_items")
                .withIndex("by_user_collection_item", (q) =>
                  q
                    .eq("userId", args.userId)
                    .eq("collectionId", collectionId)
                    .eq("libraryItemId", mergeTarget!.libraryItemId),
                )
                .collect(),
              args.generation,
            );
            const targetMembership = newestLwwRecord(
              targetMatches,
              (item) => item.removed === true,
            );
            await pruneDuplicateRows(ctx.db, targetMatches, targetMembership);
            if (!targetMembership) {
              await ctx.db.insert("collection_items", {
                userId: args.userId,
                syncGeneration: storedSyncGeneration(args.generation),
                collectionId,
                libraryItemId: mergeTarget.libraryItemId,
                addedAt: newest.addedAt,
                updatedAt: transferAt,
                removed: false,
              });
            } else if (shouldApplyLww(targetMembership.updatedAt, transferAt)) {
              await ctx.db.patch(targetMembership._id, {
                addedAt: Math.min(targetMembership.addedAt, newest.addedAt),
                updatedAt: transferAt,
                removed: false,
              });
            }
          }
        }

        // A merge is structural, so it consumes even a source membership that
        // arrived after the client's merge clock. Transfer at the newest safe
        // server-known clock, then tombstone the old foreign key in the same
        // transaction.
        await ctx.db.patch(newest._id, {
          removed: true,
          updatedAt: Math.max(newest.updatedAt, args.removedAt),
        });
      } else if (shouldApplyLww(newest.updatedAt, args.removedAt)) {
        await ctx.db.patch(newest._id, {
          removed: true,
          updatedAt: args.removedAt,
        });
      }
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.library.cascadeLibraryItemMemberships,
        { ...args, cursor: page.continueCursor },
      );
      return null;
    }
    await ctx.db.patch(libraryItem._id, {
      membershipRemovalCascade: finishRemovalCascade(
        cascadeLock,
        "completed",
        now,
      ),
    });
    return null;
  },
});

/**
 * Restarts a failed page chain only while this exact operation owns the
 * parent. Exhaustion leaves the deletion barrier and a terminal marker intact:
 * the removed parent remains hidden, stale children cannot be resurrected,
 * and an explicit idempotent retry can allocate a fresh operation.
 */
export const recoverLibraryItemMembershipCascade = internalMutation({
  args: {
    userId: v.string(),
    generation: v.number(),
    libraryItemId: v.string(),
    mergeTargetLibraryItemId: v.optional(v.string()),
    removedAt: v.number(),
    operationId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (
      (await getCurrentSyncGeneration(ctx, args.userId)) !== args.generation
    ) {
      return null;
    }
    const libraryItems = currentSyncGenerationRows(
      await ctx.db
        .query("library_items")
        .withIndex("by_user_item", (q) =>
          q.eq("userId", args.userId).eq("libraryItemId", args.libraryItemId),
        )
        .collect(),
      args.generation,
    );
    const libraryItem = newestLibraryMergeAwareItem(libraryItems);
    const cascadeLock = libraryItem?.membershipRemovalCascade;
    if (
      !libraryItem ||
      !isRemovalCascadeOwner(cascadeLock, {
        removedAt: args.removedAt,
        operationId: args.operationId,
        mergeTargetLibraryItemId: args.mergeTargetLibraryItemId,
      })
    ) {
      return null;
    }

    const now = Date.now();
    if ((cascadeLock.leaseExpiresAt ?? 0) > now) {
      await ctx.scheduler.runAfter(
        cascadeLock.leaseExpiresAt! - now,
        internal.library.recoverLibraryItemMembershipCascade,
        args,
      );
      return null;
    }

    const recoveryAttempts = cascadeLock.recoveryAttempts + 1;
    if (recoveryAttempts > REMOVAL_CASCADE_MAX_RECOVERY_ATTEMPTS) {
      await ctx.db.patch(libraryItem._id, {
        membershipRemovalCascade: finishRemovalCascade(
          { ...cascadeLock, recoveryAttempts },
          "exhausted",
          now,
        ),
      });
      console.error(
        "[library-membership-cascade] recovery exhausted",
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
    await ctx.db.patch(libraryItem._id, {
      membershipRemovalCascade: renewedLock,
    });
    await ctx.scheduler.runAfter(
      0,
      internal.library.cascadeLibraryItemMemberships,
      args,
    );
    await ctx.scheduler.runAfter(
      REMOVAL_CASCADE_LEASE_MS,
      internal.library.recoverLibraryItemMembershipCascade,
      args,
    );
    return null;
  },
});

export const removeSourceLink = mutation({
  args: {
    expectedUserId: v.optional(v.string()),
    registryId: v.string(),
    sourceId: v.string(),
    sourceMangaId: v.string(),
    libraryItemId: v.optional(v.string()),
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
    generation: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { userId, generation, resolveClock } =
      await requireSyncMutationContext(ctx, args);
    const legacyNow = Date.now();
    const updatedAt = resolveClock(args.updatedAt, legacyNow);
    const createdAt =
      args.createdAt === undefined
        ? updatedAt
        : resolveClock(args.createdAt, legacyNow);

    const links = currentSyncGenerationRows(
      await ctx.db
        .query("library_source_links")
        .withIndex("by_user_source_manga", (q) =>
          q
            .eq("userId", userId)
            .eq("registryId", args.registryId)
            .eq("sourceId", args.sourceId)
            .eq("sourceMangaId", args.sourceMangaId),
        )
        .collect(),
      generation,
    );
    const link = newestLwwRecord(
      links,
      (candidate) => candidate.removed === true,
    );

    await pruneDuplicateRows(ctx.db, links, link);

    const parentLibraryItemId = args.libraryItemId ?? link?.libraryItemId;
    if (parentLibraryItemId) {
      const parents = currentSyncGenerationRows(
        await ctx.db
          .query("library_items")
          .withIndex("by_user_item", (q) =>
            q.eq("userId", userId).eq("libraryItemId", parentLibraryItemId),
          )
          .collect(),
        generation,
      );
      const parentLastRemovedAt = maximumRemovalBarrier(parents);
      if (!isAfterRemovalBarrier(parentLastRemovedAt, updatedAt)) {
        return;
      }
    }

    if (link && shouldApplyLww(link.updatedAt, updatedAt)) {
      await ctx.db.patch(link._id, {
        ...(args.libraryItemId ? { libraryItemId: args.libraryItemId } : {}),
        removed: true,
        updatedAt,
      });
    } else if (!link) {
      await ctx.db.insert("library_source_links", {
        userId,
        syncGeneration: storedSyncGeneration(generation),
        // A pending deletion created by an older client might not retain the
        // parent id. Keep a key-only tombstone so a delayed save is still
        // rejected; snapshot merge drops it until a newer save supplies one.
        libraryItemId: args.libraryItemId ?? "",
        registryId: args.registryId,
        sourceId: args.sourceId,
        sourceMangaId: args.sourceMangaId,
        createdAt,
        updatedAt,
        removed: true,
      });
    }
  },
});

export const clearAll = mutation({
  args: {
    expectedUserId: v.optional(v.string()),
    generation: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { userId, generation } = await requireSyncMutationContext(ctx, args);
    await beginSyncReset(ctx, userId, generation);
  },
});
