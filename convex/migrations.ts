import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const removeReadingModeFromSettings = mutation({
  handler: async (ctx) => {
    const settings = await ctx.db.query("settings").collect();
    let count = 0;
    for (const doc of settings) {
      if ("readingMode" in doc) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
        const { readingMode, ...rest } = doc as any;
        await ctx.db.replace(doc._id, rest);
        count++;
      }
    }
    return { migrated: count };
  },
});

/**
 * Migrate library entries from old schema (title, cover at top level)
 * to new schema (metadata.title, metadata.cover).
 * 
 * Run via: npx convex run migrations:migrateLibraryToMetadata
 */
export const migrateLibraryToMetadata = mutation({
  handler: async (ctx) => {
    const library = await ctx.db.query("library").collect();
    let migrated = 0;
    let skipped = 0;

    for (const doc of library) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const legacy = doc as any;
      
      // Skip if already migrated (has metadata field)
      if (legacy.metadata) {
        skipped++;
        continue;
      }

      // Skip if no title (invalid data)
      if (!legacy.title) {
        skipped++;
        continue;
      }

      // Build new metadata object from old fields
      const metadata = {
        title: legacy.title as string,
        cover: legacy.cover as string | undefined,
      };

      // Remove old fields and add new structure
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { title, cover, ...rest } = legacy;
      
      await ctx.db.replace(doc._id, {
        ...rest,
        metadata,
      });
      
      migrated++;
    }

    return { migrated, skipped, total: library.length };
  },
});

/**
 * Migrate reading progress from top-level to per-source.
 * Old: LibraryManga.lastReadChapter, lastReadAt, latestChapter, seenLatestChapter
 * New: SourceLink.lastReadChapter, lastReadAt, latestChapter, seenLatestChapter
 * 
 * Run via: npx convex run migrations:migrateProgressToPerSource
 */
export const migrateProgressToPerSource = mutation({
  handler: async (ctx) => {
    const library = await ctx.db.query("library").collect();
    let migrated = 0;
    let skipped = 0;

    for (const doc of library) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = doc as any;
      
      // Skip if no top-level progress to migrate
      const hasTopLevelProgress = 
        data.lastReadChapter || 
        data.lastReadAt || 
        data.latestChapter || 
        data.seenLatestChapter;
      
      if (!hasTopLevelProgress) {
        skipped++;
        continue;
      }

      // Skip if no sources (shouldn't happen but safety check)
      if (!data.sources || data.sources.length === 0) {
        skipped++;
        continue;
      }

      // Find the active source to migrate progress to
      const activeSourceIdx = data.sources.findIndex(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (s: any) => 
          s.registryId === data.activeRegistryId && 
          s.sourceId === data.activeSourceId
      );

      // If no active source found, migrate to first source
      const targetIdx = activeSourceIdx >= 0 ? activeSourceIdx : 0;

      // Update sources with migrated progress
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updatedSources = data.sources.map((source: any, idx: number) => {
        if (idx === targetIdx) {
          return {
            ...source,
            lastReadChapter: source.lastReadChapter ?? data.lastReadChapter,
            lastReadAt: source.lastReadAt ?? data.lastReadAt,
            latestChapter: source.latestChapter ?? data.latestChapter,
            seenLatestChapter: source.seenLatestChapter ?? data.seenLatestChapter,
          };
        }
        return source;
      });

      // Remove top-level progress fields
      /* eslint-disable @typescript-eslint/no-unused-vars */
      const { lastReadChapter, lastReadAt, latestChapter, seenLatestChapter, ...rest } = data;
      /* eslint-enable @typescript-eslint/no-unused-vars */

      await ctx.db.replace(doc._id, {
        ...rest,
        sources: updatedSources,
      });

      migrated++;
    }

    return { migrated, skipped, total: library.length };
  },
});

/**
 * Phase 2 Migration Step 1: Copy chapter metadata from library to history
 * 
 * Before removing lastReadChapter from SourceLink, copy the metadata to history.
 * 
 * Run via: npx convex run migrations:migrateChapterMetadataToHistory
 */
