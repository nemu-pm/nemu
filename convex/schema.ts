import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// ============================================================================
// Naming conventions for local/cloud sync identifiers.
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
  lang: v.optional(v.string()),
});

const mangaMetadata = v.object({
  title: v.string(),
  cover: v.optional(v.string()),
  authors: v.optional(v.array(v.string())),
  description: v.optional(v.string()),
  tags: v.optional(v.array(v.string())),
  status: v.optional(v.number()),
  url: v.optional(v.string()),
});

const mangaMetadataPartial = v.object({
  title: v.optional(v.string()),
  cover: v.optional(v.string()),
  authors: v.optional(v.array(v.string())),
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

const historyRetargetLock = v.object({
  sourceLibraryItemId: v.string(),
  targetLibraryItemId: v.string(),
  updatedAt: v.number(),
  // Optional while old locks/scheduled jobs drain across a backend deploy.
  operationId: v.optional(v.string()),
  leaseExpiresAt: v.optional(v.number()),
  recoveryAttempts: v.optional(v.number()),
});

const removalCascadeLock = v.object({
  removedAt: v.number(),
  operationId: v.string(),
  // Present only when library removal is completing a semantic merge.
  mergeTargetLibraryItemId: v.optional(v.string()),
  // Optional while locks written by an earlier rolling deployment drain.
  operationVersion: v.optional(v.number()),
  status: v.union(
    v.literal("active"),
    v.literal("completed"),
    v.literal("exhausted"),
  ),
  leaseExpiresAt: v.optional(v.number()),
  recoveryAttempts: v.number(),
  finishedAt: v.optional(v.number()),
});

// User overrides (no clocks)
const userOverrides = v.object({
  // Metadata overrides (sparse - only user-edited fields)
  // null = explicitly cleared, undefined = never set
  metadata: v.optional(v.union(mangaMetadataPartial, v.null())),

  // Cover override URL (R2 or other storage)
  // null = explicitly cleared (use source cover), undefined = never set
  coverUrl: v.optional(v.union(v.string(), v.null())),
});

export default defineSchema({
  sync_generations: defineTable({
    userId: v.string(),
    generation: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  settings: defineTable({
    userId: v.string(),
    syncGeneration: v.optional(v.number()),
    installedSources: v.array(
      v.object({
        id: v.string(),
        registryId: v.string(),
        sourceKind: v.optional(v.union(v.literal("aidoku"), v.literal("tachiyomi"))),
        sourceId: v.optional(v.string()),
        name: v.optional(v.string()),
        icon: v.optional(v.string()),
        languages: v.optional(v.array(v.string())),
        contentRating: v.optional(v.number()),
        hasAuthentication: v.optional(v.boolean()),
        hasCloudflare: v.optional(v.boolean()),
        downloadUrl: v.optional(v.string()),
        version: v.number(),
        updatedAt: v.optional(v.number()), // For LWW sync conflict resolution
        removed: v.optional(v.boolean()), // Tombstone: true = uninstalled
      })
    ),
    updatedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_sync_generation", ["userId", "syncGeneration"]),

  // ============================================================================
  // NORMALIZED TABLES (Phase 9 - legacy tables removed)
  // ============================================================================

  // library_items: one row per user library entry
  library_items: defineTable({
    userId: v.string(),
    syncGeneration: v.optional(v.number()),
    libraryItemId: v.string(), // UUID

    // Metadata (source-derived, not user-editable)
    metadata: mangaMetadata,
    externalIds: v.optional(externalIds),

    // Library membership state
    // inLibrary=false means "removed from library", inLibrary=true means "in library"
    inLibrary: v.optional(v.boolean()), // Default true, optional for backward compat

    // User overrides
    overrides: v.optional(userOverrides),

    // Source ordering (array of source link IDs in user's preferred order)
    sourceOrder: v.optional(v.array(v.string())),

    // Sync fields
    createdAt: v.number(),
    updatedAt: v.number(),
    lastRemovedAt: v.optional(v.number()),
    // Permanent canonical redirect left by an irreversible library merge.
    // Server mutation paths resolve this bounded chain before accepting
    // relationship writes; clients do not need it in their sync projection.
    mergedIntoLibraryItemId: v.optional(v.string()),
    // Short-lived server-owned lock while a durable history retarget is
    // draining bounded pages. It is not part of the client sync projection.
    historyRetargetLock: v.optional(historyRetargetLock),
    // Server-owned durable state for the paginated collection-membership
    // removal cascade. Terminal records fence delayed workers and let a later
    // retry allocate a distinct operation id.
    membershipRemovalCascade: v.optional(removalCascadeLock),
  })
    .index("by_user", ["userId"])
    .index("by_user_sync_generation", ["userId", "syncGeneration"])
    .index("by_user_item", ["userId", "libraryItemId"])
    .index("by_user_updated", ["userId", "updatedAt"]),

  // library_source_links: normalized bindings + availability per source
  library_source_links: defineTable({
    userId: v.string(),
    syncGeneration: v.optional(v.number()),
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
    removed: v.optional(v.boolean()),
  })
    .index("by_user", ["userId"])
    .index("by_user_sync_generation", ["userId", "syncGeneration"])
    .index("by_user_item", ["userId", "libraryItemId"])
    .index("by_user_generation_item", ["userId", "syncGeneration", "libraryItemId"])
    .index("by_user_source_manga", ["userId", "registryId", "sourceId", "sourceMangaId"])
    .index("by_user_updated", ["userId", "updatedAt"]),

  // collections: user-defined named groups of library items
  collections: defineTable({
    userId: v.string(),
    syncGeneration: v.optional(v.number()),
    collectionId: v.string(),
    name: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    removed: v.optional(v.boolean()),
    lastRemovedAt: v.optional(v.number()),
    // Server-owned durable state for the paginated membership removal.
    membershipRemovalCascade: v.optional(removalCascadeLock),
  })
    .index("by_user", ["userId"])
    .index("by_user_sync_generation", ["userId", "syncGeneration"])
    .index("by_user_collection", ["userId", "collectionId"])
    .index("by_user_updated", ["userId", "updatedAt"]),

  // collection_items: join table from collections -> library_items
  collection_items: defineTable({
    userId: v.string(),
    syncGeneration: v.optional(v.number()),
    collectionId: v.string(),
    libraryItemId: v.string(),
    addedAt: v.number(),
    updatedAt: v.number(),
    removed: v.optional(v.boolean()),
  })
    .index("by_user", ["userId"])
    .index("by_user_sync_generation", ["userId", "syncGeneration"])
    .index("by_user_collection", ["userId", "collectionId"])
    .index("by_user_collection_item", ["userId", "collectionId", "libraryItemId"])
    .index("by_user_item", ["userId", "libraryItemId"])
    .index("by_user_generation_item", ["userId", "syncGeneration", "libraryItemId"])
    .index("by_user_updated", ["userId", "updatedAt"]),

  // chapter_progress: canonical truth per chapter
  chapter_progress: defineTable({
    userId: v.string(),
    syncGeneration: v.optional(v.number()),

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
    lastReadAt: v.number(), // user clock

    // Cached chapter metadata (optional, for display)
    chapterNumber: v.optional(v.number()),
    volumeNumber: v.optional(v.number()),
    chapterTitle: v.optional(v.string()),
    intraPageProgress: v.optional(v.number()),
    intraPageContentIdentity: v.optional(v.string()),

    // Sync fields
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_sync_generation", ["userId", "syncGeneration"])
    .index("by_user_chapter", ["userId", "registryId", "sourceId", "sourceMangaId", "sourceChapterId"])
    .index("by_user_source_manga", ["userId", "registryId", "sourceId", "sourceMangaId"])
    .index("by_user_item", ["userId", "libraryItemId"])
    .index("by_user_generation_item", ["userId", "syncGeneration", "libraryItemId"])
    .index("by_user_updated", ["userId", "updatedAt"]),

  // manga_progress: materialized "last read" summary for fast library UI
  manga_progress: defineTable({
    userId: v.string(),
    syncGeneration: v.optional(v.number()),

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
    .index("by_user_sync_generation", ["userId", "syncGeneration"])
    .index("by_user_source_manga", ["userId", "registryId", "sourceId", "sourceMangaId"])
    .index("by_user_item", ["userId", "libraryItemId"])
    .index("by_user_generation_item", ["userId", "syncGeneration", "libraryItemId"])
    .index("by_user_updated", ["userId", "updatedAt"])
    .index("by_user_recent", ["userId", "lastReadAt"]),
});
