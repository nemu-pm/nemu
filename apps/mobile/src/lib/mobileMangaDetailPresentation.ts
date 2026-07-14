import {
  sourceHasUpdate,
  type ChapterSummary,
  type LocalMangaProgress,
  type LocalSourceLink,
} from "@/data/schema";
import { formatChapterShort, formatChapterTitle } from "./formatChapter";
import { formatMobileString, type MobileStrings } from "./mobileI18n";
import { getMobileSourceMangaContinueTarget } from "./mobileSourceMangaContinue";

export type MobileMangaDetailSourceTabBadge = {
  detail: string;
  text: string;
  updated: boolean;
};

export type MobileMangaDetailContinueAction = {
  chapter: ChapterSummary | null;
  isContinuation: boolean;
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

function progressChapter(progress: LocalMangaProgress | null | undefined): ChapterSummary | null {
  if (!progress?.lastReadSourceChapterId) return null;
  return {
    id: progress.lastReadSourceChapterId,
    title: progress.lastReadChapterTitle,
    chapterNumber: progress.lastReadChapterNumber,
    volumeNumber: progress.lastReadVolumeNumber,
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
}: {
  continueSource: LocalSourceLink | null | undefined;
  selectedSource: LocalSourceLink | null | undefined;
  selectedChapters: ChapterSummary[];
  selectedChaptersLoaded?: boolean;
  continueChapters?: ChapterSummary[] | null;
  continueChaptersLoaded?: boolean;
  progress: LocalMangaProgress | null | undefined;
}): MobileMangaDetailContinueAction {
  if (!continueSource) {
    return { chapter: null, isContinuation: false };
  }

  if (continueSource.id === selectedSource?.id) {
    const target = getMobileSourceMangaContinueTarget(selectedChapters, progress);
    return {
      chapter:
        target.chapter ??
        (selectedChaptersLoaded ? null : continueSource.latestChapter ?? null),
      isContinuation: target.isContinuation,
    };
  }

  if (continueChaptersLoaded) {
    return getMobileSourceMangaContinueTarget(continueChapters ?? [], progress);
  }

  const chapter = progressChapter(progress);
  return {
    chapter: chapter ?? continueSource.latestChapter ?? null,
    isContinuation: Boolean(chapter),
  };
}
