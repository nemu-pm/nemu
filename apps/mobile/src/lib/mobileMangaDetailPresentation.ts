import {
  sourceHasUpdate,
  type ChapterSummary,
  type LocalMangaProgress,
  type LocalSourceLink,
} from "@/data/schema";
import { formatChapterShort, formatChapterTitle } from "./formatChapter";
import { formatMobileString, type MobileStrings } from "./mobileI18n";
import {
  getMobileSourceMangaContinueTarget,
  resolveMobileContinueTarget,
  type MobileSourceChapterCompletion,
} from "./mobileSourceMangaContinue";

/**
 * Widest the detail card's primary "Start reading / Continue" button grows.
 * A portrait phone's copy column is narrower than this, so it only bites on
 * landscape phones and iPads, where a flex:1 pill would otherwise stretch
 * across the whole card.
 */
export const MOBILE_MANGA_DETAIL_PRIMARY_ACTION_MAX_WIDTH = 320;

export type MobileMangaDetailSourceTabBadge = {
  detail: string;
  text: string;
  updated: boolean;
};

export type MobileMangaDetailContinueAction = {
  chapter: ChapterSummary | null;
  isContinuation: boolean;
  /** Finished the latest chapter: "Caught up", reopening it from page 1. */
  caughtUp?: boolean;
};

export type MobileMangaDetailLiveStatus =
  | "idle"
  | "loading"
  | "ready"
  | "blocked"
  | "error";

export function formatMobileMangaDetailChapterCount(
  count: number,
  live: boolean,
  strings: MobileStrings,
): string {
  if (live) {
    return formatMobileString(
      count === 1
        ? strings.mangaDetail.chapterCountLiveOne
        : strings.mangaDetail.chapterCountLiveOther,
      { count },
    );
  }
  return formatMobileString(
    count === 1
      ? strings.mangaDetail.chapterCountLocalOne
      : strings.mangaDetail.chapterCountLocalOther,
    { count },
  );
}

export function getMobileMangaDetailEmptyChapterMessage({
  liveStatus,
  liveDetail,
  strings,
}: {
  liveStatus: MobileMangaDetailLiveStatus;
  liveDetail?: string;
  strings: MobileStrings;
}): string {
  if (liveStatus === "ready") {
    return strings.mangaDetail.noChapters;
  }

  if (liveStatus === "loading") {
    return liveDetail?.trim() || strings.mangaDetail.loadingManga;
  }

  return strings.mangaDetail.nativeRuntimeRequired;
}

export function getMobileMangaDetailSourceTabBadge({
  source,
  chapterCount,
  chapterCountIsLive,
  strings,
}: {
  source: LocalSourceLink;
  chapterCount: number;
  chapterCountIsLive: boolean;
  strings: MobileStrings;
}): MobileMangaDetailSourceTabBadge | null {
  const updated = sourceHasUpdate(source);

  if (chapterCountIsLive) {
    return {
      detail: formatMobileMangaDetailChapterCount(
        chapterCount,
        chapterCountIsLive,
        strings,
      ),
      text: String(chapterCount),
      updated,
    };
  }

  if (!source.latestChapter) return null;
  return {
    detail: formatChapterTitle(source.latestChapter, strings),
    text: formatChapterShort(source.latestChapter, strings),
    updated,
  };
}

export function getMobileMangaDetailContinueAction({
  continueSource,
  selectedSource,
  selectedChapters,
  selectedChaptersLoaded = false,
  continueChapters,
  continueChaptersLoaded = false,
  progress,
  chapterProgress,
}: {
  continueSource: LocalSourceLink | null | undefined;
  selectedSource: LocalSourceLink | null | undefined;
  selectedChapters: ChapterSummary[];
  selectedChaptersLoaded?: boolean;
  continueChapters?: ChapterSummary[] | null;
  continueChaptersLoaded?: boolean;
  progress: LocalMangaProgress | null | undefined;
  /**
   * The continue source's chapter progress: a finished last-read chapter
   * moves Continue to the next unread chapter (or "Caught up").
   */
  chapterProgress?: MobileSourceChapterCompletion | null;
}): MobileMangaDetailContinueAction {
  if (!continueSource) {
    return { chapter: null, isContinuation: false };
  }

  if (continueSource.id === selectedSource?.id) {
    const target = getMobileSourceMangaContinueTarget(selectedChapters, progress, chapterProgress);
    return {
      ...target,
      chapter:
        target.chapter ??
        (selectedChaptersLoaded ? null : continueSource.latestChapter ?? null),
    };
  }

  if (continueChaptersLoaded) {
    return getMobileSourceMangaContinueTarget(continueChapters ?? [], progress, chapterProgress);
  }

  // No list yet: the progress' own chapter (caught up when it is the
  // finished latest chapter), else the latest chapter.
  return resolveMobileContinueTarget({
    chapters: null,
    progress,
    chapterProgress,
    latestChapter: continueSource.latestChapter ?? null,
  });
}
