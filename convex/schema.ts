import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  library: defineTable({
    userId: v.string(), // Better Auth user ID (not Convex ID)
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
  })
    .index("by_user", ["userId"])
    .index("by_user_manga", ["userId", "mangaId"]),

  settings: defineTable({
    userId: v.string(), // Better Auth user ID
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
  }).index("by_user", ["userId"]),
});