export const migrateChapterMetadataToHistory = mutation({
  handler: async (ctx) => {
    const library = await ctx.db.query("library").collect();
    let updated = 0;
    let skipped = 0;

    for (const doc of library) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = doc as any;
      
      for (const source of data.sources || []) {
        // Check if source has lastReadChapter with metadata
        const lastRead = source.lastReadChapter;
        if (!lastRead?.id) continue;

        // Find corresponding history entry
        const historyEntry = await ctx.db
          .query("history")
          .withIndex("by_user_chapter", (q) =>
            q
              .eq("userId", data.userId)
              .eq("registryId", source.registryId)
              .eq("sourceId", source.sourceId)
              .eq("mangaId", source.mangaId)
              .eq("chapterId", lastRead.id)
          )
          .first();

        if (!historyEntry) {
          skipped++;
          continue;
        }

        // Skip if history already has metadata
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const existing = historyEntry as any;
        if (existing.chapterNumber !== undefined) {
          skipped++;
          continue;
        }

        // Update history with chapter metadata
        await ctx.db.patch(historyEntry._id, {
          chapterNumber: lastRead.chapterNumber,
          volumeNumber: lastRead.volumeNumber,
          chapterTitle: lastRead.title,
        });

        updated++;
      }
    }

    return { updated, skipped };
  },
});

/**
 * Phase 2 Migration Step 2: Remove active source concept and rename seenLatestChapter
 * 
 * Changes:
 * - Remove activeRegistryId, activeSourceId from LibraryManga
 * - Remove lastReadChapter, lastReadAt from SourceLink (derived from history now)
 * - Rename seenLatestChapter to updateAcknowledged
 * 
 * Run via: npx convex run migrations:migrateToPhase2
 */
export const migrateToPhase2 = mutation({
  handler: async (ctx) => {
    const library = await ctx.db.query("library").collect();
    let migrated = 0;
    let skipped = 0;

    for (const doc of library) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = doc as any;

      // Check if already migrated (no activeRegistryId field)
      if (!data.activeRegistryId && !data.activeSourceId) {
        // But still check if sources need seenLatestChapter rename
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const needsRename = data.sources?.some((s: any) => s.seenLatestChapter !== undefined);
        if (!needsRename) {
          skipped++;
          continue;
        }
      }

      // Update sources: rename seenLatestChapter, remove progress fields
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updatedSources = (data.sources || []).map((source: any) => {
        const { seenLatestChapter: seen, latestChapter: latest, registryId, sourceId, mangaId } = source;
        return {
          registryId,
          sourceId,
          mangaId,
          latestChapter: latest,
          updateAcknowledged: seen, // Rename seenLatestChapter
        };
      });

      await ctx.db.replace(doc._id, {
        userId: data.userId,
        mangaId: data.mangaId,
        addedAt: data.addedAt,
        metadata: data.metadata,
        overrides: data.overrides,
        coverCustom: data.coverCustom,
        externalIds: data.externalIds,
        sources: updatedSources,
        updatedAt: data.updatedAt,
        deletedAt: data.deletedAt,
      });

      migrated++;
    }

    return { migrated, skipped, total: library.length };
  },
});

/**
 * Migrate old composite key IDs to UUIDs for consistency.
 * Old format: "registryId:sourceId:mangaId"
 * New format: UUID (e.g., "550e8400-e29b-41d4-a716-446655440000")
 * 
 * Run via: npx convex run migrations:migrateToUUID
 */
export const migrateToUUID = mutation({
  handler: async (ctx) => {
    const library = await ctx.db.query("library").collect();
    let migrated = 0;
    let skipped = 0;

    for (const doc of library) {
      // Check if mangaId looks like composite key (contains ":")
      if (!doc.mangaId.includes(":")) {
        skipped++;
        continue;
      }

      // Generate new UUID
      const newId = crypto.randomUUID();
      await ctx.db.patch(doc._id, { mangaId: newId });
      migrated++;
    }

    return { migrated, skipped, total: library.length };
  },
});

// ============================================================================
// Phase 3: Backfill migrations (sync.md)
// ============================================================================

/**
 * Backfill library_items from old library table.
 * Safe to run multiple times (upserts based on libraryItemId).
 *
 * Run via: npx convex run migrations:backfillLibraryItems
 */
