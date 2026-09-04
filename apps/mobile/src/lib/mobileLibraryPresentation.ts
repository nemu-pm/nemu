import {
  entryHasAnyUpdate,
  getEntryTitle,
  type ChapterSummary,
  type LibraryEntry,
  type LocalMangaProgress,
  type LocalSourceLink,
} from "@/data/schema";
import { formatChapterShort } from "./formatChapter";
import { formatMobileString, type MobileStrings } from "./mobileI18n";

export type MobileLibraryProgressIndex = Map<string, LocalMangaProgress>;

/** Per-entry source progress, keyed by `libraryItemId`. */
export type MobileLibraryEntryProgressMaps = Map<
  string,
  Map<string, LocalMangaProgress>
>;

export type MobileLibraryProgressInfo = {
  badge?: string;
  subtitle: string;
  lastReadAt?: number;
};

export type MobileLibraryMergeCandidate = {
  entry: LibraryEntry;
  similarity: number;
};

export type MobileLibraryMergeCandidatePage<T> = {
  items: T[];
  page: number;
  totalPages: number;
};

export type MobileLibraryEmptyState = {
  title: string;
  description: string;
  actionLabel: string;
  actionRoute: "/browse" | "/search";
};

export function getMobileCollectionBookSubtitle(
  entry: LibraryEntry,
  strings: MobileStrings
): string {
  const sourceCount = formatMobileString(
    entry.sources.length === 1
      ? strings.library.mangaSourceCountOne
      : strings.library.mangaSourceCountOther,
    { count: entry.sources.length }
  );
  const author = (
    entry.item.overrides?.metadata?.authors ??
    entry.item.metadata.authors ??
    []
  )
    .map((item) => item.trim())
    .find((item) => item.length > 0);

  return author ? `${author} / ${sourceCount}` : sourceCount;
}

export function getMobileLibraryEmptyState({
  error,
  hasInstalledSources,
  strings,
}: {
  error?: string | null;
  hasInstalledSources: boolean;
  strings: MobileStrings;
}): MobileLibraryEmptyState {
  if (error) {
    return {
      title: strings.library.unavailable,
      description: error,
      actionLabel: strings.library.addSource,
      actionRoute: "/browse",
    };
  }

  if (!hasInstalledSources) {
    return {
      title: strings.library.noSources,
      description: strings.library.noSourcesDescription,
      actionLabel: strings.library.addSource,
      actionRoute: "/browse",
    };
  }

  return {
    title: strings.library.empty,
    description: strings.library.emptyDescription,
    actionLabel: strings.library.startSearching,
    actionRoute: "/search",
  };
}

export function shouldRenderMobileLibrarySkeleton({
  loading,
  hasLibraryData,
  hasError,
}: {
  loading: boolean;
  hasLibraryData: boolean;
  hasError: boolean;
}): boolean {
  return loading && !hasError && !hasLibraryData;
}

export function shouldShowMobileLibraryLoadError({
  loading,
  hasLibraryData,
  hasError,
}: {
  loading: boolean;
  hasLibraryData: boolean;
  hasError: boolean;
}): boolean {
  return !loading && !hasLibraryData && hasError;
}

export function shouldShowMobileLibraryEmptyOnboarding({
  loading,
  hasLibraryData,
  hasSelectedCollection,
  hasError,
}: {
  loading: boolean;
  hasLibraryData: boolean;
  hasSelectedCollection: boolean;
  hasError: boolean;
}): boolean {
  return !loading && !hasLibraryData && !hasSelectedCollection && !hasError;
}

export function buildMobileProgressIndex(
  progress: LocalMangaProgress[]
): MobileLibraryProgressIndex {
  return new Map(progress.map((item) => [item.id, item]));
}

export function buildMobileEntryProgressMap(
  entry: LibraryEntry,
  progressIndex: MobileLibraryProgressIndex
): Map<string, LocalMangaProgress> {
  const progress = new Map<string, LocalMangaProgress>();
  const aliasIndex = getMobileLibraryAliasIndex(progressIndex);
  for (const source of entry.sources) {
    const item =
      progressIndex.get(source.id) ??
      findMobileSourceProgressByLibraryAlias(entry, source, aliasIndex);
    if (item) progress.set(source.id, item);
  }
  return progress;
}

/**
 * Precomputes the per-entry source progress maps once for a whole library
 * page. Sorting and card rendering both need them, and rebuilding one per
 * comparison turned the sort into an O(n log n * sources) scan of every
 * progress row.
 */
