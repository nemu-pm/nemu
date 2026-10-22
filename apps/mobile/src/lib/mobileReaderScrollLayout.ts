/**
 * Scroll (continuous vertical) reading: one deterministic layout for every
 * page cell, placeholder or loaded. The list's `getItemLayout`, the cells'
 * own heights and every seek (restore, scrub, relayout) read the same
 * numbers, so a page index always maps to the same offset and back.
 *
 * Offsets here are scroll offsets of the vertical list: a page's "top" is the
 * offset at which its picture sits right below the list's top padding (the
 * chrome inset), i.e. the content offset that shows it first under the
 * chrome. Page 0 at fraction 0 is offset 0 — the very top of the chapter.
 */

export type MobileReaderScrollPageSize = { width: number; height: number };

/** Height / width of a page whose size is not known by any means yet. */
export const MOBILE_READER_SCROLL_DEFAULT_PAGE_RATIO = 1.45;

export type MobileReaderScrollLayout = {
  /** Picture height of each page (display order). */
  readonly heights: readonly number[];
  /** Space above each page (display order); index 0 is normally 0. */
  readonly gaps: readonly number[];
  /** Where each cell (its gap included) starts, from the content start. */
  readonly starts: readonly number[];
  /** Total length of all cells (no list padding). */
  readonly length: number;
};

export type MobileReaderScrollPageAnchor = {
  pageIndex: number;
  /** 0 = the page's top at the reading line, 1 = its bottom. */
  fraction: number;
};

function ratioOf(size: MobileReaderScrollPageSize | null | undefined): number | null {
  if (!size) return null;
  const { width, height } = size;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  return height / width;
}

/**
 * Height / width per page: its own known size, else the median of the
 * chapter's known pages (a chapter's pages are nearly always one format),
 * else 1:1.45.
 */
export function mobileReaderScrollPageRatios(
  pageCount: number,
  sizeAt: (index: number) => MobileReaderScrollPageSize | null | undefined,
): number[] {
  if (!Number.isFinite(pageCount) || pageCount <= 0) return [];
  const known: (number | null)[] = [];
  const sorted: number[] = [];
  for (let index = 0; index < pageCount; index += 1) {
    const ratio = ratioOf(sizeAt(index));
    known.push(ratio);
    if (ratio != null) sorted.push(ratio);
  }
  sorted.sort((a, b) => a - b);
  const fallback =
    sorted.length === 0
      ? MOBILE_READER_SCROLL_DEFAULT_PAGE_RATIO
      : sorted.length % 2 === 1
        ? sorted[(sorted.length - 1) / 2]!
        : (sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2;
  return known.map((ratio) => ratio ?? fallback);
}

export function buildMobileReaderScrollLayout(
  heights: readonly number[],
  gaps: readonly (number | null | undefined)[] | null | undefined,
  defaultGap = 0,
): MobileReaderScrollLayout {
  const safeHeights = heights.map((height) =>
    Number.isFinite(height) && height > 0 ? height : 0,
  );
  const safeGaps = safeHeights.map((_, index) => {
    const gap = gaps?.[index];
    if (gap != null && Number.isFinite(gap) && gap >= 0) return gap;
    return index === 0 ? 0 : defaultGap;
  });
  const starts: number[] = [];
  let offset = 0;
  for (let index = 0; index < safeHeights.length; index += 1) {
    starts.push(offset);
    offset += safeGaps[index]! + safeHeights[index]!;
  }
  return { heights: safeHeights, gaps: safeGaps, starts, length: offset };
}

/**
 * FlatList `getItemLayout` entry. Cell frames are measured from the content
 * container's origin, so the list's top padding is part of every offset.
 */
export function mobileReaderScrollItemLayout(
  layout: MobileReaderScrollLayout,
  index: number,
  topPadding: number,
): { index: number; offset: number; length: number } {
  const count = layout.heights.length;
  if (count === 0) return { index, offset: Math.max(0, topPadding), length: 0 };
  const clamped = Math.max(0, Math.min(count - 1, Math.floor(index)));
  return {
    index,
    offset: Math.max(0, topPadding) + layout.starts[clamped]!,
    length: layout.gaps[clamped]! + layout.heights[clamped]!,
  };
}

/** Scroll offset that puts `fraction` of page `pageIndex` at the reading line. */
export function mobileReaderScrollOffsetForAnchor(
  layout: MobileReaderScrollLayout,
  pageIndex: number,
  fraction = 0,
): number {
  const count = layout.heights.length;
  if (count === 0 || !Number.isFinite(pageIndex)) return 0;
  const index = Math.max(0, Math.min(count - 1, Math.floor(pageIndex)));
  const safeFraction = Number.isFinite(fraction) ? Math.max(0, Math.min(1, fraction)) : 0;
  return Math.max(
    0,
    layout.starts[index]! + layout.gaps[index]! + safeFraction * layout.heights[index]!,
  );
}

/** The page (and how far into it) at the reading line of a scroll offset. */
export function mobileReaderScrollAnchorForOffset(
  layout: MobileReaderScrollLayout,
  offset: number,
): MobileReaderScrollPageAnchor | null {
  const count = layout.heights.length;
  if (count === 0) return null;
  const y = Number.isFinite(offset) ? Math.max(0, offset) : 0;
  // Last page whose picture top is at or above the reading line.
  let low = 0;
  let high = count - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (layout.starts[mid]! + layout.gaps[mid]! <= y) low = mid;
    else high = mid - 1;
  }
  const top = layout.starts[low]! + layout.gaps[low]!;
  const height = layout.heights[low]!;
  const fraction = height > 0 ? Math.max(0, Math.min(1, (y - top) / height)) : 0;
  return { pageIndex: low, fraction };
}