export const backfillLibraryItems = mutation({
  handler: async (ctx) => {
    const library = await ctx.db.query("library").collect();
    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const doc of library) {
      const libraryItemId = doc.mangaId; // old schema uses mangaId as the UUID

      // Check if already exists in new table
      const existing = await ctx.db
        .query("library_items")
        .withIndex("by_user_item", (q) =>
          q.eq("userId", doc.userId).eq("libraryItemId", libraryItemId)
        )
        .first();

      // Legacy `library` rows may not have `metadata` yet (old shape had `title`/`cover` at top-level).
      // Prefer structured metadata, otherwise derive from legacy fields.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const legacy = doc as any;
      const metadata =
        doc.metadata ??
        (legacy.title
          ? {
              title: legacy.title as string,
              cover: legacy.cover as string | undefined,
            }
          : null);

      if (!metadata) {
        skipped++;
        continue;
      }

      // If entry is deleted and we already have it, just update
      // If not deleted, merge/create

      // Transform flat overrides to normalized shape
      const normalizedOverrides = doc.overrides || doc.coverCustom
        ? {
            metadata: doc.overrides,
            coverUrl: doc.coverCustom,
          }
        : undefined;

      if (existing) {
        // Update if old table has newer data
        const oldUpdatedAt = doc.updatedAt ?? doc.addedAt;
        if (oldUpdatedAt > existing.updatedAt) {
          await ctx.db.patch(existing._id, {
            metadata,
            overrides: normalizedOverrides,
            externalIds: doc.externalIds,
            inLibrary: !doc.deletedAt,
            updatedAt: oldUpdatedAt,
          });
          updated++;
        } else {
          skipped++;
        }
      } else {
        await ctx.db.insert("library_items", {
          userId: doc.userId,
          libraryItemId,
          metadata,
          overrides: normalizedOverrides,
          externalIds: doc.externalIds,
          inLibrary: !doc.deletedAt,
          createdAt: doc.addedAt,
          updatedAt: doc.updatedAt ?? doc.addedAt,
        });
        inserted++;
      }
    }

    return { inserted, updated, skipped, total: library.length };
  },
});

/**
 * Backfill library_source_links from old library.sources[].
 * Safe to run multiple times (upserts based on composite key).
 *
 * Run via: npx convex run migrations:backfillLibrarySourceLinks
 */
export const backfillLibrarySourceLinks = mutation({
  handler: async (ctx) => {
    const library = await ctx.db.query("library").collect();
    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    // Build chapterSortKey from chapter metadata
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

    for (const doc of library) {
      const libraryItemId = doc.mangaId;
      const now = doc.updatedAt ?? doc.addedAt;

      for (const source of doc.sources || []) {
        // Check if already exists
        const existing = await ctx.db
          .query("library_source_links")
          .withIndex("by_user_source_manga", (q) =>
            q
              .eq("userId", doc.userId)
              .eq("registryId", source.registryId)
              .eq("sourceId", source.sourceId)
              .eq("sourceMangaId", source.mangaId)
          )
          .first();

        const latestChapter = source.latestChapter;
        const updateAckChapter = source.updateAcknowledged;

        // Skip deleted entries (Phase 8: no soft-delete on new tables)
        if (doc.deletedAt) {
          skipped++;
          continue;
        }

        if (existing) {
          // Update if this is newer
          if (now > existing.updatedAt) {
            await ctx.db.patch(existing._id, {
              libraryItemId,
              latestChapter,
              latestChapterSortKey: buildSortKey(latestChapter),
              updateAckChapter,
              updateAckChapterSortKey: buildSortKey(updateAckChapter),
              updatedAt: now,
            });
            updated++;
          } else {
            skipped++;
          }
        } else {
          await ctx.db.insert("library_source_links", {
            userId: doc.userId,
            libraryItemId,
            registryId: source.registryId,
            sourceId: source.sourceId,
            sourceMangaId: source.mangaId,
            latestChapter,
            latestChapterSortKey: buildSortKey(latestChapter),
            updateAckChapter,
            updateAckChapterSortKey: buildSortKey(updateAckChapter),
            createdAt: now,
            updatedAt: now,
          });
          inserted++;
        }
      }
    }

    return { inserted, updated, skipped };
  },
});