export function buildMobileLibraryEntryProgressMaps(
  entries: LibraryEntry[],
  progressIndex: MobileLibraryProgressIndex
): MobileLibraryEntryProgressMaps {
  const maps: MobileLibraryEntryProgressMaps = new Map();
  for (const entry of entries) {
    maps.set(
      entry.item.libraryItemId,
      buildMobileEntryProgressMap(entry, progressIndex)
    );
  }
  return maps;
}

function resolveMobileEntryProgressMap(
  entry: LibraryEntry,
  progressIndex: MobileLibraryProgressIndex,
  entryProgress?: Map<string, LocalMangaProgress>
): Map<string, LocalMangaProgress> {
  return entryProgress ?? buildMobileEntryProgressMap(entry, progressIndex);
}

function libraryAliasKey(
  libraryItemId: string,
  registryId: string,
  sourceMangaId: string
): string {
  return `${libraryItemId}\u0000${registryId}\u0000${sourceMangaId}`;
}

// A `null` value marks an ambiguous alias: the linear scan this replaces only
// accepted a unique match, so more than one row for a key resolves to nothing.
type MobileLibraryAliasIndex = Map<string, LocalMangaProgress | null>;

const mobileLibraryAliasIndexes = new WeakMap<
  MobileLibraryProgressIndex,
  MobileLibraryAliasIndex
>();

/** Built once per progress index identity; the index is treated as frozen. */
function getMobileLibraryAliasIndex(
  progressIndex: MobileLibraryProgressIndex
): MobileLibraryAliasIndex {
  const cached = mobileLibraryAliasIndexes.get(progressIndex);
  if (cached) return cached;
  const index: MobileLibraryAliasIndex = new Map();
  for (const item of progressIndex.values()) {
    if (!item.libraryItemId) continue;
    const key = libraryAliasKey(
      item.libraryItemId,
      item.registryId,
      item.sourceMangaId
    );
    index.set(key, index.has(key) ? null : item);
  }
  mobileLibraryAliasIndexes.set(progressIndex, index);
  return index;
}

function findMobileSourceProgressByLibraryAlias(
  entry: LibraryEntry,
  source: LocalSourceLink,
  aliasIndex: MobileLibraryAliasIndex
): LocalMangaProgress | undefined {
  return (
    aliasIndex.get(
      libraryAliasKey(
        entry.item.libraryItemId,
        source.registryId,
        source.sourceMangaId
      )
    ) ?? undefined
  );
}

export function getMobileEntryMostRecentSource(
  entry: LibraryEntry,
  progress: Map<string, LocalMangaProgress>
): LocalSourceLink | undefined {
  let bestSource = entry.sources[0];
  let bestTime = 0;

  for (const source of entry.sources) {
    const sourceProgress = progress.get(source.id);
    if (sourceProgress && sourceProgress.lastReadAt > bestTime) {
      bestSource = source;
      bestTime = sourceProgress.lastReadAt;
    }
  }

  return bestSource;
}

export function getMobileEntryAddedAt(entry: LibraryEntry): number {
  return entry.item.createdAt;
}

export function getMobileTitleSimilarity(
  baseTitle: string,
  candidateTitle: string
): number {
  const baseWords = new Set(
    baseTitle
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => word.length > 2)
  );
  if (!baseWords.size) return 0;
  const candidateWords = candidateTitle
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 2);
  const matches = candidateWords.filter((word) => baseWords.has(word)).length;
  return matches / baseWords.size;
}

function progressChapter(progress: LocalMangaProgress | undefined): ChapterSummary | null {
  if (!progress?.lastReadSourceChapterId) return null;
  return {
    id: progress.lastReadSourceChapterId,
    title: progress.lastReadChapterTitle,
    chapterNumber: progress.lastReadChapterNumber,
    volumeNumber: progress.lastReadVolumeNumber,
  };
}

