/**
 * Book posture (iPhone Duo half folded, vertical crease), scroll reading: the
 * half beside the strip follows the Laptop Mode setting.
 *
 * - Thumbnails (`filmstrip`): one column of the chapter's pages (one row in
 *   the laptop posture's bottom half), the current page outlined and kept in
 *   view.
 * - Page Controls (`trackpad`): two buttons that move the strip one screen
 *   (stacked, or side by side in the laptop posture).
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
/**
 * Following the current page pauses while the list is dragged and resumes
 * (the list snaps back to the current page) this long after the list comes
 * to rest — from when it visibly stops, not from the native momentum-end
 * event (`mobileReaderBookThumbnailResumeDelay`).
 */
export const READER_BOOK_THUMBNAIL_FOLLOW_RESUME_MS = 1_500;
/** The snap back to the current page (and every animated follow) takes this long. */
export const READER_BOOK_THUMBNAIL_SNAP_MS = 280;
/**
 * A fling reads as stopped below this speed (pt/ms, i.e. 12pt/s): the long
 * sub-point tail UIKit decelerates through before it reports the momentum
 * end is invisible, and timing the snap from that report made it late.
 */
export const READER_BOOK_THUMBNAIL_REST_SPEED = 0.012;
/** Speed is measured over at least this window (offsets arrive pixel-rounded). */
export const READER_BOOK_THUMBNAIL_REST_WINDOW_MS = 80;
/** No scroll event for this long during a fling: it stopped at the last one. */
export const READER_BOOK_THUMBNAIL_REST_QUIET_MS = 100;

export type MobileReaderBookThumbnailScrollSample = { offset: number; time: number };

/**
 * Whether a fling has come to rest at the newest sample: its speed over the
 * last {@link READER_BOOK_THUMBNAIL_REST_WINDOW_MS} (or more) is below
 * {@link READER_BOOK_THUMBNAIL_REST_SPEED}. Samples are oldest first; false
 * until they span the window.
 */
export function mobileReaderBookThumbnailAtRest(
  samples: readonly MobileReaderBookThumbnailScrollSample[],
): boolean {
  const latest = samples[samples.length - 1];
  if (!latest) return false;
  for (let index = samples.length - 2; index >= 0; index -= 1) {
    const sample = samples[index]!;
    const elapsed = latest.time - sample.time;
    if (elapsed < READER_BOOK_THUMBNAIL_REST_WINDOW_MS) continue;
    return Math.abs(latest.offset - sample.offset) / elapsed < READER_BOOK_THUMBNAIL_REST_SPEED;
  }
  return false;
}

/** How long to wait before snapping back, the list having come to rest at `restAt`. */
export function mobileReaderBookThumbnailResumeDelay(restAt: number, now: number): number {
  if (!Number.isFinite(restAt) || !Number.isFinite(now)) return READER_BOOK_THUMBNAIL_FOLLOW_RESUME_MS;
  return Math.max(0, Math.min(READER_BOOK_THUMBNAIL_FOLLOW_RESUME_MS, READER_BOOK_THUMBNAIL_FOLLOW_RESUME_MS - (now - restAt)));
}

/**
 * The list offset `elapsed` ms into a snap from `from` to `to`
 * ({@link READER_BOOK_THUMBNAIL_SNAP_MS}, ease-out cubic: it moves at once).
 */
export function mobileReaderBookThumbnailSnapOffset(from: number, to: number, elapsed: number): number {
  if (!(elapsed > 0)) return from;
  if (elapsed >= READER_BOOK_THUMBNAIL_SNAP_MS) return to;
  const t = elapsed / READER_BOOK_THUMBNAIL_SNAP_MS;
  return from + (to - from) * (1 - (1 - t) ** 3);
}
/**
 * Tallest thumbnail, as height / width. A long webtoon slice would otherwise
 * repeat the strip beside it at the same size; taller pages are cropped to
 * this box instead of shrunk into it.
 */
export const READER_BOOK_THUMBNAIL_MAX_RATIO = 1.5;
/** Flattest thumbnail (a spread or a short slice), as height / width. */
export const READER_BOOK_THUMBNAIL_MIN_RATIO = 0.25;

/**
 * A page of unknown size is drawn as a printed manga page: width / height
 * 0.7, stored here as height / width.
 */
export const READER_BOOK_THUMBNAIL_UNKNOWN_RATIO = 1 / 0.7;

