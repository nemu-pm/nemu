/**
 * Book posture (iPhone Duo half folded, vertical crease), scroll reading: the
 * half beside the strip follows the Laptop Mode setting.
 *
 * - Thumbnails (`filmstrip`): one column of the chapter's pages, the current
 *   page outlined and kept in view.
 * - Page Controls (`trackpad`): two buttons that move the strip one screen.
 *
 * Pure geometry only; `ReaderBookSidePane.tsx` draws it and the pose layout
 * (`mobileReaderBookSidePaneLayout`) places it.
 */

/** Space between thumbnails, and above the first / below the last. */
export const READER_BOOK_THUMBNAIL_GAP = 8;
export const READER_BOOK_THUMBNAIL_RADIUS = 6;
/** The current page's outline, in the primary colour. */
export const READER_BOOK_THUMBNAIL_CURRENT_STROKE = 2;
export const READER_BOOK_THUMBNAIL_CURRENT_COLOR = "#5B6CEB";
/** Following the current page pauses while the list is dragged and resumes this long after. */
export const READER_BOOK_THUMBNAIL_FOLLOW_RESUME_MS = 1_500;
/**
 * Tallest thumbnail, as height / width. A long webtoon slice would otherwise
 * repeat the strip beside it at the same size; taller pages are cropped to
 * this box instead of shrunk into it.
 */
export const READER_BOOK_THUMBNAIL_MAX_RATIO = 1.5;
/** Flattest thumbnail (a spread or a short slice), as height / width. */
export const READER_BOOK_THUMBNAIL_MIN_RATIO = 0.25;

export type MobileReaderBookThumbnailLayout = {
  /** Thumbnail heights, in page order. */
  heights: number[];
  /** Offset of each thumbnail's top inside the list content (gap above included). */
  offsets: number[];
  /** Thumbnails cropped to the tallest box (shown "cover" rather than "contain"). */
  cropped: boolean[];
  contentHeight: number;
};

function clampRatio(ratio: number): { ratio: number; cropped: boolean } {
  if (!Number.isFinite(ratio) || ratio <= 0) return { ratio: 1.42, cropped: false };
  if (ratio > READER_BOOK_THUMBNAIL_MAX_RATIO) return { ratio: READER_BOOK_THUMBNAIL_MAX_RATIO, cropped: true };
  return { ratio: Math.max(READER_BOOK_THUMBNAIL_MIN_RATIO, ratio), cropped: false };
}

/**
 * The column's geometry from each page's height / width ratio
 * (`mobileReaderScrollPageRatios`: the decoded or reported size, else the
 * chapter's typical page), every thumbnail `width` wide.
 */
export function mobileReaderBookThumbnailLayout(
  ratios: readonly number[],
  width: number,
): MobileReaderBookThumbnailLayout {
  const safeWidth = Number.isFinite(width) ? Math.max(0, width) : 0;
  const heights: number[] = [];
  const offsets: number[] = [];
  const cropped: boolean[] = [];
  let y = 0;
  for (const raw of ratios) {
    const { ratio, cropped: crop } = clampRatio(raw);
    const height = Math.round(safeWidth * ratio);
    y += READER_BOOK_THUMBNAIL_GAP;
    offsets.push(y);
    heights.push(height);
    cropped.push(crop);
    y += height;
  }
  return { heights, offsets, cropped, contentHeight: y + READER_BOOK_THUMBNAIL_GAP };
}

/**
 * List offset that keeps page `index` in view: centred in the viewport when
 * it fits, its top at the top otherwise, clamped to the list's range.
 */
export function mobileReaderBookThumbnailFollowOffset(
  layout: MobileReaderBookThumbnailLayout,
  index: number,
  viewportHeight: number,
): number {
  const count = layout.heights.length;
  if (count === 0 || !(viewportHeight > 0) || !Number.isFinite(index)) return 0;
  const clamped = Math.max(0, Math.min(count - 1, Math.floor(index)));
  const top = layout.offsets[clamped]!;
  const height = layout.heights[clamped]!;
  const wanted = height + READER_BOOK_THUMBNAIL_GAP * 2 <= viewportHeight
    ? top + height / 2 - viewportHeight / 2
    : top - READER_BOOK_THUMBNAIL_GAP;
  const max = Math.max(0, layout.contentHeight - viewportHeight);
  return Math.max(0, Math.min(max, Math.round(wanted)));
}