export function getMobileLibraryProgressInfo(
  entry: LibraryEntry,
  progressIndex: MobileLibraryProgressIndex,
  strings: MobileStrings,
  entryProgress?: Map<string, LocalMangaProgress>
): MobileLibraryProgressInfo {
  const progress = resolveMobileEntryProgressMap(
    entry,
    progressIndex,
    entryProgress
  );
  const recentSource = getMobileEntryMostRecentSource(entry, progress);
  if (!recentSource) {
    return {
      badge: undefined,
      subtitle: strings.library.progressUnread,
      lastReadAt: undefined,
    };
  }

  const sourceProgress = progress.get(recentSource.id);
  const lastReadChapter = progressChapter(sourceProgress);
  const latestChapter = recentSource.latestChapter;
  const isCaughtUp =
    sourceProgress?.lastReadSourceChapterId != null &&
    latestChapter != null &&
    sourceProgress.lastReadSourceChapterId === latestChapter.id;

  let subtitle = strings.library.progressUnread;
  if (isCaughtUp) {
    subtitle = strings.library.progressCaughtUp;
  } else if (lastReadChapter && latestChapter) {
    subtitle = `${formatChapterShort(lastReadChapter, strings)} / ${formatChapterShort(
      latestChapter,
      strings,
    )}`;
  } else if (lastReadChapter) {
    subtitle = formatChapterShort(lastReadChapter, strings);
  }

  return {
    badge: entryHasAnyUpdate(entry) ? strings.library.updated : undefined,
    subtitle,
    lastReadAt: sourceProgress?.lastReadAt,
  };
}

/**
 * Schwartzian transform: each entry is decorated once with the three sort
 * keys, so a comparison never rebuilds a progress map or re-reads a title.
 * Ordering is identical to the previous per-comparison implementation.
 */
export function sortMobileLibraryEntries(
  entries: LibraryEntry[],
  progressIndex: MobileLibraryProgressIndex,
  entryProgressMaps?: MobileLibraryEntryProgressMaps
): LibraryEntry[] {
  return entries
    .map((entry) => {
      const progress = resolveMobileEntryProgressMap(
        entry,
        progressIndex,
        entryProgressMaps?.get(entry.item.libraryItemId)
      );
      const source = getMobileEntryMostRecentSource(entry, progress);
      const readTime = source ? (progress.get(source.id)?.lastReadAt ?? 0) : 0;
      return {
        entry,
        updated: entryHasAnyUpdate(entry),
        time: Math.max(readTime, getMobileEntryAddedAt(entry)),
        title: getEntryTitle(entry),
      };
    })
    .sort((a, b) => {
      if (a.updated !== b.updated) return a.updated ? -1 : 1;
      if (a.time !== b.time) return b.time - a.time;
      return a.title.localeCompare(b.title);
    })
    .map((decorated) => decorated.entry);
}

export function sortMobileLibraryMergeCandidates(
  currentEntry: LibraryEntry,
  entries: LibraryEntry[],
  progressIndex: MobileLibraryProgressIndex
): MobileLibraryMergeCandidate[] {
  const currentTitle = getEntryTitle(currentEntry);
  return entries
    .filter(
      (candidate) =>
        candidate.item.libraryItemId !== currentEntry.item.libraryItemId
    )
    .map((entry) => {
      const progress = buildMobileEntryProgressMap(entry, progressIndex);
      const recentSource = getMobileEntryMostRecentSource(entry, progress);
      const readTime = recentSource
        ? (progress.get(recentSource.id)?.lastReadAt ?? 0)
        : 0;
      return {
        entry,
        similarity: getMobileTitleSimilarity(currentTitle, getEntryTitle(entry)),
        hasUpdate: entryHasAnyUpdate(entry),
        activityTime: Math.max(readTime, getMobileEntryAddedAt(entry)),
      };
    })
    .sort((a, b) => {
      const aLikely = a.similarity > 0.3;
      const bLikely = b.similarity > 0.3;
      if (aLikely !== bLikely) return aLikely ? -1 : 1;
      if (a.hasUpdate !== b.hasUpdate) return a.hasUpdate ? -1 : 1;
      if (a.activityTime !== b.activityTime) return b.activityTime - a.activityTime;
      return getEntryTitle(a.entry).localeCompare(getEntryTitle(b.entry));
    })
    .map(({ entry, similarity }) => ({ entry, similarity }));
}

export function paginateMobileLibraryMergeCandidates<T>(
  candidates: T[],
  page: number,
  pageSize: number
): MobileLibraryMergeCandidatePage<T> {
  const safePageSize =
    Number.isFinite(pageSize) && pageSize > 0
      ? Math.max(1, Math.floor(pageSize))
      : Math.max(1, candidates.length);
  const totalPages = Math.max(1, Math.ceil(candidates.length / safePageSize));
  const safePage = Number.isFinite(page) ? Math.round(page) : 0;
  const clampedPage = Math.max(0, Math.min(safePage, totalPages - 1));
  const start = clampedPage * safePageSize;

  return {
    items: candidates.slice(start, start + safePageSize),
    page: clampedPage,
    totalPages,
  };
}
