import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireAuth, sourceRefValidator, SEVEN_DAYS_MS } from "./_lib";

const metadataValidator = v.object({
  title: v.string(),
  cover: v.optional(v.string()),
  authors: v.optional(v.array(v.string())),
  artists: v.optional(v.array(v.string())),
  description: v.optional(v.string()),
  tags: v.optional(v.array(v.string())),
  status: v.optional(v.number()),
  url: v.optional(v.string()),
});

const metadataPartialValidator = v.object({
  title: v.optional(v.string()),
  cover: v.optional(v.string()),
  authors: v.optional(v.array(v.string())),
  artists: v.optional(v.array(v.string())),
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

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);

    // Return ALL items including soft-deleted ones
    // Client will handle removing locally if deletedAt is set
    const items = await ctx.db
      .query("library")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    return items;
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
    addedAt: v.number(),
    metadata: metadataValidator,
    // Phase 6.5.5: Normalized overrides shape (for new sync path)
    // When present, uses the new shape; otherwise falls back to flat shape for old client compat
    normalizedOverrides: v.optional(v.object({
      metadata: v.optional(v.union(metadataPartialValidator, v.null())),
      metadataClock: v.optional(v.string()),
      coverUrl: v.optional(v.union(v.string(), v.null())),
      coverUrlClock: v.optional(v.string()),
    })),
    // Phase 6.5: Membership clock (for add/re-add operations)
    inLibraryClock: v.optional(v.string()),
    // Legacy flat shape (for old library table and backward compat)
    overrides: v.optional(metadataPartialValidator),
    coverCustom: v.optional(v.string()),
    externalIds: v.optional(externalIdsValidator),
    sources: v.array(sourceRefValidator), // Chapter availability only, progress in history
    /**
     * How to apply incoming sources to an existing library entry.
     * - "merge" (default): union existing + incoming (prevents accidental drops)
     * - "replace": treat incoming list as authoritative (supports intentional removals)
     */
    sourcesMode: v.optional(v.union(v.literal("merge"), v.literal("replace"))),
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
      const mode = args.sourcesMode ?? "merge";
      const existingSources = (existing.sources || []) as typeof args.sources;

      const sameKey = (a: (typeof args.sources)[number], b: (typeof args.sources)[number]) =>
        a.registryId === b.registryId && a.sourceId === b.sourceId && a.mangaId === b.mangaId;

      // If the caller uses "replace", we treat the incoming list as authoritative and must
      // tombstone removed links in the normalized table too (otherwise they "resurrect" via sync).
      const removedSources =
        mode === "replace"
          ? existingSources.filter(
              (prev) => !args.sources.some((incoming) => sameKey(prev, incoming))
            )
          : [];

      const mergeOne = (
        incoming: (typeof args.sources)[number],
        prev?: (typeof args.sources)[number]
      ): (typeof args.sources)[number] => {
        if (!prev) return incoming;
        return {
          ...incoming,
          latestChapter: incoming.latestChapter ?? prev.latestChapter,
          updateAcknowledged: incoming.updateAcknowledged ?? prev.updateAcknowledged,
        };
      };

      // "replace" supports intentional removals; "merge" prevents accidental drops
      const mergedSources: (typeof args.sources) =
        mode === "replace"
          ? args.sources.map((incoming) => mergeOne(incoming, existingSources.find((s) => sameKey(s, incoming))))
          : (() => {
              const out: typeof args.sources = [...existingSources];
              for (const incoming of args.sources) {
                const idx = out.findIndex((s) => sameKey(s, incoming));
                if (idx === -1) out.push(incoming);
                else out[idx] = mergeOne(incoming, out[idx]);
              }
              return out;
            })();

      await ctx.db.patch(existing._id, {
        metadata: args.metadata,
        overrides: args.overrides,
        coverCustom: args.coverCustom,
        externalIds: args.externalIds,
        addedAt: Math.min(existing.addedAt, args.addedAt),
        sources: mergedSources,
        updatedAt: now,
        deletedAt: undefined,
      });

      // Phase 2: Dual-write to new tables
      // Phase 6.5.5: Use normalized overrides shape if provided, otherwise build from flat shape
      const normalizedOverrides = args.normalizedOverrides ?? (args.overrides || args.coverCustom ? {
        metadata: args.overrides,
        coverUrl: args.coverCustom,
      } : undefined);
      await dualWriteLibraryItem(ctx, userId, args.mangaId, {
        metadata: args.metadata,
        overrides: normalizedOverrides,
        externalIds: args.externalIds,
        // Saving implies in-library (re-add if was deleted)
        inLibrary: true,
        inLibraryClock: args.inLibraryClock,
        createdAt: Math.min(existing.addedAt, args.addedAt),
        updatedAt: now,
      });

      // Phase 2: Tombstone removed source links when using "replace".
      for (const removed of removedSources) {
        const link = await ctx.db
          .query("library_source_links")
          .withIndex("by_user_source_manga", (q) =>
            q
              .eq("userId", userId)
              .eq("registryId", removed.registryId)
              .eq("sourceId", removed.sourceId)
              .eq("sourceMangaId", removed.mangaId)
          )
          .first();
        if (!link) continue;
        await ctx.db.patch(link._id, { deletedAt: now, updatedAt: now });
      }

      await dualWriteSourceLinks(ctx, userId, args.mangaId, mergedSources, now);
    } else {
      await ctx.db.insert("library", {
        userId,
        mangaId: args.mangaId,
        addedAt: args.addedAt,
        metadata: args.metadata,
        overrides: args.overrides,
        coverCustom: args.coverCustom,
        externalIds: args.externalIds,
        sources: args.sources,
        updatedAt: now,
      });

      // Phase 2: Dual-write to new tables
      // Phase 6.5.5: Use normalized overrides shape if provided
      const normalizedOverridesNew = args.normalizedOverrides ?? (args.overrides || args.coverCustom ? {
        metadata: args.overrides,
        coverUrl: args.coverCustom,
      } : undefined);
      await dualWriteLibraryItem(ctx, userId, args.mangaId, {
        metadata: args.metadata,
        overrides: normalizedOverridesNew,
        externalIds: args.externalIds,
        // New item is always in-library
        inLibrary: true,
        inLibraryClock: args.inLibraryClock,
        createdAt: args.addedAt,
        updatedAt: now,
      });
      await dualWriteSourceLinks(ctx, userId, args.mangaId, args.sources, now);
    }
  },
});

