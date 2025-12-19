import { z } from "zod/v4";

// ============ USER DATA SCHEMAS ============

/**
 * Link between a library manga and a source
 */
export const SourceLinkSchema = z.object({
  registryId: z.string(),
  sourceId: z.string(),
  mangaId: z.string(),
});

/**
 * A manga saved in the user's library
 */
export const LibraryMangaSchema = z.object({
  id: z.string(),
  title: z.string(),
  cover: z.string().optional(),
  addedAt: z.number(),
  sources: z.array(SourceLinkSchema).min(1),
  // Active source reference
  activeRegistryId: z.string(),
  activeSourceId: z.string(),
});

/**
 * Reading progress for a chapter
 */
export const ReadingHistorySchema = z.object({
  registryId: z.string(),
  sourceId: z.string(),
  mangaId: z.string(),
  chapterId: z.string(),
  progress: z.number().int(),
  total: z.number().int(),
  completed: z.boolean(),
  dateRead: z.number(),
});

/**
 * An installed source
 */
export const InstalledSourceSchema = z.object({
  id: z.string(),
  registryId: z.string(),
  version: z.number(),
});

/**
 * Source registry configuration
 */
export const SourceRegistrySchema = z.discriminatedUnion("type", [
  z.object({
    id: z.string(),
    name: z.string(),
    type: z.literal("builtin"),
  }),
  z.object({
    id: z.string(),
    name: z.string(),
    type: z.literal("url"),
    url: z.string(),
  }),
]);

// ============ INFERRED TYPES ============

export type SourceLink = z.infer<typeof SourceLinkSchema>;
export type LibraryManga = z.infer<typeof LibraryMangaSchema>;
export type ReadingHistory = z.infer<typeof ReadingHistorySchema>;
export type InstalledSource = z.infer<typeof InstalledSourceSchema>;
export type SourceRegistry = z.infer<typeof SourceRegistrySchema>;
