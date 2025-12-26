import { z } from "zod/v4";

// ============ USER DATA SCHEMAS ============

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
 * Link between a library manga and a source.
 * Reading progress is derived from history (not cached here).
 */
export const SourceLinkSchema = z.object({
  registryId: z.string(),
  sourceId: z.string(),
  mangaId: z.string(),
  // Chapter availability tracking (needed for library UI before fetching details)
  latestChapter: ChapterSummarySchema.optional(),
  // Renamed from seenLatestChapter - the latest chapter when user last acknowledged updates
  updateAcknowledged: ChapterSummarySchema.optional(),
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
  // Chapter metadata (cached for display without re-fetching)
  chapterNumber: z.number().optional(),
  volumeNumber: z.number().optional(),
  chapterTitle: z.string().optional(),
});

/**
 * External IDs for metadata providers
 */
export const ExternalIdsSchema = z.object({
  mangaUpdates: z.number().optional(),
  aniList: z.number().optional(),
  mal: z.number().optional(),
});

/**
 * Manga metadata - can be auto-fetched or manually edited
 */
export const MangaMetadataSchema = z.object({
  title: z.string(),
  cover: z.string().optional(),
  authors: z.array(z.string()).optional(),
  artists: z.array(z.string()).optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  status: z.number().optional(), // MangaStatus enum
  url: z.string().optional(),
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

// ============================================================================
// Normalized local schema types (mirrors cloud canonical tables)
// Phase 8: Simplified - no clock fields, no soft deletes
// ============================================================================

/**
 * User overrides for library items (metadata and cover).
 */
export const UserOverridesSchema = z.object({
  // Metadata overrides (sparse - only user-edited fields)
  metadata: MangaMetadataSchema.partial().nullable().optional(),
  // Cover override URL (R2 or other storage)
  coverUrl: z.string().nullable().optional(),
});

/**
 * Local library item (normalized, mirrors library_items table).
 */
export const LocalLibraryItemSchema = z.object({
  // Primary key
  libraryItemId: z.string(),

  // Metadata (source-derived, not user-editable)
  metadata: MangaMetadataSchema,
  externalIds: ExternalIdsSchema.optional(),

  // Library membership state
  inLibrary: z.boolean().default(true),

  // User overrides
  overrides: UserOverridesSchema.optional(),

  // Sync fields
  createdAt: z.number(),
  updatedAt: z.number(),
});

/**
 * Local source link (normalized, mirrors library_source_links table).
 * Key: "${registryId}:${sourceId}:${sourceMangaId}"
 */
export const LocalSourceLinkSchema = z.object({
  // Primary key (composite: registryId:sourceId:sourceMangaId)
  id: z.string(),

  // FK
  libraryItemId: z.string(),

  // Source reference
  registryId: z.string(),
  sourceId: z.string(),
  sourceMangaId: z.string(),

  // Availability tracking
  latestChapter: ChapterSummarySchema.optional(),
  latestChapterSortKey: z.string().optional(),
  latestFetchedAt: z.number().optional(),
  updateAckChapter: ChapterSummarySchema.optional(),
  updateAckChapterSortKey: z.string().optional(),
  updateAckAt: z.number().optional(),

  // Sync fields
  createdAt: z.number(),
  updatedAt: z.number(),
});

/**
 * Local chapter progress (normalized, mirrors chapter_progress table).
 * Key: "${registryId}:${sourceId}:${sourceMangaId}:${sourceChapterId}"
 */
export const LocalChapterProgressSchema = z.object({
  // Primary key (composite: registryId:sourceId:sourceMangaId:sourceChapterId)
  id: z.string(),

  // Source reference
  registryId: z.string(),
  sourceId: z.string(),
  sourceMangaId: z.string(),
  sourceChapterId: z.string(),

  // Optional link to library item
  libraryItemId: z.string().optional(),

  // Progress (mergeable via high-water mark)
  progress: z.number().int(),
  total: z.number().int(),
  completed: z.boolean(),
  lastReadAt: z.number(),

  // Cached chapter metadata
  chapterNumber: z.number().optional(),
  volumeNumber: z.number().optional(),
  chapterTitle: z.string().optional(),

  // Sync fields
  updatedAt: z.number(),
});

/**
 * Local manga progress (normalized, mirrors manga_progress table).
 * Key: "${registryId}:${sourceId}:${sourceMangaId}"
 */
export const LocalMangaProgressSchema = z.object({
  // Primary key (composite: registryId:sourceId:sourceMangaId)
  id: z.string(),

  // Source reference
  registryId: z.string(),
  sourceId: z.string(),
  sourceMangaId: z.string(),

  // Optional link to library item
  libraryItemId: z.string().optional(),

  // Summary fields
  lastReadAt: z.number(),
  lastReadSourceChapterId: z.string().optional(),
  lastReadChapterNumber: z.number().optional(),
  lastReadVolumeNumber: z.number().optional(),
  lastReadChapterTitle: z.string().optional(),

  // Sync fields
  updatedAt: z.number(),
});

// ============ INFERRED TYPES ============

export type SourceLink = z.infer<typeof SourceLinkSchema>;
export type HistoryEntry = z.infer<typeof HistoryEntrySchema>;
export type ChapterSummary = z.infer<typeof ChapterSummarySchema>;
export type ExternalIds = z.infer<typeof ExternalIdsSchema>;
export type MangaMetadata = z.infer<typeof MangaMetadataSchema>;
export type InstalledSource = z.infer<typeof InstalledSourceSchema>;
export type ReadingMode = z.infer<typeof ReadingModeSchema>;
export type UserSettings = z.infer<typeof UserSettingsSchema>;
export type SourceRegistry = z.infer<typeof SourceRegistrySchema>;

// Normalized local types
export type LocalLibraryItem = z.infer<typeof LocalLibraryItemSchema>;
export type LocalSourceLink = z.infer<typeof LocalSourceLinkSchema>;
export type LocalChapterProgress = z.infer<typeof LocalChapterProgressSchema>;
export type LocalMangaProgress = z.infer<typeof LocalMangaProgressSchema>;
export type UserOverrides = z.infer<typeof UserOverridesSchema>;

// ============ KEY HELPERS ============

/**
 * Build key for source links
 * Format: "${registryId}:${sourceId}:${sourceMangaId}" (URL-encoded)
 */
export function makeSourceLinkId(registryId: string, sourceId: string, sourceMangaId: string): string {
  return `${encodeURIComponent(registryId)}:${encodeURIComponent(sourceId)}:${encodeURIComponent(sourceMangaId)}`;
}

/**
 * Build key for chapter progress
 * Format: "${registryId}:${sourceId}:${sourceMangaId}:${sourceChapterId}" (URL-encoded)
 */
export function makeChapterProgressId(
  registryId: string,
  sourceId: string,
  sourceMangaId: string,
  sourceChapterId: string
): string {
  return `${encodeURIComponent(registryId)}:${encodeURIComponent(sourceId)}:${encodeURIComponent(sourceMangaId)}:${encodeURIComponent(sourceChapterId)}`;
}

/**
 * Build key for manga progress (same format as source link)
 * Format: "${registryId}:${sourceId}:${sourceMangaId}" (URL-encoded)
 */
export function makeMangaProgressId(registryId: string, sourceId: string, sourceMangaId: string): string {
  return makeSourceLinkId(registryId, sourceId, sourceMangaId);
}

// ============ HELPERS ============

/**
 * Merge manga status from multiple sources.
 * Priority: Completed > Hiatus > Ongoing > Cancelled > Unknown
 * MangaStatus values: Unknown=0, Ongoing=1, Completed=2, Cancelled=3, Hiatus=4
 */
export function mergeStatus(...statuses: (number | undefined)[]): number | undefined {
  const priority = [2, 4, 1, 3, 0]; // Completed > Hiatus > Ongoing > Cancelled > Unknown
  for (const p of priority) {
    if (statuses.includes(p)) return p;
  }
  return undefined; // No valid status found
}

/**
 * Check if a specific source has updates (legacy SourceLink)
 */
export function hasSourceUpdate(source: SourceLink): boolean {
  const latest = source.latestChapter?.chapterNumber;
  const acked = source.updateAcknowledged?.chapterNumber;
  return latest != null && acked != null && latest > acked;
}