/**
 * Backfill chapter_progress from old history table.
 * Safe to run multiple times (upserts based on composite key).
 *
 * Run via: npx convex run migrations:backfillChapterProgress
 */
export const backfillChapterProgress = mutation({
  handler: async (ctx) => {
    const history = await ctx.db.query("history").collect();
    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const entry of history) {
      // Check if already exists
      const existing = await ctx.db
        .query("chapter_progress")
        .withIndex("by_user_chapter", (q) =>
          q
            .eq("userId", entry.userId)
            .eq("registryId", entry.registryId)
            .eq("sourceId", entry.sourceId)
            .eq("sourceMangaId", entry.mangaId)
            .eq("sourceChapterId", entry.chapterId)
        )
        .first();

      // Try to find libraryItemId from library_source_links
      const sourceLink = await ctx.db
        .query("library_source_links")
        .withIndex("by_user_source_manga", (q) =>
          q
            .eq("userId", entry.userId)
            .eq("registryId", entry.registryId)
            .eq("sourceId", entry.sourceId)
            .eq("sourceMangaId", entry.mangaId)
        )
        .first();
      const libraryItemId = sourceLink?.libraryItemId;

      const oldUpdatedAt = entry.updatedAt ?? entry.dateRead;

      if (existing) {
        // Update if old table has newer data (or merge high-water mark)
        if (oldUpdatedAt > existing.updatedAt) {
          await ctx.db.patch(existing._id, {
            progress: Math.max(existing.progress, entry.progress),
            total: Math.max(existing.total, entry.total),
            completed: existing.completed || entry.completed,
            lastReadAt: Math.max(existing.lastReadAt, entry.dateRead),
            chapterNumber: entry.chapterNumber ?? existing.chapterNumber,
            volumeNumber: entry.volumeNumber ?? existing.volumeNumber,
            chapterTitle: entry.chapterTitle ?? existing.chapterTitle,
            libraryItemId: libraryItemId ?? existing.libraryItemId,
            updatedAt: oldUpdatedAt,
          });
          updated++;
        } else {
          skipped++;
        }
      } else {
        await ctx.db.insert("chapter_progress", {
          userId: entry.userId,
          registryId: entry.registryId,
          sourceId: entry.sourceId,
          sourceMangaId: entry.mangaId,
          sourceChapterId: entry.chapterId,
          libraryItemId,
          progress: entry.progress,
          total: entry.total,
          completed: entry.completed,
          lastReadAt: entry.dateRead,
          chapterNumber: entry.chapterNumber,
          volumeNumber: entry.volumeNumber,
          chapterTitle: entry.chapterTitle,
          updatedAt: oldUpdatedAt,
        });
        inserted++;
      }
    }

    return { inserted, updated, skipped, total: history.length };
  },
});

/**
 * Backfill manga_progress by aggregating from chapter_progress.
 * Creates/updates summary "last read" per manga.
 * Safe to run multiple times.
 *
 * Run via: npx convex run migrations:backfillMangaProgress
 */
