import {
  type ChapterSummary,
  type LibraryEntry,
  type LocalMangaProgress,
  type LocalSourceLink,
} from "@/data/schema";
import {
  buildMobileEntryProgressMap,
  getMobileEntryMostRecentSource,
  type MobileLibraryEntryProgressMaps,
  type MobileLibraryProgressIndex,
} from "./mobileLibraryPresentation";

/** One "continue reading" card: a library title with an unfinished last read. */
export type MobileContinueReadingItem = {
  entry: LibraryEntry;
  /** The source the title was last read on (the one Resume opens). */
  source: LocalSourceLink;
  progress: LocalMangaProgress;
  /** The chapter Resume reopens; the reader restores its saved page. */
  chapter: ChapterSummary;
  latestChapter: ChapterSummary | null;
  lastReadAt: number;
};

export const MOBILE_CONTINUE_READING_LIMIT = 8;

/**
 * Most recently read library titles that still have something to read:
 * caught-up titles (last read = the source's latest chapter) are left to the
 * shelf. Newest first; ties keep library order so the carousel is stable.
 */
export function selectMobileContinueReading(
  entries: LibraryEntry[],
  progressIndex: MobileLibraryProgressIndex,
  entryProgressMaps?: MobileLibraryEntryProgressMaps,
  limit = MOBILE_CONTINUE_READING_LIMIT,
): MobileContinueReadingItem[] {
  const items: MobileContinueReadingItem[] = [];
  for (const entry of entries) {
    const progressMap =
      entryProgressMaps?.get(entry.item.libraryItemId) ??
      buildMobileEntryProgressMap(entry, progressIndex);
    const source = getMobileEntryMostRecentSource(entry, progressMap);
    if (!source) continue;
    const progress = progressMap.get(source.id);
    if (!progress?.lastReadSourceChapterId) continue;
    const latestChapter = source.latestChapter ?? null;
    if (latestChapter && latestChapter.id === progress.lastReadSourceChapterId) {
      continue;
    }
    items.push({
      entry,
      source,
      progress,
      chapter: {
        id: progress.lastReadSourceChapterId,
        title: progress.lastReadChapterTitle,
        chapterNumber: progress.lastReadChapterNumber,
        volumeNumber: progress.lastReadVolumeNumber,
      },
      latestChapter,
      lastReadAt: progress.lastReadAt,
    });
  }
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => b.item.lastReadAt - a.item.lastReadAt || a.index - b.index)
    .slice(0, Math.max(0, limit))
    .map(({ item }) => item);
}
