import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireAuth } from "./_lib";

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
});

const sourceLinkValidator = v.object({
  registryId: v.string(),
  sourceId: v.string(),
  sourceMangaId: v.string(),
  latestChapter: v.optional(chapterSummaryValidator),
  updateAckChapter: v.optional(chapterSummaryValidator),
});

export const save = mutation({
  args: {
    libraryItemId: v.string(),
    createdAt: v.number(),
    metadata: metadataValidator,
    overrides: v.optional(v.object({
      metadata: v.optional(v.union(metadataPartialValidator, v.null())),
      coverUrl: v.optional(v.union(v.string(), v.null())),
    })),
    externalIds: v.optional(externalIdsValidator),
    sourceOrder: v.optional(v.array(v.string())),
    sources: v.array(sourceLinkValidator),
    sourcesMode: v.optional(v.union(v.literal("merge"), v.literal("replace"))),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const now = Date.now();

    const existing = await ctx.db
      .query("library_items")
      .withIndex("by_user_item", (q) =>
        q.eq("userId", userId).eq("libraryItemId", args.libraryItemId)
      )
      .first();

    if (existing) {
      // Get existing source links
      const existingLinks = await ctx.db
        .query("library_source_links")
        .withIndex("by_user_item", (q) =>
          q.eq("userId", userId).eq("libraryItemId", args.libraryItemId)
        )
        .collect();

      const mode = args.sourcesMode ?? "merge";

      // Hard-delete removed source links when using "replace"
      if (mode === "replace") {
        for (const link of existingLinks) {
          const stillExists = args.sources.some((s) =>
            s.registryId === link.registryId &&
            s.sourceId === link.sourceId &&
            s.sourceMangaId === link.sourceMangaId
          );
          if (!stillExists) {
            await ctx.db.delete(link._id);
          }
        }
      }

      await ctx.db.patch(existing._id, {
        metadata: args.metadata,
        // Preserve existing overrides unless explicitly provided (including null clears).
        // This mutation is also used to upsert source links, and those calls do not always include overrides.
        overrides: args.overrides ?? existing.overrides,
        externalIds: args.externalIds ?? existing.externalIds,
        sourceOrder: args.sourceOrder ?? existing.sourceOrder,
        updatedAt: now,
      });

      await writeSourceLinks(ctx, userId, args.libraryItemId, args.sources, existingLinks, now);
    } else {
      await ctx.db.insert("library_items", {
        userId,
        libraryItemId: args.libraryItemId,
        metadata: args.metadata,
        externalIds: args.externalIds,
        overrides: args.overrides,
        sourceOrder: args.sourceOrder,
        createdAt: args.createdAt,
        updatedAt: now,
      });

      await writeSourceLinks(ctx, userId, args.libraryItemId, args.sources, [], now);
    }
  },
});

// ============================================================================
// Helper functions
// ============================================================================

import type { MutationCtx } from "./_generated/server";

type SourceLinkInput = {
  registryId: string;
  sourceId: string;
  sourceMangaId: string;
  latestChapter?: { id: string; title?: string; chapterNumber?: number; volumeNumber?: number };
  updateAckChapter?: { id: string; title?: string; chapterNumber?: number; volumeNumber?: number };
};

type ExistingLink = {
  _id: string;
  registryId: string;
  sourceId: string;
  sourceMangaId: string;
  latestChapter?: { id: string; title?: string; chapterNumber?: number; volumeNumber?: number };
  updateAckChapter?: { id: string; title?: string; chapterNumber?: number; volumeNumber?: number };
};

async function writeSourceLinks(
  ctx: MutationCtx,
  userId: string,
  libraryItemId: string,
  sources: SourceLinkInput[],
  existingLinks: ExistingLink[],
  now: number
) {
  const buildSortKey = (ch?: { chapterNumber?: number; volumeNumber?: number; id: string }) => {
    if (!ch) return undefined;
    const vol = ch.volumeNumber?.toString().padStart(5, "0") ?? "99999";
    const chNum = ch.chapterNumber?.toString().padStart(8, "0") ?? "99999999";
    return `V${vol}C${chNum}:${ch.id}`;
  };

  for (const source of sources) {
    const existing = existingLinks.find(
      (l) => l.registryId === source.registryId &&
             l.sourceId === source.sourceId &&
             l.sourceMangaId === source.sourceMangaId
    );

    if (existing) {
      // Merge chapter info
      const mergedLatest = source.latestChapter ?? existing.latestChapter;
      const mergedAck = source.updateAckChapter ?? existing.updateAckChapter;

      await ctx.db.patch(existing._id as any, {
        libraryItemId,
        latestChapter: mergedLatest,
        latestChapterSortKey: buildSortKey(mergedLatest),
        updateAckChapter: mergedAck,
        updateAckChapterSortKey: buildSortKey(mergedAck),
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("library_source_links", {
        userId,
        libraryItemId,
        registryId: source.registryId,
        sourceId: source.sourceId,
        sourceMangaId: source.sourceMangaId,
        latestChapter: source.latestChapter,
        latestChapterSortKey: buildSortKey(source.latestChapter),
        updateAckChapter: source.updateAckChapter,
        updateAckChapterSortKey: buildSortKey(source.updateAckChapter),
        createdAt: now,
        updatedAt: now,
      });
    }
  }
}

export const remove = mutation({
  args: {
    libraryItemId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    const libraryItem = await ctx.db
      .query("library_items")
      .withIndex("by_user_item", (q) => q.eq("userId", userId).eq("libraryItemId", args.libraryItemId))
      .first();

    if (libraryItem) {
      await ctx.db.delete(libraryItem._id);
    }

    // Hard-delete source links
    const sourceLinks = await ctx.db
      .query("library_source_links")
      .withIndex("by_user_item", (q) => q.eq("userId", userId).eq("libraryItemId", args.libraryItemId))
      .collect();

    for (const link of sourceLinks) {
      await ctx.db.delete(link._id);
    }
  },
});

export const removeSourceLink = mutation({
  args: {
    registryId: v.string(),
    sourceId: v.string(),
    sourceMangaId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    const link = await ctx.db
      .query("library_source_links")
      .withIndex("by_user_source_manga", (q) =>
        q
          .eq("userId", userId)
          .eq("registryId", args.registryId)
          .eq("sourceId", args.sourceId)
          .eq("sourceMangaId", args.sourceMangaId)
      )
      .first();

    if (link) {
      await ctx.db.delete(link._id);
    }
  },
});

export const clearAll = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);

    // Delete all library items
    const items = await ctx.db
      .query("library_items")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const item of items) {
      await ctx.db.delete(item._id);
    }

    // Delete all source links
    const links = await ctx.db
      .query("library_source_links")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const link of links) {
      await ctx.db.delete(link._id);
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