export const backfillMangaProgress = mutation({
  handler: async (ctx) => {
    // Group chapter_progress by (userId, registryId, sourceId, sourceMangaId)
    const chapters = await ctx.db.query("chapter_progress").collect();

    // Build aggregated map
    const aggregated = new Map<
      string,
      {
        userId: string;
        registryId: string;
        sourceId: string;
        sourceMangaId: string;
        libraryItemId?: string;
        lastReadAt: number;
        lastReadSourceChapterId: string;
        lastReadChapterNumber?: number;
        lastReadVolumeNumber?: number;
        lastReadChapterTitle?: string;
        updatedAt: number;
      }
    >();

    for (const ch of chapters) {
      const key = `${ch.userId}:${ch.registryId}:${ch.sourceId}:${ch.sourceMangaId}`;
      const existing = aggregated.get(key);

      if (!existing || ch.lastReadAt > existing.lastReadAt) {
        aggregated.set(key, {
          userId: ch.userId,
          registryId: ch.registryId,
          sourceId: ch.sourceId,
          sourceMangaId: ch.sourceMangaId,
          libraryItemId: ch.libraryItemId,
          lastReadAt: ch.lastReadAt,
          lastReadSourceChapterId: ch.sourceChapterId,
          lastReadChapterNumber: ch.chapterNumber,
          lastReadVolumeNumber: ch.volumeNumber,
          lastReadChapterTitle: ch.chapterTitle,
          updatedAt: Math.max(existing?.updatedAt ?? 0, ch.updatedAt),
        });
      } else if (existing) {
        // Keep the later updatedAt
        existing.updatedAt = Math.max(existing.updatedAt, ch.updatedAt);
      }
    }

    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const data of aggregated.values()) {
      const existing = await ctx.db
        .query("manga_progress")
        .withIndex("by_user_source_manga", (q) =>
          q
            .eq("userId", data.userId)
            .eq("registryId", data.registryId)
            .eq("sourceId", data.sourceId)
            .eq("sourceMangaId", data.sourceMangaId)
        )
        .first();

      if (existing) {
        // Update if aggregated has newer or different data
        if (
          data.lastReadAt > existing.lastReadAt ||
          data.updatedAt > existing.updatedAt
        ) {
          await ctx.db.patch(existing._id, {
            lastReadAt: Math.max(data.lastReadAt, existing.lastReadAt),
            lastReadSourceChapterId:
              data.lastReadAt > existing.lastReadAt
                ? data.lastReadSourceChapterId
                : existing.lastReadSourceChapterId,
            lastReadChapterNumber:
              data.lastReadAt > existing.lastReadAt
                ? data.lastReadChapterNumber
                : existing.lastReadChapterNumber,
            lastReadVolumeNumber:
              data.lastReadAt > existing.lastReadAt
                ? data.lastReadVolumeNumber
                : existing.lastReadVolumeNumber,
            lastReadChapterTitle:
              data.lastReadAt > existing.lastReadAt
                ? data.lastReadChapterTitle
                : existing.lastReadChapterTitle,
            libraryItemId: data.libraryItemId ?? existing.libraryItemId,
            updatedAt: Math.max(data.updatedAt, existing.updatedAt),
          });
          updated++;
        } else {
          skipped++;
        }
      } else {
        await ctx.db.insert("manga_progress", {
          userId: data.userId,
          registryId: data.registryId,
          sourceId: data.sourceId,
          sourceMangaId: data.sourceMangaId,
          libraryItemId: data.libraryItemId,
          lastReadAt: data.lastReadAt,
          lastReadSourceChapterId: data.lastReadSourceChapterId,
          lastReadChapterNumber: data.lastReadChapterNumber,
          lastReadVolumeNumber: data.lastReadVolumeNumber,
          lastReadChapterTitle: data.lastReadChapterTitle,
          updatedAt: data.updatedAt,
        });
        inserted++;
      }
    }

    return { inserted, updated, skipped, total: aggregated.size };
  },
});

/**
 * Phase 6.5.5: Migrate library_items to remove legacy fields.
 * - Converts `deletedAt` → `inLibrary: false`
 * - Converts flat `overrides`/`coverCustom` → normalized `overrides` shape
 * - Removes legacy fields: deletedAt, coverCustom, overridesUpdatedAt, etc.
 *
 * Run via: npx convex run migrations:migrateLibraryItemsToNormalizedOverrides
 */
