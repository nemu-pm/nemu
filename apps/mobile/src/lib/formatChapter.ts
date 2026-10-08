import type { ChapterSummary } from "@/data/schema";
import { getMobileDesignExploreActive } from "./mobileDesignExploreSwitch";
import { formatMobileString, type MobileStrings } from "./mobileI18n";

const SHORT_TITLE_MAX_LENGTH = 18;

// The design-explore switch as this run started (`mobileDesignExploreFlag`),
// read through the pure switch module so this one stays free of react-native.
function designExploreLabels(): boolean {
  return getMobileDesignExploreActive();
}

/**
 * The volume a label shows. Design-explore: a volume 0 beside a chapter
 * number is a source's placeholder (some sources number every chapter not yet
 * in a book volume 0), not a volume: "Ch.1", not "Vol.0 Ch.1" — the rule the
 * chapter list's volume headers already follow.
 */
export function getShownChapterVolume(
  chapter: Pick<ChapterSummary, "volumeNumber" | "chapterNumber">,
  placeholderZero = designExploreLabels(),
): number | null {
  const volume = chapter.volumeNumber;
  if (volume == null) return null;
  if (placeholderZero && volume === 0 && chapter.chapterNumber != null) return null;
  return volume;
}

function formatNumber(value: number): string {
  return (Math.round(value * 100) / 100).toString();
}

export function formatChapterTitle(
  chapter: ChapterSummary,
  strings: MobileStrings,
): string {
  const shownVolume = getShownChapterVolume(chapter);
  const volumeNumber = shownVolume != null ? formatNumber(shownVolume) : null;
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
  const shownVolume = getShownChapterVolume(chapter);
  const volumeNumber = shownVolume != null ? formatNumber(shownVolume) : null;
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

function hasChapterLabel(chapter: ChapterSummary): boolean {
  return (
    chapter.volumeNumber != null ||
    chapter.chapterNumber != null ||
    Boolean(chapter.title?.trim())
  );
}

/**
 * {@link formatChapterTitle}, or null when the chapter carries neither a
 * number nor a title (a progress record, or a route opened before the
 * chapter list loaded). Callers drop the chapter part — "Continue", the
 * bare page count — rather than print "Untitled" for a chapter that has one.
 */
export function formatChapterLabel(
  chapter: ChapterSummary,
  strings: MobileStrings,
): string | null {
  return hasChapterLabel(chapter) ? formatChapterTitle(chapter, strings) : null;
}

/** {@link formatChapterShort}, or null when there is nothing to show. */
export function formatChapterShortLabel(
  chapter: ChapterSummary,
  strings: MobileStrings,
): string | null {
  return hasChapterLabel(chapter) ? formatChapterShort(chapter, strings) : null;
}

/**
 * The primary reading action: "Continue Ch.12", plain "Continue" when the
 * chapter being resumed has no label yet, or "Start reading".
 */
export function formatContinueActionLabel({
  chapter,
  isContinuation,
  strings,
  labels,
}: {
  chapter: ChapterSummary;
  isContinuation: boolean;
  strings: MobileStrings;
  labels: {
    continueChapter: string;
    continueReading: string;
    startReading: string;
  };
}): string {
  if (!isContinuation) return labels.startReading;
  const label = formatChapterLabel(chapter, strings);
  return label
    ? formatMobileString(labels.continueChapter, { chapter: label })
    : labels.continueReading;
}
