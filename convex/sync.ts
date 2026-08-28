/**
 * Phase 8: Full snapshot queries (subscription-based sync)
 *
 * Generation-fenced, paginated account snapshots. A caller first observes the
 * account generation, then passes it to every page query. If reset races any
 * page, that query rejects and the client restarts the whole seven-resource
 * bundle instead of ever mixing generations.
 */

import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { paginationOptsValidator, type PaginationOptions } from "convex/server";
import { requireAuth, requireAuthForUser } from "./_lib";
import { canonicalizeLwwRecords } from "./lww";
import { newestLibraryMergeAwareItem } from "./libraryMerge";
import {
  CHAPTER_PROGRESS_INTRA_PAGE_SYNC_VERSION,
  makeChapterProgressId,
  makeMangaProgressId,
  makeSourceLinkId,
} from "../packages/core/src/sync";
import {
  currentSyncGenerationRows,
  getCurrentSyncGeneration,
  nextSyncCleanupToken,
  storedSyncGeneration,
  type SyncCleanupTable,
  type SyncCleanupToken,
} from "./syncGeneration";
import { chapterProgressIntraPageState } from "../packages/core/src/sync-lww";
import { beginSyncReset } from "./syncReset";
import {
  legacyVisibleCollectionItemRows,
  legacyVisibleCollectionRows,
  legacyVisibleLibraryRows,
  legacyVisibleSourceLinkRows,
} from "./syncCompatibility";

const syncGenerationObservationValidator = v.object({
  generation: v.number(),
  serverNow: v.number(),
  chapterProgressIntraPageVersion: v.number(),
});

export async function readSyncGenerationObservation(
  ctx: QueryCtx | MutationCtx,
): Promise<{
  generation: number;
  serverNow: number;
  chapterProgressIntraPageVersion: number;
}> {
  const userId = await requireAuth(ctx);
  return {
    generation: await getCurrentSyncGeneration(ctx, userId),
    serverNow: Date.now(),
    chapterProgressIntraPageVersion:
      CHAPTER_PROGRESS_INTRA_PAGE_SYNC_VERSION,
  };
}

/** Reactive generation metadata. Deliberately omit wall time: a dependency-
 * cached query is not a fresh clock source. */
export const generation = query({
  args: {},
  returns: v.object({
    generation: v.number(),
    chapterProgressIntraPageVersion: v.number(),
  }),
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);
    return {
      generation: await getCurrentSyncGeneration(ctx, userId),
      chapterProgressIntraPageVersion:
        CHAPTER_PROGRESS_INTRA_PAGE_SYNC_VERSION,
    };
  },
});

/** Authenticated, uncached clock round trip used before client sync writes. */
export const observeGeneration = mutation({
  args: {},
  returns: syncGenerationObservationValidator,
  handler: readSyncGenerationObservation,
});

const SNAPSHOT_PAGE_MAX_ITEMS = 128;

function boundedSnapshotPagination(
  paginationOpts: PaginationOptions,
): PaginationOptions {
  const requestedItems = Number.isFinite(paginationOpts.numItems)
    ? Math.floor(paginationOpts.numItems)
    : 1;
  return {
    ...paginationOpts,
    numItems: Math.max(1, Math.min(SNAPSHOT_PAGE_MAX_ITEMS, requestedItems)),
  };
}

