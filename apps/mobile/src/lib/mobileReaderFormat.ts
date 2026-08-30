import {
  makeSourceLinkId,
  type ChapterSummary,
  type LocalSourceLink,
  type ReadingMode,
} from "@/data/schema";
import { formatChapterTitle } from "@/lib/formatChapter";
import { formatMobileString, type MobileStrings } from "@/lib/mobileI18n";
import { formatReaderPageValue } from "@/lib/mobileReaderProgress";
import type { MobileReaderSettingsActionState } from "@/lib/mobileReaderSettings";
import type { ReaderSettingsAction, ReaderState } from "@/lib/mobileReaderTypes";

export function mobileReaderSettingsActionStateFromAction(
  action: ReaderSettingsAction | null,
): MobileReaderSettingsActionState {
  return {
    changingReadingMode: action === "reading-mode",
    changingScrollWidth: action === "scroll-width",
    changingTwoPageMode: action === "two-page-mode",
    changingPagePairingMode: action === "page-pairing-mode",
    changingPageImageProcessing: action === "page-image-processing",
  };
}

export function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export function readerSourceLinkReference(
  registryId: string,
  sourceId: string,
  mangaId: string,
): LocalSourceLink {
  return {
    id: makeSourceLinkId(registryId, sourceId, mangaId),
    libraryItemId: "",
    registryId,
    sourceId,
    sourceMangaId: mangaId,
    createdAt: 0,
    updatedAt: 0,
  };
}

export function chapterFromState(
  chapterId: string,
  state: ReaderState,
  fallback?: ChapterSummary | null,
): ChapterSummary {
  let resolved: ChapterSummary;
  const progress = state.chapterProgress;
  if (progress) {
    resolved = {
      id: chapterId,
      title: progress.chapterTitle,
      chapterNumber: progress.chapterNumber,
      volumeNumber: progress.volumeNumber,
    };
  } else if (state.sourceLink?.latestChapter?.id === chapterId) {
    resolved = state.sourceLink.latestChapter;
  } else if (state.mangaProgress?.lastReadSourceChapterId === chapterId) {
    resolved = {
      id: chapterId,
      title: state.mangaProgress.lastReadChapterTitle,
      chapterNumber: state.mangaProgress.lastReadChapterNumber,
      volumeNumber: state.mangaProgress.lastReadVolumeNumber,
    };
  } else {
    resolved = { id: chapterId };
  }

  return mergeMobileReaderChapterFallback(chapterId, resolved, fallback);
}

export function mergeMobileReaderChapterFallback(
  chapterId: string,
  resolved: ChapterSummary,
  fallback?: ChapterSummary | null,
): ChapterSummary {
  const merged: ChapterSummary = {
    ...fallback,
    ...resolved,
    id: chapterId,
    chapterNumber: resolved.chapterNumber ?? fallback?.chapterNumber,
    volumeNumber: resolved.volumeNumber ?? fallback?.volumeNumber,
  };
  const resolvedTitle = resolved.title?.trim();
  const fallbackTitle = fallback?.title?.trim();
  const title =
    resolvedTitle && resolvedTitle !== chapterId
      ? resolvedTitle
      : fallbackTitle && fallbackTitle !== chapterId
        ? fallbackTitle
        : undefined;
  if (title) merged.title = title;
  else delete merged.title;
  return merged;
}

export function formatReaderStageAccessibilityLabel(
  pageIndex: number,
  pageCount: number,
  mode: ReadingMode,
  action: string,
  strings: MobileStrings,
): string {
  if (pageCount <= 0) return action;
  return formatMobileString(strings.reader.stageAccessibility, {
    page: formatReaderPageValue(pageIndex, pageCount, mode, strings),
    action,
  });
}

export function formatReaderLoadedPages(
  count: number,
  strings: MobileStrings,
): string {
  const template =
    count === 1 ? strings.reader.pageLoadedOne : strings.reader.pageLoadedOther;
  return formatMobileString(template, { count });
}

export function chapterDirectionLabel(
  direction: "previous" | "next",
  strings: MobileStrings,
): string {
  return direction === "previous"
    ? strings.reader.previousChapter
    : strings.reader.nextChapter;
}

export function formatChapterAccessibilityLabel(
  direction: "previous" | "next",
  chapter: ChapterSummary,
  strings: MobileStrings,
): string {
  return formatMobileString(strings.reader.chapterAccessibility, {
    direction: chapterDirectionLabel(direction, strings),
    chapter: formatChapterTitle(chapter, strings),
  });
}

export function pluginValueText(value: unknown, strings: MobileStrings): string {
  if (typeof value === "boolean") {
    return value ? strings.reader.pluginValueOn : strings.reader.pluginValueOff;
  }
  if (typeof value === "number") return `${value}%`;
  if (value === "jlpt") return strings.reader.pluginValueSimpleJapanese;
  if (value === "app") return strings.reader.pluginValueAppLanguage;
  return typeof value === "string" && value.trim()
    ? value
    : strings.reader.pluginValueDefault;
}