// ============================================================================
// Phase 2: Dual-write helpers (sync.md)
// ============================================================================

import type { MutationCtx } from "./_generated/server";

type SourceLinkInput = {
  registryId: string;
  sourceId: string;
  mangaId: string; // sourceMangaId
  latestChapter?: { id: string; title?: string; chapterNumber?: number; volumeNumber?: number };
  updateAcknowledged?: { id: string; title?: string; chapterNumber?: number; volumeNumber?: number };
};

/**
 * Compare two IntentClocks. Returns true if `a` is newer than `b`.
 * IntentClock format: "{wallMsPadded}:{counterPadded}:{nodeId}"
 * Lexicographic comparison works because wallMs and counter are zero-padded.
 */
function isClockNewer(a: string | undefined, b: string | undefined): boolean {
  if (!a) return false;
  if (!b) return true;
  return a > b;
}

/**
 * Dual-write to library_items table with clock-based merge.
 * Phase 6.5.5: Uses normalized overrides shape with HLC-based clocks.
 *
 * Merge rules (per field-group):
 * - If incoming.clock > existing.clock: accept incoming value (including null)
 * - Else: keep existing value
 *
 * Field groups:
 * - Membership: inLibrary + inLibraryClock
 * - Metadata overrides: overrides.metadata + overrides.metadataClock
 * - Cover override: overrides.coverUrl + overrides.coverUrlClock
 * - Source metadata (metadata, externalIds): always accept (not user-controlled)
 */
