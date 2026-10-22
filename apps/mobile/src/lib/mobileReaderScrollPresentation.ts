import {
  isMobileReaderStripChapter,
  READER_STRIP_PAGE_ASPECT,
  type MobileReaderPageSize,
} from "@/lib/mobileReaderPairing";

/**
 * Scroll (continuous vertical) reading presentation.
 */

/**
 * What a page shows until its image decodes — a quiet dark plate (no
 * spinner, no text), so a fling past unloaded pages never reads as a run of
 * black screens or status cards.
 */
export const MOBILE_READER_SCROLL_PLACEHOLDER_COLOR = "#1C1C1E";
/** The first display of a page that waited on the network fades this long. */
export const MOBILE_READER_SCROLL_IMAGE_FADE_MS = 150;

/** Space between two ordinary manga pages in the vertical list. */
export const MOBILE_READER_SCROLL_PAGE_SPACING = 8;
/** Side margin of the vertical list below a 100% page width. */
export const MOBILE_READER_SCROLL_SIDE_MARGIN = 10;

/**
 * Space above each page of the vertical list (index 0 has none). Webtoon
 * strips are one picture cut into slices, so they meet edge to edge: no
 * space anywhere in a strip chapter (most pages narrower than w/h 0.5), nor
 * next to a single strip slice in an otherwise ordinary chapter.
 */
export function mobileReaderScrollPageGaps(
  pageCount: number,
  sizeAt: (index: number) => MobileReaderPageSize | null | undefined,
): number[] {
  if (!Number.isFinite(pageCount) || pageCount <= 0) return [];
  const stripChapter = isMobileReaderStripChapter(pageCount, sizeAt);
  const stripSlice = (index: number) => {
    const size = sizeAt(index);
    return Boolean(
      size &&
        Number.isFinite(size.width) &&
        Number.isFinite(size.height) &&
        size.width > 0 &&
        size.height > 0 &&
        size.width / size.height < READER_STRIP_PAGE_ASPECT,
    );
  };
  const gaps: number[] = [];
  for (let index = 0; index < pageCount; index += 1) {
    gaps.push(
      index === 0 || stripChapter || stripSlice(index - 1) || stripSlice(index)
        ? 0
        : MOBILE_READER_SCROLL_PAGE_SPACING,
    );
  }
  return gaps;
}

/** A 100% page width runs edge to edge; narrower pages keep a margin. */
export function mobileReaderScrollSideMargin(scrollWidthPct: number): number {
  return scrollWidthPct >= 100 ? 0 : MOBILE_READER_SCROLL_SIDE_MARGIN;
}