export const migrateLibraryItemsToNormalizedOverrides = mutation({
  handler: async (ctx) => {
    const items = await ctx.db.query("library_items").collect();
    let migrated = 0;
    let skipped = 0;

    for (const doc of items) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const item = doc as any;

      // Check if migration is needed
      const hasLegacyFields =
        "deletedAt" in item ||
        "coverCustom" in item ||
        "overridesUpdatedAt" in item ||
        "coverCustomUpdatedAt" in item ||
        "overridesDeletedAt" in item ||
        "coverCustomDeletedAt" in item ||
        "overridesClock" in item ||
        "coverClock" in item ||
        "coverOverrideUrl" in item ||
        // Check if overrides is flat (has title/cover directly instead of metadata/coverUrl)
        (item.overrides && "title" in item.overrides && !("metadata" in item.overrides));

      if (!hasLegacyFields) {
        skipped++;
        continue;
      }

      // Build normalized overrides from legacy fields
      let normalizedOverrides = item.overrides;
      
      // Check if overrides is in flat shape (Phase 6 style)
      if (item.overrides && !("metadata" in item.overrides) && !("coverUrl" in item.overrides)) {
        // Flat shape: overrides is Partial<MangaMetadata>
        normalizedOverrides = {
          metadata: item.overrides,
          metadataClock: item.overridesClock,
          coverUrl: item.coverOverrideUrl ?? item.coverCustom,
          coverUrlClock: item.coverClock,
        };
      } else if (!item.overrides && (item.coverCustom || item.coverOverrideUrl)) {
        // No overrides but has cover
        normalizedOverrides = {
          coverUrl: item.coverOverrideUrl ?? item.coverCustom,
          coverUrlClock: item.coverClock,
        };
      }

      // Convert deletedAt to inLibrary
      const inLibrary = item.deletedAt ? false : (item.inLibrary ?? true);

      // Build clean document without legacy fields
      const clean = {
        userId: item.userId,
        libraryItemId: item.libraryItemId,
        metadata: item.metadata,
        externalIds: item.externalIds,
        inLibrary,
        inLibraryClock: item.inLibraryClock,
        overrides: normalizedOverrides,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      };

      // Replace the document entirely to remove legacy fields
      await ctx.db.replace(doc._id, clean);
      migrated++;
    }

    return { migrated, skipped, total: items.length };
  },
});

// ============================================================================
// Phase 8: Remove cursor-based sync fields
// ============================================================================

/**
 * Phase 8.M2: Remove Phase 7 clock/cursor fields from all documents.
 *
 * This migration:
 * - library_items: removes inLibraryClock, overrides.metadataClock, overrides.coverUrlClock
 * - library_source_links: hard deletes soft-deleted rows, removes deletedAt and cursorId
 * - chapter_progress: hard deletes soft-deleted rows, removes deletedAt and cursorId
 * - manga_progress: hard deletes soft-deleted rows, removes deletedAt and cursorId
 *
 * Run via: npx convex run migrations:removePhase7Fields
 */