async function dualWriteLibraryItem(
  ctx: MutationCtx,
  userId: string,
  libraryItemId: string,
  data: {
    metadata: { title: string; cover?: string; authors?: string[]; artists?: string[]; description?: string; tags?: string[]; status?: number; url?: string };
    // Phase 6.5.5: Normalized overrides shape
    overrides?: {
      metadata?: { title?: string; cover?: string; authors?: string[]; artists?: string[]; description?: string; tags?: string[]; status?: number; url?: string } | null;
      metadataClock?: string;
      coverUrl?: string | null;
      coverUrlClock?: string;
    };
    externalIds?: { mangaUpdates?: number; aniList?: number; mal?: number };
    inLibrary?: boolean;
    inLibraryClock?: string;
    createdAt: number;
    updatedAt: number;
  }
) {
  const existing = await ctx.db
    .query("library_items")
    .withIndex("by_user_item", (q) => q.eq("userId", userId).eq("libraryItemId", libraryItemId))
    .first();

  if (existing) {
    // Clock-based merge for each field group
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existingOverrides = existing.overrides as any;

    // Membership: accept if incoming clock is newer
    const acceptMembership = isClockNewer(data.inLibraryClock, existing.inLibraryClock);
    const finalInLibrary = acceptMembership ? data.inLibrary : existing.inLibrary;
    const finalInLibraryClock = acceptMembership ? data.inLibraryClock : existing.inLibraryClock;

    // Metadata overrides: accept if incoming clock is newer
    // IMPORTANT: undefined means "not provided", not an explicit user action.
    // Explicit clears are represented as null.
    const incomingHasMetadata =
      !!data.overrides &&
      Object.prototype.hasOwnProperty.call(data.overrides, "metadata");
    const acceptMetadataOverrides =
      incomingHasMetadata &&
      isClockNewer(data.overrides?.metadataClock, existingOverrides?.metadataClock);
    const finalMetadata = acceptMetadataOverrides
      ? data.overrides?.metadata
      : existingOverrides?.metadata;
    const finalMetadataClock = acceptMetadataOverrides
      ? data.overrides?.metadataClock
      : existingOverrides?.metadataClock;

    // Cover override: accept if incoming clock is newer
    const incomingHasCoverUrl =
      !!data.overrides &&
      Object.prototype.hasOwnProperty.call(data.overrides, "coverUrl");
    const acceptCoverOverride =
      incomingHasCoverUrl &&
      isClockNewer(data.overrides?.coverUrlClock, existingOverrides?.coverUrlClock);
    const finalCoverUrl = acceptCoverOverride
      ? data.overrides?.coverUrl
      : existingOverrides?.coverUrl;
    const finalCoverUrlClock = acceptCoverOverride
      ? data.overrides?.coverUrlClock
      : existingOverrides?.coverUrlClock;

    // Build merged overrides
    const mergedOverrides = (finalMetadata !== undefined || finalCoverUrl !== undefined)
      ? {
          metadata: finalMetadata,
          metadataClock: finalMetadataClock,
          coverUrl: finalCoverUrl,
          coverUrlClock: finalCoverUrlClock,
        }
      : undefined;

    await ctx.db.patch(existing._id, {
      // Source metadata: always accept (not user-controlled)
      metadata: data.metadata,
      externalIds: data.externalIds ?? existing.externalIds,
      // Clock-merged fields
      inLibrary: finalInLibrary,
      inLibraryClock: finalInLibraryClock,
      overrides: mergedOverrides,
      updatedAt: data.updatedAt,
    });
  } else {
    await ctx.db.insert("library_items", {
      userId,
      libraryItemId,
      metadata: data.metadata,
      externalIds: data.externalIds,
      inLibrary: data.inLibrary ?? true,
      inLibraryClock: data.inLibraryClock,
      overrides: data.overrides,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    });
  }
}

/** Phase 6: Build cursorId for source links */
function makeSourceLinkCursorId(registryId: string, sourceId: string, sourceMangaId: string): string {
  return `${encodeURIComponent(registryId)}:${encodeURIComponent(sourceId)}:${encodeURIComponent(sourceMangaId)}`;
}