/**
 * A non-animated seek has landed once the list rests at its target (or at the
 * end of the content when the target lies past the last scrollable offset).
 */
export function isMobileReaderScrollSeekLanded(input: {
  currentOffset: number;
  targetOffset: number;
  /** Last scrollable offset; 0 or less while unknown. */
  maximumOffset: number;
  tolerance?: number;
}): boolean {
  const tolerance = input.tolerance ?? 2;
  if (!Number.isFinite(input.currentOffset) || !Number.isFinite(input.targetOffset)) {
    return false;
  }
  const reachable =
    Number.isFinite(input.maximumOffset) && input.maximumOffset > 0
      ? Math.min(input.targetOffset, input.maximumOffset)
      : input.targetOffset;
  return Math.abs(input.currentOffset - Math.max(0, reachable)) <= tolerance;
}

/**
 * `scrollToIndex` without a layout (cells measured as they mount): the
 * `viewOffset` that puts the page's picture right below the top padding
 * instead of its cell top at the very top of the viewport (under the chrome).
 */
export function mobileReaderScrollIndexViewOffset(topPadding: number, gapBefore: number): number {
  const padding = Number.isFinite(topPadding) ? Math.max(0, topPadding) : 0;
  const gap = Number.isFinite(gapBefore) ? Math.max(0, gapBefore) : 0;
  return padding - gap;
}

/**
 * Natural image sizes outlive the reader screen (reopening a chapter knows
 * its page heights before any image decodes). Keyed by the logical page
 * identity (chapter + page + image URL). In memory only; bounded.
 */
const NATURAL_SIZE_CACHE_LIMIT = 4000;
const naturalSizeCache = new Map<string, MobileReaderScrollPageSize>();

export function rememberMobileReaderPageNaturalSize(
  identity: string,
  size: MobileReaderScrollPageSize,
): void {
  if (!identity || ratioOf(size) == null) return;
  const existing = naturalSizeCache.get(identity);
  if (existing) naturalSizeCache.delete(identity);
  naturalSizeCache.set(identity, { width: size.width, height: size.height });
  while (naturalSizeCache.size > NATURAL_SIZE_CACHE_LIMIT) {
    const oldest = naturalSizeCache.keys().next().value;
    if (oldest === undefined) break;
    naturalSizeCache.delete(oldest);
  }
}

export function recallMobileReaderPageNaturalSize(
  identity: string,
): MobileReaderScrollPageSize | undefined {
  return identity ? naturalSizeCache.get(identity) : undefined;
}

/** Test hook. */
export function clearMobileReaderPageNaturalSizes(): void {
  naturalSizeCache.clear();
}