export const removePhase7Fields = mutation({
  handler: async (ctx) => {
    const results = {
      libraryItems: { migrated: 0, skipped: 0 },
      sourceLinks: { migrated: 0, deleted: 0, skipped: 0 },
      chapterProgress: { migrated: 0, deleted: 0, skipped: 0 },
      mangaProgress: { migrated: 0, deleted: 0, skipped: 0 },
    };

    // 1. Clean library_items - remove clock fields
    const items = await ctx.db.query("library_items").collect();
    for (const doc of items) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const item = doc as any;

      const hasClockFields =
        "inLibraryClock" in item ||
        (item.overrides && ("metadataClock" in item.overrides || "coverUrlClock" in item.overrides));

      if (!hasClockFields) {
        results.libraryItems.skipped++;
        continue;
      }

      // Build clean overrides without clock fields
      let cleanOverrides = item.overrides;
      if (item.overrides) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { metadataClock, coverUrlClock, ...rest } = item.overrides;
        cleanOverrides = Object.keys(rest).length > 0 ? rest : undefined;
      }

      // Build clean document
      const clean = {
        userId: item.userId,
        libraryItemId: item.libraryItemId,
        metadata: item.metadata,
        externalIds: item.externalIds,
        inLibrary: item.inLibrary,
        overrides: cleanOverrides,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      };

      await ctx.db.replace(doc._id, clean);
      results.libraryItems.migrated++;
    }

    // 2. Clean library_source_links - hard delete tombstones, remove deletedAt/cursorId
    const links = await ctx.db.query("library_source_links").collect();
    for (const doc of links) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const link = doc as any;

      // Hard delete tombstones
      if (link.deletedAt) {
        await ctx.db.delete(doc._id);
        results.sourceLinks.deleted++;
        continue;
      }

      const hasLegacyFields = "deletedAt" in link || "cursorId" in link;
      if (!hasLegacyFields) {
        results.sourceLinks.skipped++;
        continue;
      }

      // Build clean document
      const clean = {
        userId: link.userId,
        libraryItemId: link.libraryItemId,
        registryId: link.registryId,
        sourceId: link.sourceId,
        sourceMangaId: link.sourceMangaId,
        latestChapter: link.latestChapter,
        latestChapterSortKey: link.latestChapterSortKey,
        updateAckChapter: link.updateAckChapter,
        updateAckChapterSortKey: link.updateAckChapterSortKey,
        createdAt: link.createdAt,
        updatedAt: link.updatedAt,
      };

      await ctx.db.replace(doc._id, clean);
      results.sourceLinks.migrated++;
    }

    // 3. Clean chapter_progress - hard delete tombstones, remove deletedAt/cursorId
    const chapters = await ctx.db.query("chapter_progress").collect();
    for (const doc of chapters) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cp = doc as any;

      // Hard delete tombstones
      if (cp.deletedAt) {
        await ctx.db.delete(doc._id);
        results.chapterProgress.deleted++;
        continue;
      }

      const hasLegacyFields = "deletedAt" in cp || "cursorId" in cp;
      if (!hasLegacyFields) {
        results.chapterProgress.skipped++;
        continue;
      }

      // Build clean document
      const clean = {
        userId: cp.userId,
        registryId: cp.registryId,
        sourceId: cp.sourceId,
        sourceMangaId: cp.sourceMangaId,
        sourceChapterId: cp.sourceChapterId,
        libraryItemId: cp.libraryItemId,
        progress: cp.progress,
        total: cp.total,
        completed: cp.completed,
        lastReadAt: cp.lastReadAt,
        chapterNumber: cp.chapterNumber,
        volumeNumber: cp.volumeNumber,
        chapterTitle: cp.chapterTitle,
        updatedAt: cp.updatedAt,
      };

      await ctx.db.replace(doc._id, clean);
      results.chapterProgress.migrated++;
    }

    // 4. Clean manga_progress - hard delete tombstones, remove deletedAt/cursorId
    const mangaProgress = await ctx.db.query("manga_progress").collect();
    for (const doc of mangaProgress) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mp = doc as any;

      // Hard delete tombstones
      if (mp.deletedAt) {
        await ctx.db.delete(doc._id);
        results.mangaProgress.deleted++;
        continue;
      }

      const hasLegacyFields = "deletedAt" in mp || "cursorId" in mp;
      if (!hasLegacyFields) {
        results.mangaProgress.skipped++;
        continue;
      }

      // Build clean document
      const clean = {
        userId: mp.userId,
        registryId: mp.registryId,
        sourceId: mp.sourceId,
        sourceMangaId: mp.sourceMangaId,
        libraryItemId: mp.libraryItemId,
        lastReadAt: mp.lastReadAt,
        lastReadSourceChapterId: mp.lastReadSourceChapterId,
        lastReadChapterNumber: mp.lastReadChapterNumber,
        lastReadVolumeNumber: mp.lastReadVolumeNumber,
        lastReadChapterTitle: mp.lastReadChapterTitle,
        updatedAt: mp.updatedAt,
      };

      await ctx.db.replace(doc._id, clean);
      results.mangaProgress.migrated++;
    }

    return results;
  },
});

/**
 * Remove duplicate source links from library_source_links table.
 * Keeps the most recently updated entry for each (userId, registryId, sourceId, sourceMangaId).
 *
 * Run via: npx convex run migrations:removeDuplicateSourceLinks
 */
export const removeDuplicateSourceLinks = mutation({
  handler: async (ctx) => {
    const allLinks = await ctx.db.query("library_source_links").collect();

    // Group by composite key
    const groups = new Map<string, typeof allLinks>();
    for (const link of allLinks) {
      const key = `${link.userId}:${link.registryId}:${link.sourceId}:${link.sourceMangaId}`;
      const existing = groups.get(key) ?? [];
      existing.push(link);
      groups.set(key, existing);
    }

    let deleted = 0;
    for (const [, links] of groups) {
      if (links.length <= 1) continue;

      // Sort by updatedAt desc, keep the first (newest)
      links.sort((a, b) => b.updatedAt - a.updatedAt);
      const [, ...duplicates] = links;

      for (const dup of duplicates) {
        await ctx.db.delete(dup._id);
        deleted++;
      }
    }

    return { total: allLinks.length, deleted, remaining: allLinks.length - deleted };
  },
});

