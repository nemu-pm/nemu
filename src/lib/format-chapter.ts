import type { Chapter } from "@/lib/sources";
import type { ChapterSummary } from "@/data/schema";
import i18n from "@/lib/i18n";

export type ChapterTitleDisplayMode = "default" | "chapter" | "volume";

/** Max length for truncated chapter titles in short format */
const SHORT_TITLE_MAX_LENGTH = 18;

/**
 * Format a chapter/volume number, handling f32 precision issues.
 * Rounds to 2 decimal places and strips trailing zeros.
 * e.g., 123.19999694824219 → "123.2", 5.0 → "5"
 */
function formatNumber(n: number): string {
  // Round to 2 decimal places to fix f32 precision
  const rounded = Math.round(n * 100) / 100;
  // Convert to string, removing unnecessary trailing zeros
  return rounded.toString();
}

/**
 * Format chapter title matching Aidoku's formattedTitle() logic.
 *
 * Default mode:
 * - Only chapter number → "Chapter X"
 * - Only volume number → "Volume X"
 * - Vol + Ch → "Vol.X Ch.X"
 * - No numbers → "UNTITLED"
 * Note: Title text is moved to subtitle in default mode.
 */
export function formatChapterTitle(
  chapter: Chapter,
  mode: ChapterTitleDisplayMode = "default"
): string {
  const t = i18n.t.bind(i18n);
  const { volumeNumber, chapterNumber, title } = chapter;
  
  // Format numbers with f32 precision fix
  const volNum = volumeNumber != null ? formatNumber(volumeNumber) : null;
  const chNum = chapterNumber != null ? formatNumber(chapterNumber) : null;

  if (mode === "default") {
    // No numbers: show title text in title
    if (volNum == null && chNum == null) {
      return title || t("chapter.untitled");
    }

    // Simple case: only chapter number, no volume
    if (volNum == null) {
      return t("chapter.chapterX", { n: chNum! });
    }

    // Only volume number
    if (volNum != null && chNum == null) {
      return t("chapter.volumeX", { n: volNum });
    }

    // Combination: build "Vol.X Ch.X" (no title text in default mode)
    const components: string[] = [];
    if (volNum != null) {
      components.push(t("chapter.volX", { n: volNum }));
    }
    if (chNum != null) {
      components.push(t("chapter.chX", { n: chNum }));
    }
    return components.join(" ");
  }

  // Forced mode
  const components: string[] = [];
  if (mode === "chapter") {
    const num = chNum ?? volNum;
    if (num != null) {
      components.push(t("chapter.chapterX", { n: num }));
    }
  } else {
    // volume mode
    const num = volNum ?? chNum;
    if (num != null) {
      components.push(t("chapter.volumeX", { n: num }));
    }
  }
  if (title) {
    if (components.length > 0) {
      components.push("-");
    }
    components.push(title);
  }
  return components.join(" ") || t("chapter.untitled");
}

/**
 * Format chapter subtitle.
 * In default mode: returns title text if available and there are numbers, otherwise null.
 * 
 * When there are no numbers, title text goes to the title instead, so subtitle is null.
 */
export function formatChapterSubtitle(chapter: Chapter): string | null {
  // If no numbers, title text goes to title, so subtitle is null
  if (chapter.volumeNumber == null && chapter.chapterNumber == null) {
    return null;
  }
  // Return title text as subtitle (or null if no title)
  return chapter.title || null;
}

/**
 * Truncate a string with ellipsis if it exceeds max length.
 */
function truncateWithEllipsis(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 1).trimEnd() + "…";
}

/**
 * Format chapter in short form for compact display (e.g., library cards).
 * - "Ch.24" (chapter only)
 * - "Vol.3 Ch.12" (volume + chapter)
 * - "Epilogue" or "Epilo…" (title only, truncated if needed)
 */
export function formatChapterShort(
  chapter: ChapterSummary | Chapter
): string {
  const t = i18n.t.bind(i18n);
  const { volumeNumber, chapterNumber, title } = chapter;

  const volNum = volumeNumber != null ? formatNumber(volumeNumber) : null;
  const chNum = chapterNumber != null ? formatNumber(chapterNumber) : null;

  // No numbers: show title (truncated)
  if (volNum == null && chNum == null) {
    if (title) {
      return truncateWithEllipsis(title, SHORT_TITLE_MAX_LENGTH);
    }
    return t("chapter.untitled");
  }

  // Build "Vol.X Ch.X" or just "Ch.X"
  const components: string[] = [];
  if (volNum != null) {
    components.push(t("chapter.volX", { n: volNum }));
  }
  if (chNum != null) {
    components.push(t("chapter.chX", { n: chNum }));
  }
  return components.join(" ");
}

/**
 * Format a relative date string matching Aidoku's makeRelativeDate() logic.
 */
function formatRelativeDate(
  timestamp: number,
  t: typeof i18n.t
): string {
  const date = new Date(timestamp);
  const now = new Date();

  // End of today
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  const isInFuture = date > endOfDay;

  // Reference point for comparison
  const refDate = isInFuture
    ? new Date(now.setHours(0, 0, 0, 0)) // start of today
    : endOfDay;

  const diffMs = Math.abs(refDate.getTime() - date.getTime());
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);

  if (isInFuture) {
    if (diffDays === 0) return t("chapter.relativeDate.today");
    if (diffDays === 1) return t("chapter.relativeDate.tomorrow");
    if (diffDays < 7) return t("chapter.relativeDate.inDays", { count: diffDays });
    if (diffWeeks < 4) return t("chapter.relativeDate.inWeeks", { count: diffWeeks });
    if (diffMonths < 12) return t("chapter.relativeDate.inMonths", { count: diffMonths });
    return t("chapter.relativeDate.inYears", { count: diffYears });
  } else {
    if (diffDays === 0) return t("chapter.relativeDate.today");
    if (diffDays === 1) return t("chapter.relativeDate.yesterday");
    if (diffDays < 7) return t("chapter.relativeDate.daysAgo", { count: diffDays });
    if (diffWeeks < 4) return t("chapter.relativeDate.weeksAgo", { count: diffWeeks });
    if (diffMonths < 12) return t("chapter.relativeDate.monthsAgo", { count: diffMonths });
    return t("chapter.relativeDate.yearsAgo", { count: diffYears });
  }
}

