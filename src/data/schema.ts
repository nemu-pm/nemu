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
 * Reading progress for a chapter (embedded in LibraryManga)
 */
export const ChapterProgressSchema = z.object({
  progress: z.number().int(),
  total: z.number().int(),
  completed: z.boolean(),
  dateRead: z.number(),
});

/**
 * A manga saved in the user's library (with embedded history)
 */
export const LibraryMangaSchema = z.object({
  id: z.string(),
  title: z.string(),
  cover: z.string().optional(),
  addedAt: z.number(),
  sources: z.array(SourceLinkSchema).min(1),
  activeRegistryId: z.string(),
  activeSourceId: z.string(),
  // Reading history per chapter (keyed by chapterId)
  history: z.record(z.string(), ChapterProgressSchema).default({}),
});

/**
 * An installed source
 */
export const InstalledSourceSchema = z.object({
  id: z.string(), // Composite: registryId:sourceId
  registryId: z.string(),
  version: z.number(),
});

/**
 * Reading mode preference
 */
export const ReadingModeSchema = z.enum(["rtl", "ltr", "scrolling"]);

/**
 * User settings (synced)
 */
export const UserSettingsSchema = z.object({
  readingMode: ReadingModeSchema.default("rtl"),
  installedSources: z.array(InstalledSourceSchema).default([]),
});

/**
 * Source registry configuration (local only, not synced)
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
export type ChapterProgress = z.infer<typeof ChapterProgressSchema>;
export type LibraryManga = z.infer<typeof LibraryMangaSchema>;
export type InstalledSource = z.infer<typeof InstalledSourceSchema>;
export type ReadingMode = z.infer<typeof ReadingModeSchema>;
export type UserSettings = z.infer<typeof UserSettingsSchema>;
export type SourceRegistry = z.infer<typeof SourceRegistrySchema>;