/**
 * Dual-write to library_source_links table
 * Phase 6: Populates cursorId for deterministic pagination
 */
async function dualWriteSourceLinks(
  ctx: MutationCtx,
  userId: string,
  libraryItemId: string,
  sources: SourceLinkInput[],
  now: number
) {
  for (const source of sources) {
    const existing = await ctx.db
      .query("library_source_links")
      .withIndex("by_user_source_manga", (q) =>
        q
          .eq("userId", userId)
          .eq("registryId", source.registryId)
          .eq("sourceId", source.sourceId)
          .eq("sourceMangaId", source.mangaId)
      )
      .first();

    // Build chapterSortKey from chapter metadata (best effort)
    const buildSortKey = (ch?: { chapterNumber?: number; volumeNumber?: number; id: string }) => {
      if (!ch) return undefined;
      // Format: "V{vol}C{ch}:{id}" for sorting
      const vol = ch.volumeNumber?.toString().padStart(5, "0") ?? "99999";
      const chNum = ch.chapterNumber?.toString().padStart(8, "0") ?? "99999999";
      return `V${vol}C${chNum}:${ch.id}`;
    };

    // Phase 6: Canonical cursorId
    const cursorId = makeSourceLinkCursorId(source.registryId, source.sourceId, source.mangaId);

    if (existing) {
      await ctx.db.patch(existing._id, {
        libraryItemId,
        cursorId, // Phase 6
        latestChapter: source.latestChapter,
        latestChapterSortKey: buildSortKey(source.latestChapter),
        updateAckChapter: source.updateAcknowledged,
        updateAckChapterSortKey: buildSortKey(source.updateAcknowledged),
        updatedAt: now,
        deletedAt: undefined,
      });
    } else {
      await ctx.db.insert("library_source_links", {
        userId,
        libraryItemId,
        registryId: source.registryId,
        sourceId: source.sourceId,
        sourceMangaId: source.mangaId,
        cursorId, // Phase 6
        latestChapter: source.latestChapter,
        latestChapterSortKey: buildSortKey(source.latestChapter),
        updateAckChapter: source.updateAcknowledged,
        updateAckChapterSortKey: buildSortKey(source.updateAcknowledged),
        createdAt: now,
        updatedAt: now,
      });
    }
  }
}

export const remove = mutation({
  args: {
    mangaId: v.string(),
    // Phase 6.5: Client-generated clock for membership change
    inLibraryClock: v.optional(v.string()),
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
      await ctx.db.patch(existing._id, {
        deletedAt: now,
        updatedAt: now,
      });
    }

    // Phase 2: Dual-write soft delete to new tables with clock-based merge
    const libraryItem = await ctx.db
      .query("library_items")
      .withIndex("by_user_item", (q) => q.eq("userId", userId).eq("libraryItemId", args.mangaId))
      .first();

    if (libraryItem) {
      // Only update if incoming clock is newer (or no existing clock)
      const acceptRemove = isClockNewer(args.inLibraryClock, libraryItem.inLibraryClock);
      if (acceptRemove || !libraryItem.inLibraryClock) {
        await ctx.db.patch(libraryItem._id, {
          inLibrary: false,
          inLibraryClock: args.inLibraryClock,
          updatedAt: now,
        });
      }
    }

    // Soft-delete source links
    const sourceLinks = await ctx.db
      .query("library_source_links")
      .withIndex("by_user_item", (q) => q.eq("userId", userId).eq("libraryItemId", args.mangaId))
      .collect();

    for (const link of sourceLinks) {
      await ctx.db.patch(link._id, {
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

    // Phase 2+: keep new normalized tables consistent
    const newItems = await ctx.db
      .query("library_items")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const item of newItems) {
      await ctx.db.delete(item._id);
    }

    const newLinks = await ctx.db
      .query("library_source_links")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const link of newLinks) {
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
