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
 * Aidoku's per-manga `viewer` (the source's own reading format):
 * 0 default/unknown, 1 right-to-left, 2 left-to-right, 3 vertical, 4 webtoon.
 */
export type MobileReaderSourceViewer = 0 | 1 | 2 | 3 | 4;
export const MOBILE_READER_SOURCE_VIEWER_WEBTOON = 4;

/**
 * Up to this median aspect, same-width slices cut at varying heights read as
 * a strip. The aspect alone decides nothing between 1:2 and here: a uniform
 * webtoon slice (WEBTOON 800×1280 ≈ 0.625) and a printed page served at one
 * size (少年ジャンプ＋ 764×1200 ≈ 0.637, US comics 0.65) look alike — the cut
 * heights are what differ.
 */
export const MOBILE_READER_SCROLL_VARIED_STRIP_ASPECT = 0.68;
/** At least this share of the known pages must share one pixel width (±1px). */
export const MOBILE_READER_SCROLL_SAME_WIDTH_SHARE = 0.75;
/** A height this far (relative) from the median counts as a different height. */
export const MOBILE_READER_SCROLL_HEIGHT_TOLERANCE = 0.03;
/** This share of the same-width pages (and at least two) must differ in height. */
export const MOBILE_READER_SCROLL_VARIED_HEIGHT_SHARE = 0.25;

function knownSize(size: MobileReaderPageSize | null | undefined): MobileReaderPageSize | null {
  if (
    !size ||
    !Number.isFinite(size.width) ||
    !Number.isFinite(size.height) ||
    size.width <= 0 ||
    size.height <= 0
  ) {
    return null;
  }
  return size;
}

function median(sorted: number[]): number {
  return sorted[Math.floor(sorted.length / 2)]!;
}

/**
 * Whether the scroll view should run a chapter's pages edge to edge (the gap
 * decision only; paged mode keeps `isMobileReaderStripChapter`).
 *
 * The source says first: Aidoku's `viewer` 4 (webtoon) is a strip, 1/2/3 (a
 * paged or vertical manga) is not. Only without it do the pages decide:
 * a median narrower than 1:2, or slicing — nearly every page has the same
 * pixel width and the slices are cut at varying heights (manga pages of one
 * width keep one height).
 */
export function isMobileReaderScrollStripChapter(
  pageCount: number,
  sizeAt: (index: number) => MobileReaderPageSize | null | undefined,
  viewer?: number | null,
): boolean {
  if (viewer === MOBILE_READER_SOURCE_VIEWER_WEBTOON) return true;
  if (viewer === 1 || viewer === 2 || viewer === 3) return false;
  if (!Number.isFinite(pageCount) || pageCount <= 0) return false;
  if (isMobileReaderStripChapter(pageCount, sizeAt)) return true;
  const sizes: MobileReaderPageSize[] = [];
  for (let index = 0; index < pageCount; index += 1) {
    const size = knownSize(sizeAt(index));
    if (size) sizes.push(size);
  }
  if (sizes.length < 3) return false;

  // The most common width, ±1px (rounding of decoded sizes).
  const widths = sizes.map((size) => size.width).sort((a, b) => a - b);
  let bestWidth = widths[0]!;
  let bestCount = 0;
  let lo = 0;
  for (let hi = 0; hi < widths.length; hi += 1) {
    while (widths[hi]! - widths[lo]! > 2) lo += 1;
    if (hi - lo + 1 > bestCount) {
      bestCount = hi - lo + 1;
      bestWidth = (widths[lo]! + widths[hi]!) / 2;
    }
  }
  if (bestCount < 3 || bestCount < sizes.length * MOBILE_READER_SCROLL_SAME_WIDTH_SHARE) {
    return false;
  }
  const slices = sizes.filter((size) => Math.abs(size.width - bestWidth) <= 1);
  const aspect = median(slices.map((size) => size.width / size.height).sort((a, b) => a - b));
  if (aspect < READER_STRIP_PAGE_ASPECT) return true;
  if (aspect >= MOBILE_READER_SCROLL_VARIED_STRIP_ASPECT) return false;
  const height = median(slices.map((size) => size.height).sort((a, b) => a - b));
  const varied = slices.filter(
    (size) => Math.abs(size.height - height) > height * MOBILE_READER_SCROLL_HEIGHT_TOLERANCE,
  ).length;
  return varied >= 2 && varied >= slices.length * MOBILE_READER_SCROLL_VARIED_HEIGHT_SHARE;
}

/**
 * Space above each page of the vertical list (index 0 has none). Webtoon
 * strips are one picture cut into slices, so they meet edge to edge: no
 * space anywhere in a strip chapter (`isMobileReaderScrollStripChapter`),
 * nor next to a single strip slice in an otherwise ordinary chapter.
 */
export function mobileReaderScrollPageGaps(
  pageCount: number,
  sizeAt: (index: number) => MobileReaderPageSize | null | undefined,
  viewer?: number | null,
): number[] {
  if (!Number.isFinite(pageCount) || pageCount <= 0) return [];
  const stripChapter = isMobileReaderScrollStripChapter(pageCount, sizeAt, viewer);
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

/** Book posture: side margin of an ordinary manga strip in its half. */
export const MOBILE_READER_BOOK_SCROLL_SIDE_MARGIN = 8;

/**
 * Book posture, scroll reading: the strip fills its half, less 8pt either
 * side for ordinary manga and nothing for a webtoon strip
 * (`isMobileReaderScrollStripChapter`). A page width below 100% narrows the
 * pages inside that, centred; the margin stays.
 */
export function mobileReaderBookScrollStrip(input: {
  paneWidth: number;
  stripChapter: boolean;
  /** `readerScrollWidthScale` (1 at 100%). */
  widthScale: number;
}): { sideMargin: number; imageWidth: number } {
  const sideMargin = input.stripChapter ? 0 : MOBILE_READER_BOOK_SCROLL_SIDE_MARGIN;
  const pane = Number.isFinite(input.paneWidth) ? Math.max(0, input.paneWidth) : 0;
  const scale =
    Number.isFinite(input.widthScale) && input.widthScale > 0 ? Math.min(1, input.widthScale) : 1;
  return { sideMargin, imageWidth: Math.max(1, (pane - sideMargin * 2) * scale) };
}
