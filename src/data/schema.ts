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
 * Reading history entry (separate from library)
 * Keyed by composite: registryId:sourceId:mangaId:chapterId
 */
export const HistoryEntrySchema = z.object({
  id: z.string(),
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
 * Minimal chapter metadata for library display.
 * Stored as raw data (not pre-formatted) to support i18n.
 */
export const ChapterSummarySchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  chapterNumber: z.number().optional(),
  volumeNumber: z.number().optional(),
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
  activeRegistryId: z.string(),
  activeSourceId: z.string(),
  // Reading progress
  lastReadChapter: ChapterSummarySchema.optional(),
  lastReadAt: z.number().optional(),
  // Chapter availability tracking
  latestChapter: ChapterSummarySchema.optional(),
  seenLatestChapter: ChapterSummarySchema.optional(),
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
export type HistoryEntry = z.infer<typeof HistoryEntrySchema>;
export type ChapterSummary = z.infer<typeof ChapterSummarySchema>;
export type LibraryManga = z.infer<typeof LibraryMangaSchema>;
export type InstalledSource = z.infer<typeof InstalledSourceSchema>;
export type ReadingMode = z.infer<typeof ReadingModeSchema>;
export type UserSettings = z.infer<typeof UserSettingsSchema>;
export type SourceRegistry = z.infer<typeof SourceRegistrySchema>;

