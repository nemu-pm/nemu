import { mutation } from "./_generated/server";

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
            metadata: doc.metadata,
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
          metadata: doc.metadata,
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
              deletedAt: doc.deletedAt,
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
            deletedAt: doc.deletedAt,
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

