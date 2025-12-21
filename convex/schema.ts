import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  library: defineTable({
    userId: v.string(),
    mangaId: v.string(),
    title: v.string(),
    cover: v.optional(v.string()),
    addedAt: v.number(),
    sources: v.array(
      v.object({
        registryId: v.string(),
        sourceId: v.string(),
        mangaId: v.string(),
      })
    ),
    activeRegistryId: v.string(),
    activeSourceId: v.string(),
    // Reading progress
    lastReadChapter: v.optional(
      v.object({
        id: v.string(),
        title: v.optional(v.string()),
        chapterNumber: v.optional(v.number()),
        volumeNumber: v.optional(v.number()),
      })
    ),
    lastReadAt: v.optional(v.number()),
    // Chapter availability tracking
    latestChapter: v.optional(
      v.object({
        id: v.string(),
        title: v.optional(v.string()),
        chapterNumber: v.optional(v.number()),
        volumeNumber: v.optional(v.number()),
      })
    ),
    seenLatestChapter: v.optional(
      v.object({
        id: v.string(),
        title: v.optional(v.string()),
        chapterNumber: v.optional(v.number()),
        volumeNumber: v.optional(v.number()),
      })
    ),
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
  })
    .index("by_user", ["userId"])
    .index("by_user_manga", ["userId", "registryId", "sourceId", "mangaId"])
    .index("by_user_chapter", ["userId", "registryId", "sourceId", "mangaId", "chapterId"])
    .index("by_user_recent", ["userId", "dateRead"]),

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
}, {
  schemaValidation: false,
});
