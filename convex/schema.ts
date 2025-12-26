import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// ============================================================================
// NAMING CONVENTIONS (Phase 0 from sync.md)
// ============================================================================
// - `libraryItemId`: UUID identifying the user's library entry
// - `sourceMangaId`: the id inside a specific source (e.g., "123" from MangaDex)
// - `sourceChapterId`: the chapter id inside a specific source
// - `chapterSortKey`: monotonic key for ordering/comparison (not identity)
// ============================================================================

// ============================================================================
// CURSOR ID CONVENTIONS (Phase 6 from sync.md)
// ============================================================================
// Each table has a canonical `cursorId` for deterministic pagination tie-breakers:
// - `library_items.cursorId` = libraryItemId
// - `library_source_links.cursorId` = "${registryId}:${sourceId}:${sourceMangaId}"
// - `chapter_progress.cursorId` = "${registryId}:${sourceId}:${sourceMangaId}:${sourceChapterId}"
// - `manga_progress.cursorId` = "${registryId}:${sourceId}:${sourceMangaId}"
//
// Composite cursor format: { updatedAt: number, cursorId: string }
// Query: (updatedAt > cursor.updatedAt) OR (updatedAt == cursor.updatedAt AND cursorId > cursor.cursorId)
// ============================================================================

// ============================================================================
// PHASE 6.5: INTENTCLOCK (HLC-BASED) CONVENTIONS
// ============================================================================
// IntentClock is a lexicographically comparable string for user-intent ordering.
// Format: "{wallMsPadded}:{counterPadded}:{nodeId}"
// Example: "00001703497912345:000012:device-9f3c"
//
// Used for:
// - Library membership (inLibrary + inLibraryClock) - replaces deletedAt tombstone
// - User overrides (overrides.metadata + overrides.metadataClock)
// - Cover override (overrides.coverUrl + overrides.coverUrlClock)
//
// Merge rule: If incoming.clock > existing.clock, accept incoming value (including null)
// ============================================================================

// ============================================================================
// PHASE 6.5.5: NORMALIZED OVERRIDES SHAPE
// ============================================================================
// User overrides are grouped in a nested structure with independent clocks:
// - overrides.metadata: Partial<MangaMetadata> | null (null = explicitly cleared)
// - overrides.metadataClock: IntentClock
// - overrides.coverUrl: string | null (null = use source cover)
// - overrides.coverUrlClock: IntentClock
//
// This replaces the flat shape: overrides, overridesClock, coverOverrideUrl, coverClock
// ============================================================================

// Reusable validators
const chapterSummary = v.object({
  id: v.string(), // sourceChapterId
  title: v.optional(v.string()),
  chapterNumber: v.optional(v.number()),
  volumeNumber: v.optional(v.number()),
});

// OLD schema: sourceLink embedded in library.sources[]
const sourceLink = v.object({
  registryId: v.string(),
  sourceId: v.string(),
  mangaId: v.string(), // sourceMangaId
  // Chapter availability tracking
  latestChapter: v.optional(chapterSummary),
  updateAcknowledged: v.optional(chapterSummary),
});

const mangaMetadata = v.object({
  title: v.string(),
  cover: v.optional(v.string()),
  authors: v.optional(v.array(v.string())),
  artists: v.optional(v.array(v.string())),
  description: v.optional(v.string()),
  tags: v.optional(v.array(v.string())),
  status: v.optional(v.number()),
  url: v.optional(v.string()),
});

const mangaMetadataPartial = v.object({
  title: v.optional(v.string()),
  cover: v.optional(v.string()),
  authors: v.optional(v.array(v.string())),
  artists: v.optional(v.array(v.string())),
  description: v.optional(v.string()),
  tags: v.optional(v.array(v.string())),
  status: v.optional(v.number()),
  url: v.optional(v.string()),
});

const externalIds = v.object({
  mangaUpdates: v.optional(v.number()),
  aniList: v.optional(v.number()),
  mal: v.optional(v.number()),
});

// Phase 6.5.5: Normalized user overrides with independent clocks
const userOverrides = v.object({
  // Metadata overrides (sparse - only user-edited fields)
  // null = explicitly cleared, undefined = never set
  metadata: v.optional(v.union(mangaMetadataPartial, v.null())),
  metadataClock: v.optional(v.string()), // IntentClock

  // Cover override URL (R2 or other storage)
  // null = explicitly cleared (use source cover), undefined = never set
  coverUrl: v.optional(v.union(v.string(), v.null())),
  coverUrlClock: v.optional(v.string()), // IntentClock
});