/**
 * Each thumbnail's height / width: the page's own size where known, else
 * {@link READER_BOOK_THUMBNAIL_UNKNOWN_RATIO}. (Unlike the strip, an
 * unknown page does not borrow the chapter's typical shape.)
 */
export function mobileReaderBookThumbnailRatios(
  pageCount: number,
  sizeAt: (index: number) => { width: number; height: number } | null | undefined,
): number[] {
  if (!Number.isFinite(pageCount) || pageCount <= 0) return [];
  return Array.from({ length: Math.floor(pageCount) }, (_, index) => {
    const size = sizeAt(index);
    if (!size) return READER_BOOK_THUMBNAIL_UNKNOWN_RATIO;
    const { width, height } = size;
    return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
      ? height / width
      : READER_BOOK_THUMBNAIL_UNKNOWN_RATIO;
  });
}

export type MobileReaderBookThumbnailOrientation = "vertical" | "horizontal";

/**
 * The laptop posture's row starts and ends 16pt in from the half's edges, like
 * the column's thumbnails sit 16pt in from its sides: the list content keeps
 * this much before the first gap and after the last.
 */
export const READER_BOOK_THUMBNAIL_ROW_EDGE = 16 - READER_BOOK_THUMBNAIL_GAP;

export type MobileReaderBookThumbnailLayout = {
  orientation: MobileReaderBookThumbnailOrientation;
  /** Thumbnail extents along the list (heights in a column, widths in a row), in page order. */
  lengths: number[];
  /** Offset of each thumbnail's leading edge inside the list content (gap before it included). */
  offsets: number[];
  /** Thumbnails cropped to the tallest box (shown "cover" rather than "contain"). */
  cropped: boolean[];
  contentLength: number;
};

function clampRatio(ratio: number): { ratio: number; cropped: boolean } {
  if (!Number.isFinite(ratio) || ratio <= 0) return { ratio: READER_BOOK_THUMBNAIL_UNKNOWN_RATIO, cropped: false };
  if (ratio > READER_BOOK_THUMBNAIL_MAX_RATIO) return { ratio: READER_BOOK_THUMBNAIL_MAX_RATIO, cropped: true };
  return { ratio: Math.max(READER_BOOK_THUMBNAIL_MIN_RATIO, ratio), cropped: false };
}

/**
 * The list's geometry from each page's height / width ratio
 * (`mobileReaderBookThumbnailRatios`). `size` is the thumbnails' size across
 * the list: every thumbnail `size` wide in a column (the book posture), `size`
 * tall in a row (the laptop posture).
 */
export function mobileReaderBookThumbnailLayout(
  ratios: readonly number[],
  size: number,
  orientation: MobileReaderBookThumbnailOrientation = "vertical",
): MobileReaderBookThumbnailLayout {
  const safeSize = Number.isFinite(size) ? Math.max(0, size) : 0;
  const edge = orientation === "horizontal" ? READER_BOOK_THUMBNAIL_ROW_EDGE : 0;
  const lengths: number[] = [];
  const offsets: number[] = [];
  const cropped: boolean[] = [];
  let y = edge;
  for (const raw of ratios) {
    const { ratio, cropped: crop } = clampRatio(raw);
    const length = Math.round(orientation === "horizontal" ? safeSize / ratio : safeSize * ratio);
    y += READER_BOOK_THUMBNAIL_GAP;
    offsets.push(y);
    lengths.push(length);
    cropped.push(crop);
    y += length;
  }
  return { orientation, lengths, offsets, cropped, contentLength: y + READER_BOOK_THUMBNAIL_GAP + edge };
}

/**
 * List offset that keeps page `index` in view: centred in the viewport when
 * it fits, its leading edge at the start otherwise, clamped to the list's range.
 */
export function mobileReaderBookThumbnailFollowOffset(
  layout: MobileReaderBookThumbnailLayout,
  index: number,
  viewportLength: number,
): number {
  const count = layout.lengths.length;
  if (count === 0 || !(viewportLength > 0) || !Number.isFinite(index)) return 0;
  const clamped = Math.max(0, Math.min(count - 1, Math.floor(index)));
  const start = layout.offsets[clamped]!;
  const length = layout.lengths[clamped]!;
  const wanted = length + READER_BOOK_THUMBNAIL_GAP * 2 <= viewportLength
    ? start + length / 2 - viewportLength / 2
    : start - READER_BOOK_THUMBNAIL_GAP;
  const max = Math.max(0, layout.contentLength - viewportLength);
  return Math.max(0, Math.min(max, Math.round(wanted)));
}
