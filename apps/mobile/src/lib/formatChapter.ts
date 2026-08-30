import type { ChapterSummary } from "@/data/schema";
import { formatMobileString, type MobileStrings } from "./mobileI18n";

const SHORT_TITLE_MAX_LENGTH = 18;

function formatNumber(value: number): string {
  return (Math.round(value * 100) / 100).toString();
}

export function formatChapterTitle(
  chapter: ChapterSummary,
  strings: MobileStrings,
): string {
  const volumeNumber =
    chapter.volumeNumber != null ? formatNumber(chapter.volumeNumber) : null;
  const chapterNumber =
    chapter.chapterNumber != null ? formatNumber(chapter.chapterNumber) : null;

  if (volumeNumber == null && chapterNumber == null) {
    return chapter.title || strings.chapter.untitled;
  }

  if (volumeNumber == null && chapterNumber != null) {
    return formatMobileString(strings.chapter.chapterX, { n: chapterNumber });
  }

  if (volumeNumber != null && chapterNumber == null) {
    return formatMobileString(strings.chapter.volumeX, { n: volumeNumber });
  }

  const parts: string[] = [];
  if (volumeNumber != null) {
    parts.push(formatMobileString(strings.chapter.volX, { n: volumeNumber }));
  }
  if (chapterNumber != null) {
    parts.push(formatMobileString(strings.chapter.chX, { n: chapterNumber }));
  }
  return parts.join(" ");
}

export function formatChapterSubtitle(chapter: ChapterSummary): string | null {
  if (chapter.volumeNumber == null && chapter.chapterNumber == null) return null;
  return chapter.title ?? null;
}

function truncateWithEllipsis(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

export function formatChapterShort(
  chapter: ChapterSummary,
  strings: MobileStrings,
): string {
  const volumeNumber =
    chapter.volumeNumber != null ? formatNumber(chapter.volumeNumber) : null;
  const chapterNumber =
    chapter.chapterNumber != null ? formatNumber(chapter.chapterNumber) : null;

  if (volumeNumber == null && chapterNumber == null) {
    return chapter.title
      ? truncateWithEllipsis(chapter.title, SHORT_TITLE_MAX_LENGTH)
      : strings.chapter.untitled;
  }

  const parts: string[] = [];
  if (volumeNumber != null) {
    parts.push(formatMobileString(strings.chapter.volX, { n: volumeNumber }));
  }
  if (chapterNumber != null) {
    parts.push(formatMobileString(strings.chapter.chX, { n: chapterNumber }));
  }
  return parts.join(" ");
}
