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
    history: v.record(
      v.string(),
      v.object({
        progress: v.number(),
        total: v.number(),
        completed: v.boolean(),
        dateRead: v.number(),
      })
    ),
    updatedAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_manga", ["userId", "mangaId"]),

  settings: defineTable({
    userId: v.string(),
    readingMode: v.union(
      v.literal("rtl"),
      v.literal("ltr"),
      v.literal("scrolling")
    ),
    installedSources: v.array(
      v.object({
        id: v.string(),
        registryId: v.string(),
        version: v.number(),
      })
    ),
    updatedAt: v.optional(v.number()),
  }).index("by_user", ["userId"]),
});