function mapLibraryItem(item: Doc<"library_items">) {
  return {
    id: item.libraryItemId,
    libraryItemId: item.libraryItemId,
    metadata: item.metadata,
    externalIds: item.externalIds,
    inLibrary: item.inLibrary,
    ...(item.mergedIntoLibraryItemId === undefined
      ? {}
      : { mergedIntoLibraryItemId: item.mergedIntoLibraryItemId }),
    overrides: item.overrides,
    sourceOrder: item.sourceOrder,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

async function libraryItemRows(
  ctx: QueryCtx,
  userId: string,
  generation: number,
) {
  const items = currentSyncGenerationRows(
    await ctx.db
      .query("library_items")
      .withIndex("by_user_item", (q) => q.eq("userId", userId))
      .collect(),
    generation,
  );
  const rowsByItem = new Map<string, Doc<"library_items">[]>();
  for (const item of items) {
    const rows = rowsByItem.get(item.libraryItemId) ?? [];
    rows.push(item);
    rowsByItem.set(item.libraryItemId, rows);
  }
  return [...rowsByItem.values()]
    .map(newestLibraryMergeAwareItem)
    .filter((item): item is Doc<"library_items"> => item !== undefined)
    .map(mapLibraryItem);
}

function mapSourceLink(link: Doc<"library_source_links">) {
  return {
    id: makeSourceLinkId(link.registryId, link.sourceId, link.sourceMangaId),
    libraryItemId: link.libraryItemId,
    registryId: link.registryId,
    sourceId: link.sourceId,
    sourceMangaId: link.sourceMangaId,
    latestChapter: link.latestChapter,
    latestChapterSortKey: link.latestChapterSortKey,
    latestFetchedAt: link.latestFetchedAt,
    updateAckChapter: link.updateAckChapter,
    updateAckChapterSortKey: link.updateAckChapterSortKey,
    updateAckAt: link.updateAckAt,
    createdAt: link.createdAt,
    updatedAt: link.updatedAt,
    removed: link.removed,
  };
}

async function sourceLinkRows(
  ctx: QueryCtx,
  userId: string,
  generation: number,
) {
  const links = currentSyncGenerationRows(
    await ctx.db
      .query("library_source_links")
      .withIndex("by_user_item", (q) => q.eq("userId", userId))
      .collect(),
    generation,
  );
  return canonicalizeLwwRecords(
    links,
    (link) =>
      `${link.registryId}\u0000${link.sourceId}\u0000${link.sourceMangaId}`,
    (link) => link.removed === true,
  ).map(mapSourceLink);
}

function mapCollection(collection: Doc<"collections">) {
  return {
    collectionId: collection.collectionId,
    name: collection.name,
    createdAt: collection.createdAt,
    updatedAt: collection.updatedAt,
    removed: collection.removed,
  };
}

async function collectionRows(
  ctx: QueryCtx,
  userId: string,
  generation: number,
) {
  const collections = currentSyncGenerationRows(
    await ctx.db
      .query("collections")
      .withIndex("by_user_updated", (q) => q.eq("userId", userId))
      .collect(),
    generation,
  );
  return canonicalizeLwwRecords(
    collections,
    (collection) => collection.collectionId,
    (collection) => collection.removed === true,
  ).map(mapCollection);
}

function mapCollectionItem(item: Doc<"collection_items">) {
  return {
    collectionId: item.collectionId,
    libraryItemId: item.libraryItemId,
    addedAt: item.addedAt,
    updatedAt: item.updatedAt,
    removed: item.removed,
  };
}

async function collectionItemRows(
  ctx: QueryCtx,
  userId: string,
  generation: number,
) {
  const items = currentSyncGenerationRows(
    await ctx.db
      .query("collection_items")
      .withIndex("by_user_updated", (q) => q.eq("userId", userId))
      .collect(),
    generation,
  );
  return canonicalizeLwwRecords(
    items,
    (item) => `${item.collectionId}\u0000${item.libraryItemId}`,
    (item) => item.removed === true,
  ).map(mapCollectionItem);
}

function mapChapterProgress(entry: Doc<"chapter_progress">) {
  const intraPageState = chapterProgressIntraPageState(entry);
  return {
    id: makeChapterProgressId(
      entry.registryId,
      entry.sourceId,
      entry.sourceMangaId,
      entry.sourceChapterId,
    ),
    registryId: entry.registryId,
    sourceId: entry.sourceId,
    sourceMangaId: entry.sourceMangaId,
    sourceChapterId: entry.sourceChapterId,
    libraryItemId: entry.libraryItemId,
    progress: entry.progress,
    total: entry.total,
    completed: entry.completed,
    lastReadAt: entry.lastReadAt,
    chapterNumber: entry.chapterNumber,
    volumeNumber: entry.volumeNumber,
    chapterTitle: entry.chapterTitle,
    ...(intraPageState ?? {}),
    updatedAt: entry.updatedAt,
  };
}

async function chapterProgressRows(
  ctx: QueryCtx,
  userId: string,
  generation: number,
) {
  const progress = currentSyncGenerationRows(
    await ctx.db
      .query("chapter_progress")
      .withIndex("by_user_updated", (q) => q.eq("userId", userId))
      .collect(),
    generation,
  );
  return canonicalizeLwwRecords(
    progress,
    (entry) =>
      `${entry.registryId}\u0000${entry.sourceId}\u0000${entry.sourceMangaId}\u0000${entry.sourceChapterId}`,
  ).map(mapChapterProgress);
}

function mapMangaProgress(entry: Doc<"manga_progress">) {
  return {
    id: makeMangaProgressId(
      entry.registryId,
      entry.sourceId,
      entry.sourceMangaId,
    ),
    registryId: entry.registryId,
    sourceId: entry.sourceId,
    sourceMangaId: entry.sourceMangaId,
    libraryItemId: entry.libraryItemId,
    lastReadAt: entry.lastReadAt,
    lastReadSourceChapterId: entry.lastReadSourceChapterId,
    lastReadChapterNumber: entry.lastReadChapterNumber,
    lastReadVolumeNumber: entry.lastReadVolumeNumber,
    lastReadChapterTitle: entry.lastReadChapterTitle,
    updatedAt: entry.updatedAt,
  };
}

async function mangaProgressRows(
  ctx: QueryCtx,
  userId: string,
  generation: number,
) {
  const progress = currentSyncGenerationRows(
    await ctx.db
      .query("manga_progress")
      .withIndex("by_user_updated", (q) => q.eq("userId", userId))
      .collect(),
    generation,
  );
  return canonicalizeLwwRecords(
    progress,
    (entry) =>
      `${entry.registryId}\u0000${entry.sourceId}\u0000${entry.sourceMangaId}`,
  ).map(mapMangaProgress);
}

async function libraryItemPage(
  ctx: QueryCtx,
  userId: string,
  generation: number,
  paginationOpts: PaginationOptions,
) {
  const result = await ctx.db
    .query("library_items")
    .withIndex("by_user_sync_generation", (q) =>
      q
        .eq("userId", userId)
        .eq("syncGeneration", storedSyncGeneration(generation)),
    )
    .paginate(boundedSnapshotPagination(paginationOpts));
  return { ...result, page: result.page.map(mapLibraryItem) };
}

async function sourceLinkPage(
  ctx: QueryCtx,
  userId: string,
  generation: number,
  paginationOpts: PaginationOptions,
) {
  const result = await ctx.db
    .query("library_source_links")
    .withIndex("by_user_sync_generation", (q) =>
      q
        .eq("userId", userId)
        .eq("syncGeneration", storedSyncGeneration(generation)),
    )
    .paginate(boundedSnapshotPagination(paginationOpts));
  return { ...result, page: result.page.map(mapSourceLink) };
}

async function collectionPage(
  ctx: QueryCtx,
  userId: string,
  generation: number,
  paginationOpts: PaginationOptions,
) {
  const result = await ctx.db
    .query("collections")
    .withIndex("by_user_sync_generation", (q) =>
      q
        .eq("userId", userId)
        .eq("syncGeneration", storedSyncGeneration(generation)),
    )
    .paginate(boundedSnapshotPagination(paginationOpts));
  return { ...result, page: result.page.map(mapCollection) };
}

async function collectionItemPage(
  ctx: QueryCtx,
  userId: string,
  generation: number,
  paginationOpts: PaginationOptions,
) {
  const result = await ctx.db
    .query("collection_items")
    .withIndex("by_user_sync_generation", (q) =>
      q
        .eq("userId", userId)
        .eq("syncGeneration", storedSyncGeneration(generation)),
    )
    .paginate(boundedSnapshotPagination(paginationOpts));
  return { ...result, page: result.page.map(mapCollectionItem) };
}

async function chapterProgressPage(
  ctx: QueryCtx,
  userId: string,
  generation: number,
  paginationOpts: PaginationOptions,
) {
  const result = await ctx.db
    .query("chapter_progress")
    .withIndex("by_user_sync_generation", (q) =>
      q
        .eq("userId", userId)
        .eq("syncGeneration", storedSyncGeneration(generation)),
    )
    .paginate(boundedSnapshotPagination(paginationOpts));
  return { ...result, page: result.page.map(mapChapterProgress) };
}

async function mangaProgressPage(
  ctx: QueryCtx,
  userId: string,
  generation: number,
  paginationOpts: PaginationOptions,
) {
  const result = await ctx.db
    .query("manga_progress")
    .withIndex("by_user_sync_generation", (q) =>
      q
        .eq("userId", userId)
        .eq("syncGeneration", storedSyncGeneration(generation)),
    )
    .paginate(boundedSnapshotPagination(paginationOpts));
  return { ...result, page: result.page.map(mapMangaProgress) };
}

function legacySnapshotQuery<T>(
  readRows: (ctx: QueryCtx, userId: string, generation: number) => Promise<T[]>,
) {
  return query({
    args: {},
    handler: async (ctx) => {
      const userId = await requireAuth(ctx);
      const generation = await getCurrentSyncGeneration(ctx, userId);
      return readRows(ctx, userId, generation);
    },
  });
}

async function legacyLibraryItemRows(
  ctx: QueryCtx,
  userId: string,
  generation: number,
) {
  return legacyVisibleLibraryRows(
    await libraryItemRows(ctx, userId, generation),
  );
}

async function legacySourceLinkRows(
  ctx: QueryCtx,
  userId: string,
  generation: number,
) {
  const [links, items] = await Promise.all([
    sourceLinkRows(ctx, userId, generation),
    legacyLibraryItemRows(ctx, userId, generation),
  ]);
  return legacyVisibleSourceLinkRows(
    links,
    new Set(items.map((item) => item.libraryItemId)),
  );
}

async function legacyCollectionRows(
  ctx: QueryCtx,
  userId: string,
  generation: number,
) {
  return legacyVisibleCollectionRows(
    await collectionRows(ctx, userId, generation),
  );
}

async function legacyCollectionItemRows(
  ctx: QueryCtx,
  userId: string,
  generation: number,
) {
  const [items, collections, libraryItems] = await Promise.all([
    collectionItemRows(ctx, userId, generation),
    legacyCollectionRows(ctx, userId, generation),
    legacyLibraryItemRows(ctx, userId, generation),
  ]);
  return legacyVisibleCollectionItemRows(
    items,
    new Set(collections.map((collection) => collection.collectionId)),
    new Set(libraryItems.map((item) => item.libraryItemId)),
  );
}

function versionedSnapshotQuery<T>(
  readPage: (
    ctx: QueryCtx,
    userId: string,
    generation: number,
    paginationOpts: PaginationOptions,
  ) => Promise<{
    page: T[];
    continueCursor: string;
    isDone: boolean;
    splitCursor?: string | null;
    pageStatus?: "SplitRecommended" | "SplitRequired" | null;
  }>,
) {
  return query({
    args: {
      generation: v.number(),
      paginationOpts: paginationOptsValidator,
    },
    handler: async (ctx, args) => {
      const userId = await requireAuth(ctx);
      const currentGeneration = await getCurrentSyncGeneration(ctx, userId);
      if (currentGeneration !== args.generation) {
        return {
          generation: currentGeneration,
          page: [
            { kind: "generation" as const, generation: currentGeneration },
          ],
          continueCursor: "",
          isDone: true,
        };
      }
      const result = await readPage(
        ctx,
        userId,
        currentGeneration,
        args.paginationOpts,
      );
      return {
        generation: currentGeneration,
        ...result,
        page: [
          { kind: "generation" as const, generation: currentGeneration },
          ...result.page.map((row) => ({
            kind: "row" as const,
            generation: currentGeneration,
            row,
          })),
        ],
      };
    },
  });
}

// Legacy array endpoints remain available for already-deployed clients. They
// only collect the current generation, so reset rows stay invisible while the
// bounded cleanup runs. Current clients use the paginated V2 endpoints.
export const libraryItemsAll = legacySnapshotQuery(legacyLibraryItemRows);
export const sourceLinksAll = legacySnapshotQuery(legacySourceLinkRows);
export const collectionsAll = legacySnapshotQuery(legacyCollectionRows);
export const collectionItemsAll = legacySnapshotQuery(legacyCollectionItemRows);
export const chapterProgressAll = legacySnapshotQuery(chapterProgressRows);
export const mangaProgressAll = legacySnapshotQuery(mangaProgressRows);

export const libraryItemsAllV2 = versionedSnapshotQuery(libraryItemPage);
export const sourceLinksAllV2 = versionedSnapshotQuery(sourceLinkPage);
export const collectionsAllV2 = versionedSnapshotQuery(collectionPage);
export const collectionItemsAllV2 = versionedSnapshotQuery(collectionItemPage);
export const chapterProgressAllV2 = versionedSnapshotQuery(chapterProgressPage);
export const mangaProgressAllV2 = versionedSnapshotQuery(mangaProgressPage);

const cleanupTableValidator = v.union(
  v.literal("library_items"),
  v.literal("library_source_links"),
  v.literal("collections"),
  v.literal("collection_items"),
  v.literal("chapter_progress"),
  v.literal("manga_progress"),
  v.literal("settings"),
);

const cleanupTokenValidator = v.object({
  table: cleanupTableValidator,
});

const CLEANUP_PAGE_SIZE = 128;

async function cleanupPage(
  ctx: MutationCtx,
  userId: string,
  table: SyncCleanupTable,
  targetGeneration: number,
): Promise<Array<{ _id: Id<SyncCleanupTable> }>> {
  switch (table) {
    case "library_items": {
      return ctx.db
        .query(table)
        .withIndex("by_user_sync_generation", (q) =>
          q.eq("userId", userId).lt("syncGeneration", targetGeneration),
        )
        .take(CLEANUP_PAGE_SIZE);
    }
    case "library_source_links": {
      return ctx.db
        .query(table)
        .withIndex("by_user_sync_generation", (q) =>
          q.eq("userId", userId).lt("syncGeneration", targetGeneration),
        )
        .take(CLEANUP_PAGE_SIZE);
    }
    case "collections": {
      return ctx.db
        .query(table)
        .withIndex("by_user_sync_generation", (q) =>
          q.eq("userId", userId).lt("syncGeneration", targetGeneration),
        )
        .take(CLEANUP_PAGE_SIZE);
    }
    case "collection_items": {
      return ctx.db
        .query(table)
        .withIndex("by_user_sync_generation", (q) =>
          q.eq("userId", userId).lt("syncGeneration", targetGeneration),
        )
        .take(CLEANUP_PAGE_SIZE);
    }
    case "chapter_progress": {
      return ctx.db
        .query(table)
        .withIndex("by_user_sync_generation", (q) =>
          q.eq("userId", userId).lt("syncGeneration", targetGeneration),
        )
        .take(CLEANUP_PAGE_SIZE);
    }
    case "manga_progress": {
      return ctx.db
        .query(table)
        .withIndex("by_user_sync_generation", (q) =>
          q.eq("userId", userId).lt("syncGeneration", targetGeneration),
        )
        .take(CLEANUP_PAGE_SIZE);
    }
    case "settings": {
      return ctx.db
        .query(table)
        .withIndex("by_user_sync_generation", (q) =>
          q.eq("userId", userId).lt("syncGeneration", targetGeneration),
        )
        .take(CLEANUP_PAGE_SIZE);
    }
  }
}

async function runCleanupStep(
  ctx: MutationCtx,
  userId: string,
  targetGeneration: number,
  cleanupToken: SyncCleanupToken,
): Promise<SyncCleanupToken | null> {
  if (!Number.isSafeInteger(targetGeneration) || targetGeneration < 1) {
    throw new Error("INVALID_SYNC_CLEANUP_GENERATION");
  }
  const rows = await cleanupPage(
    ctx,
    userId,
    cleanupToken.table,
    targetGeneration,
  );
  for (const row of rows) await ctx.db.delete(row._id);
  return nextSyncCleanupToken(cleanupToken, rows.length === CLEANUP_PAGE_SIZE);
}

/** Atomically advances the account generation. Old rows become unreachable
 * immediately; physical deletion continues in bounded follow-up mutations. */
export const clearAll = mutation({
  args: {
    expectedUserId: v.string(),
    expectedGeneration: v.optional(v.number()),
  },
  returns: v.object({
    generation: v.number(),
  }),
  handler: async (ctx, args) => {
    const userId = await requireAuthForUser(ctx, args.expectedUserId);
    const { generation } = await beginSyncReset(
      ctx,
      userId,
      args.expectedGeneration,
    );
    return { generation };
  },
});

/** Durable cleanup chain used when the clearAll response never reaches the
 * client. Each invocation is bounded and schedules exactly one successor. */
export const cleanupOldRows = internalMutation({
  args: {
    userId: v.string(),
    targetGeneration: v.number(),
    cleanupToken: cleanupTokenValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const currentGeneration = await getCurrentSyncGeneration(ctx, args.userId);
    if (currentGeneration < args.targetGeneration) return null;
    const cleanupToken = await runCleanupStep(
      ctx,
      args.userId,
      args.targetGeneration,
      args.cleanupToken,
    );
    if (cleanupToken) {
      await ctx.scheduler.runAfter(0, internal.sync.cleanupOldRows, {
        ...args,
        cleanupToken,
      });
    }
    return null;
  },
});