export default defineSchema({
  library: defineTable({
    userId: v.string(),
    mangaId: v.string(), // UUID
    addedAt: v.number(),

    // Metadata
    // Legacy note: very old prod rows may have `title`/`cover` at top-level and no `metadata`.
    // Run: `npx convex run migrations:migrateLibraryToMetadata --prod` then we can make this required again,
    // or drop the entire legacy `library` table in Phase 8.
    metadata: v.optional(mangaMetadata),
    // Legacy fields (very old prod docs). These must remain optional until we either:
    // - run the old migrations to remove them, or
    // - drop the legacy `library` table in Phase 8.
    title: v.optional(v.string()),
    cover: v.optional(v.string()),
    activeRegistryId: v.optional(v.string()),
    activeSourceId: v.optional(v.string()),
    // Legacy top-level progress fields (Phase 2-era). Kept only to allow schema validation to pass.
    lastReadAt: v.optional(v.number()),
    lastReadChapter: v.optional(chapterSummary),
    latestChapter: v.optional(chapterSummary),
    seenLatestChapter: v.optional(chapterSummary),
    // Legacy field from very old clients (map-like / untyped)
    // Example seen in prod: `history: {}`
    history: v.optional(v.any()),
    overrides: v.optional(mangaMetadataPartial),
    coverCustom: v.optional(v.string()), // R2 key

    // External IDs for metadata re-fetching
    externalIds: v.optional(externalIds),

    // Source bindings - reading progress derived from history table
    sources: v.array(sourceLink),

    // Sync metadata
    updatedAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_manga", ["userId", "mangaId"]),

  history: defineTable({
    userId: v.string(),
    registryId: v.string(),
    sourceId: v.string(),
    mangaId: v.string(),
    chapterId: v.string(),
    progress: v.number(),
    total: v.number(),
    completed: v.boolean(),
    dateRead: v.number(),
    updatedAt: v.optional(v.number()),
    // Chapter metadata (cached for display)
    chapterNumber: v.optional(v.number()),
    volumeNumber: v.optional(v.number()),
    chapterTitle: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_user_manga", ["userId", "registryId", "sourceId", "mangaId"])
    .index("by_user_chapter", ["userId", "registryId", "sourceId", "mangaId", "chapterId"])
    .index("by_user_recent", ["userId", "dateRead"])
    .index("by_user_updated", ["userId", "updatedAt"]),

  settings: defineTable({
    userId: v.string(),
    installedSources: v.array(
      v.object({
        id: v.string(),
        registryId: v.string(),
        version: v.number(),
      })
    ),
    // Legacy field from older builds (removed in current app schema).
    // Keep optional to allow schema validation to pass, then run:
    //   npx convex run migrations:removeReadingModeFromSettings --prod
    readingMode: v.optional(v.string()),
    updatedAt: v.optional(v.number()),
  }).index("by_user", ["userId"]),

  // ============================================================================
  // NEW TABLES (Phase 1 from sync.md) - Ideal normalized schema
  // ============================================================================

  // library_items: one row per user library entry (replaces library table)
  library_items: defineTable({
    userId: v.string(),
    libraryItemId: v.string(), // UUID (maps to old library.mangaId)

    // Metadata (source-derived, not user-editable)
    metadata: mangaMetadata,
    externalIds: v.optional(externalIds),

    // Library membership state (replaces deletedAt tombstone)
    // inLibrary=false means "removed from library", inLibrary=true means "in library"
    inLibrary: v.optional(v.boolean()), // Default true, optional for backward compat
    inLibraryClock: v.optional(v.string()), // IntentClock

    // User overrides (Phase 6.5.5 normalized shape)
    overrides: v.optional(userOverrides),

    // Sync fields
    createdAt: v.number(),
    updatedAt: v.number(),

    // ========================================================================
    // LEGACY FIELDS (to be removed after migration)
    // Run: npx convex run migrations:migrateLibraryItemsToNormalizedOverrides
    // ========================================================================
    // @deprecated - use inLibrary instead
    deletedAt: v.optional(v.number()),
    // @deprecated - use overrides.coverUrl instead
    coverCustom: v.optional(v.string()),
    coverOverrideUrl: v.optional(v.union(v.string(), v.null())),
    // @deprecated - use overrides.metadataClock/coverUrlClock instead
    overridesClock: v.optional(v.string()),
    coverClock: v.optional(v.string()),
    overridesUpdatedAt: v.optional(v.number()),
    coverCustomUpdatedAt: v.optional(v.number()),
    overridesDeletedAt: v.optional(v.number()),
    coverCustomDeletedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_item", ["userId", "libraryItemId"])
    .index("by_user_updated", ["userId", "updatedAt"])
    // Phase 6: Composite cursor index for deterministic pagination
    .index("by_user_cursor", ["userId", "updatedAt", "libraryItemId"]),

  // library_source_links: normalized bindings + availability per source
  library_source_links: defineTable({
    userId: v.string(),
    libraryItemId: v.string(), // FK to library_items

    // Source reference
    registryId: v.string(),
    sourceId: v.string(),
    sourceMangaId: v.string(), // the id inside the source

    // Phase 6: Canonical cursorId for deterministic pagination
    // Format: "${registryId}:${sourceId}:${sourceMangaId}" (URL-encoded)
    cursorId: v.optional(v.string()),

    // Availability tracking
    latestChapter: v.optional(chapterSummary),
    latestChapterSortKey: v.optional(v.string()), // for ordering/comparison
    latestFetchedAt: v.optional(v.number()),
    updateAckChapter: v.optional(chapterSummary),
    updateAckChapterSortKey: v.optional(v.string()),
    updateAckAt: v.optional(v.number()),

    // Sync fields
    createdAt: v.number(),
    updatedAt: v.number(),
    deletedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_item", ["userId", "libraryItemId"])
    .index("by_user_source_manga", ["userId", "registryId", "sourceId", "sourceMangaId"])
    .index("by_user_updated", ["userId", "updatedAt"])
    // Phase 6: Composite cursor index for deterministic pagination
    .index("by_user_cursor", ["userId", "updatedAt", "cursorId"]),

  // chapter_progress: canonical truth per chapter (replaces history table)
  chapter_progress: defineTable({
    userId: v.string(),

    // Source reference (composite key)
    registryId: v.string(),
    sourceId: v.string(),
    sourceMangaId: v.string(),
    sourceChapterId: v.string(),

    // Phase 6: Canonical cursorId for deterministic pagination
    // Format: "${registryId}:${sourceId}:${sourceMangaId}:${sourceChapterId}" (URL-encoded)
    cursorId: v.optional(v.string()),

    // Optional denormalized link to library item
    libraryItemId: v.optional(v.string()),

    // Progress (mergeable via high-water mark)
    progress: v.number(),
    total: v.number(),
    completed: v.boolean(),
    lastReadAt: v.number(), // user clock (was dateRead)

    // Cached chapter metadata (optional, for display)
    chapterNumber: v.optional(v.number()),
    volumeNumber: v.optional(v.number()),
    chapterTitle: v.optional(v.string()),

    // Sync fields
    updatedAt: v.number(),
    deletedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_chapter", ["userId", "registryId", "sourceId", "sourceMangaId", "sourceChapterId"])
    .index("by_user_source_manga", ["userId", "registryId", "sourceId", "sourceMangaId"])
    .index("by_user_updated", ["userId", "updatedAt"])
    // Phase 6: Composite cursor index for deterministic pagination
    .index("by_user_cursor", ["userId", "updatedAt", "cursorId"]),

  // manga_progress: materialized "last read" summary for fast library UI
  manga_progress: defineTable({
    userId: v.string(),

    // Source reference
    registryId: v.string(),
    sourceId: v.string(),
    sourceMangaId: v.string(),

    // Phase 6: Canonical cursorId for deterministic pagination
    // Format: "${registryId}:${sourceId}:${sourceMangaId}" (URL-encoded)
    cursorId: v.optional(v.string()),

    // Optional link to library item
    libraryItemId: v.optional(v.string()),

    // Summary fields
    lastReadAt: v.number(),
    lastReadSourceChapterId: v.string(),
    lastReadChapterNumber: v.optional(v.number()),
    lastReadVolumeNumber: v.optional(v.number()),
    lastReadChapterTitle: v.optional(v.string()),

    // Sync fields
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_source_manga", ["userId", "registryId", "sourceId", "sourceMangaId"])
    .index("by_user_updated", ["userId", "updatedAt"])
    .index("by_user_recent", ["userId", "lastReadAt"])
    // Phase 6: Composite cursor index for deterministic pagination
    .index("by_user_cursor", ["userId", "updatedAt", "cursorId"]),
});
