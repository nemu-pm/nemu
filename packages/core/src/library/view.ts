/**
 * Library entry view helpers — shared by web and mobile.
 *
 * These read only the fields they use, via structural types, so each app's
 * concrete (richer) `LibraryEntry` / `LocalSourceLink` / `MangaMetadata` /
 * `UserOverrides` are assignable without core importing app-side types. Behavior
 * is byte-identical to the prior per-app definitions (verified: web's explicit
 * null-object guard and mobile's optional-chaining form of `sourceHasUpdate`
 * reduce to the same result across every edge case — undefined / null /
 * empty-object chapter / `chapterNumber === 0` / both-present). See
 * `view.test.ts` for the pinning cases.
 */

export interface ChapterSummaryLike {
  chapterNumber?: number;
}

export interface LocalSourceLinkLike {
  latestChapter?: ChapterSummaryLike | null;
  updateAckChapter?: ChapterSummaryLike | null;
}

export interface LibraryEntryLike {
  item: {
    metadata: { title: string; cover?: string };
    overrides?: {
      coverUrl?: string | null;
      metadata?: { title?: string; cover?: string } | null;
    } | null;
  };
  sources: LocalSourceLinkLike[];
}

/**
 * Get effective title for a library entry.
 * Priority: overrides.metadata.title > item.metadata.title
 */
export function getEntryTitle(entry: LibraryEntryLike): string {
  return entry.item.overrides?.metadata?.title ?? entry.item.metadata.title;
}

/**
 * Get effective cover for a library entry.
 * Priority: overrides.coverUrl > overrides.metadata.cover > item.metadata.cover
 */
export function getEntryCover(entry: LibraryEntryLike): string | undefined {
  return (
    entry.item.overrides?.coverUrl ??
    entry.item.overrides?.metadata?.cover ??
    entry.item.metadata.cover
  );
}

/**
 * Check if a source has updates (latest chapter number > acknowledged).
 * Returns false unless both chapter numbers are non-null numbers.
 */
export function sourceHasUpdate(source: LocalSourceLinkLike): boolean {
  const latest = source.latestChapter?.chapterNumber;
  const ack = source.updateAckChapter?.chapterNumber;
  if (latest == null || ack == null) return false;
  return latest > ack;
}

/**
 * Check if any source on an entry has updates.
 */
export function entryHasAnyUpdate(entry: LibraryEntryLike): boolean {
  return entry.sources.some((source) => sourceHasUpdate(source));
}