/**
 * Debug query to find source links matching a search term.
 *
 * Run via: npx convex run migrations:debugSourceLinks --args '{"search": "rawkuma"}'
 */
export const debugSourceLinks = query({
  args: { search: v.string() },
  handler: async (ctx, { search }) => {
    const allLinks = await ctx.db.query("library_source_links").collect();
    const searchLower = search.toLowerCase();

    const matches = allLinks.filter(
      (link) =>
        link.sourceId.toLowerCase().includes(searchLower) ||
        link.registryId.toLowerCase().includes(searchLower) ||
        link.sourceMangaId.toLowerCase().includes(searchLower)
    );

    // Group by composite key to find duplicates
    const groups = new Map<string, typeof matches>();
    for (const link of matches) {
      const key = `${link.userId}:${link.registryId}:${link.sourceId}:${link.sourceMangaId}`;
      const existing = groups.get(key) ?? [];
      existing.push(link);
      groups.set(key, existing);
    }

    const duplicates = [...groups.entries()]
      .filter(([, links]) => links.length > 1)
      .map(([key, links]) => ({ key, count: links.length, links }));

    return {
      total: matches.length,
      duplicateGroups: duplicates.length,
      matches: matches.map((l) => ({
        _id: l._id,
        userId: l.userId,
        libraryItemId: l.libraryItemId,
        registryId: l.registryId,
        sourceId: l.sourceId,
        sourceMangaId: l.sourceMangaId,
        updatedAt: l.updatedAt,
      })),
      duplicates,
    };
  },
});

/**
 * Debug query to find sources in old library table.
 *
 * Run via: npx convex run migrations:debugLibrarySources '{"search": "rawkuma"}'
 */
export const debugLibrarySources = query({
  args: { search: v.string() },
  handler: async (ctx, { search }) => {
    const library = await ctx.db.query("library").collect();
    const searchLower = search.toLowerCase();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type SourceLink = { registryId: string; sourceId: string; mangaId: string };
    const results: {
      mangaId: string;
      title: string;
      userId: string;
      sources: SourceLink[];
      duplicates: { key: string; count: number }[];
    }[] = [];

    for (const doc of library) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = doc as any;
      const sources: SourceLink[] = data.sources ?? [];

      const matchingSources = sources.filter(
        (s) =>
          s.sourceId.toLowerCase().includes(searchLower) ||
          s.registryId.toLowerCase().includes(searchLower) ||
          s.mangaId.toLowerCase().includes(searchLower)
      );

      if (matchingSources.length === 0) continue;

      // Find duplicates within this manga's sources
      const groups = new Map<string, number>();
      for (const s of sources) {
        const key = `${s.registryId}:${s.sourceId}:${s.mangaId}`;
        groups.set(key, (groups.get(key) ?? 0) + 1);
      }

      const duplicates = [...groups.entries()]
        .filter(([, count]) => count > 1)
        .map(([key, count]) => ({ key, count }));

      results.push({
        mangaId: doc.mangaId,
        title: data.metadata?.title ?? "unknown",
        userId: doc.userId,
        sources: matchingSources,
        duplicates,
      });
    }

    return results;
  },
});

/**
 * Debug query to find library items by title/search.
 *
 * Run via: npx convex run migrations:debugLibraryItems '{"search": "exorcist"}'
 */
export const debugLibraryItems = query({
  args: { search: v.string() },
  handler: async (ctx, { search }) => {
    const items = await ctx.db.query("library_items").collect();
    const links = await ctx.db.query("library_source_links").collect();
    const searchLower = search.toLowerCase();

    const matches = items.filter(
      (item) =>
        item.libraryItemId.toLowerCase().includes(searchLower) ||
        item.metadata.title.toLowerCase().includes(searchLower)
    );

    return matches.map((item) => ({
      _id: item._id,
      libraryItemId: item.libraryItemId,
      title: item.metadata.title,
      userId: item.userId,
      inLibrary: item.inLibrary,
      sourceLinks: links
        .filter((l) => l.libraryItemId === item.libraryItemId)
        .map((l) => ({
          _id: l._id,
          sourceId: l.sourceId,
          sourceMangaId: l.sourceMangaId,
        })),
    }));
  },
});
