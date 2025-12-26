/**
 * Canonical UI View Types (Phase 7)
 *
 * These types are for UI consumption. They use the canonical local tables:
 * - LocalLibraryItem (library_items)
 * - LocalSourceLink (source_links)
 * - LocalChapterProgress (chapter_progress)
 * - LocalMangaProgress (manga_progress)
 *
 * The UI should use these types instead of legacy LibraryManga.
 */

import type {
  LocalLibraryItem,
  LocalSourceLink,
  LocalMangaProgress,
  MangaMetadata,
  ChapterSummary,
  ExternalIds,
} from "./schema";

// ============================================================================
// Canonical UI Types
// ============================================================================

/**
 * LibraryEntry - The canonical UI view for a library item.
 * Combines a LocalLibraryItem with its source links.
 *
 * This replaces the legacy LibraryManga type.
 */
export interface LibraryEntry {
  item: LocalLibraryItem;
  sources: LocalSourceLink[];
}

/**
 * LibraryEntryWithProgress - LibraryEntry with reading progress.
 * Used when UI needs progress info (e.g., "Continue reading").
 */
export interface LibraryEntryWithProgress extends LibraryEntry {
  progress: Map<string, LocalMangaProgress>; // keyed by source cursorId
}

// ============================================================================
// Helpers for LibraryEntry
// ============================================================================

/**
 * Get effective metadata for a library entry.
 * Priority: overrides.metadata > item.metadata
 */
export function getEntryEffectiveMetadata(entry: LibraryEntry): MangaMetadata {
  const base = entry.item.metadata;
  const overrides = entry.item.overrides?.metadata;

  if (!overrides) return base;

  return {
    title: overrides.title ?? base.title,
    cover: overrides.cover ?? base.cover,
    authors: overrides.authors ?? base.authors,
    artists: overrides.artists ?? base.artists,
    description: overrides.description ?? base.description,
    tags: overrides.tags ?? base.tags,
    status: overrides.status ?? base.status,
    url: overrides.url ?? base.url,
  };
}

/**
 * Get effective cover for a library entry.
 * Priority: overrides.coverUrl > overrides.metadata.cover > item.metadata.cover
 */
export function getEntryCover(entry: LibraryEntry): string | undefined {
  return (
    entry.item.overrides?.coverUrl ??
    entry.item.overrides?.metadata?.cover ??
    entry.item.metadata.cover
  );
}

/**
 * Get effective title for a library entry.
 */
export function getEntryTitle(entry: LibraryEntry): string {
  return (
    entry.item.overrides?.metadata?.title ?? entry.item.metadata.title
  );
}

/**
 * Check if any source has updates (latest > acknowledged).
 */
export function entryHasAnyUpdate(entry: LibraryEntry): boolean {
  return entry.sources.some((source) => sourceHasUpdate(source));
}

/**
 * Check if a source has updates.
 */
export function sourceHasUpdate(source: LocalSourceLink): boolean {
  if (!source.latestChapter || !source.updateAckChapter) return false;
  const latestNum = source.latestChapter.chapterNumber;
  const ackNum = source.updateAckChapter.chapterNumber;
  if (latestNum == null || ackNum == null) return false;
  return latestNum > ackNum;
}

/**
 * Get the first source (fallback when no history).
 */
export function getEntryFirstSource(entry: LibraryEntry): LocalSourceLink | undefined {
  return entry.sources[0];
}

/**
 * Get the most recently read source from progress.
 * Falls back to first source if no progress.
 */
export function getEntryMostRecentSource(
  entry: LibraryEntry,
  progress: Map<string, LocalMangaProgress>
): LocalSourceLink | undefined {
  let bestSource = entry.sources[0];
  let bestTime = 0;

  for (const source of entry.sources) {
    const sourceProgress = progress.get(source.cursorId);
    if (sourceProgress && sourceProgress.lastReadAt > bestTime) {
      bestTime = sourceProgress.lastReadAt;
      bestSource = source;
    }
  }

  return bestSource;
}

/**
 * Get latest chapter for an entry (highest across all sources).
 */
export function getEntryLatestChapter(entry: LibraryEntry): ChapterSummary | undefined {
  let latestChapter: ChapterSummary | undefined;
  let highestNum = -Infinity;

  for (const source of entry.sources) {
    const chapterNum = source.latestChapter?.chapterNumber;
    if (chapterNum != null && chapterNum > highestNum) {
      highestNum = chapterNum;
      latestChapter = source.latestChapter;
    }
  }

  return latestChapter;
}

/**
 * Get external IDs for an entry.
 */
export function getEntryExternalIds(entry: LibraryEntry): ExternalIds | undefined {
  return entry.item.externalIds;
}

/**
 * Build a source key for lookups.
 */
export function makeSourceKey(registryId: string, sourceId: string, sourceMangaId: string): string {
  return `${registryId}:${sourceId}:${sourceMangaId}`;
}

/**
 * Check if entry is in library (not soft-deleted).
 */
export function isEntryInLibrary(entry: LibraryEntry): boolean {
  return entry.item.inLibrary !== false;
}

/**
 * Get addedAt timestamp for an entry.
 */
export function getEntryAddedAt(entry: LibraryEntry): number {
  return entry.item.createdAt;
}

/**
 * Get updatedAt timestamp for an entry.
 */
export function getEntryUpdatedAt(entry: LibraryEntry): number {
  return entry.item.updatedAt;
}

// ============================================================================
// Conversion helpers (for migration period)
// ============================================================================

/**
 * Convert LocalSourceLink to legacy SourceLink format.
 * Use during migration period when some code still expects SourceLink.
 */
export function sourceLinkToLegacy(source: LocalSourceLink): {
  registryId: string;
  sourceId: string;
  mangaId: string;
  latestChapter?: ChapterSummary;
  updateAcknowledged?: ChapterSummary;
} {
  return {
    registryId: source.registryId,
    sourceId: source.sourceId,
    mangaId: source.sourceMangaId,
    latestChapter: source.latestChapter,
    updateAcknowledged: source.updateAckChapter,
  };
}

/**
 * Get all source links as legacy format.
 */
export function getEntrySourcesAsLegacy(entry: LibraryEntry) {
  return entry.sources.map(sourceLinkToLegacy);
}

