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

// Phase 8: Simplified user overrides (no clocks)
const userOverrides = v.object({
  // Metadata overrides (sparse - only user-edited fields)
  // null = explicitly cleared, undefined = never set
  metadata: v.optional(v.union(mangaMetadataPartial, v.null())),

  // Cover override URL (R2 or other storage)
  // null = explicitly cleared (use source cover), undefined = never set
  coverUrl: v.optional(v.union(v.string(), v.null())),
});

export default defineSchema({
  library: defineTable({
    userId: v.string(),
    mangaId: v.string(), // UUID
    addedAt: v.number(),

    // Metadata
    metadata: mangaMetadata,
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

    // Library membership state
    // inLibrary=false means "removed from library", inLibrary=true means "in library"
    inLibrary: v.optional(v.boolean()), // Default true, optional for backward compat

    // User overrides (Phase 8 simplified - no clocks)
    overrides: v.optional(userOverrides),

    // Sync fields
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_item", ["userId", "libraryItemId"])
    .index("by_user_updated", ["userId", "updatedAt"]),

  // library_source_links: normalized bindings + availability per source
  library_source_links: defineTable({
    userId: v.string(),
    libraryItemId: v.string(), // FK to library_items

    // Source reference
    registryId: v.string(),
    sourceId: v.string(),
    sourceMangaId: v.string(), // the id inside the source

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
  })
    .index("by_user", ["userId"])
    .index("by_user_item", ["userId", "libraryItemId"])
    .index("by_user_source_manga", ["userId", "registryId", "sourceId", "sourceMangaId"])
    .index("by_user_updated", ["userId", "updatedAt"]),

  // chapter_progress: canonical truth per chapter (replaces history table)
  chapter_progress: defineTable({
    userId: v.string(),

    // Source reference (composite key)
    registryId: v.string(),
    sourceId: v.string(),
    sourceMangaId: v.string(),
    sourceChapterId: v.string(),

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
  })
    .index("by_user", ["userId"])
    .index("by_user_chapter", ["userId", "registryId", "sourceId", "sourceMangaId", "sourceChapterId"])
    .index("by_user_source_manga", ["userId", "registryId", "sourceId", "sourceMangaId"])
    .index("by_user_updated", ["userId", "updatedAt"]),

  // manga_progress: materialized "last read" summary for fast library UI
  manga_progress: defineTable({
    userId: v.string(),

    // Source reference
    registryId: v.string(),
    sourceId: v.string(),
    sourceMangaId: v.string(),

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
    .index("by_user_recent", ["userId", "lastReadAt"]),
});
