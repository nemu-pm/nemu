/**
 * How many display indexes on either side of the current page keep their
 * `<Image>` mounted. RN `Image` fetches and decodes on mount regardless of
 * visibility, so this bounds how many decoded bitmaps the reader holds even
 * though the gallery's FlatList already virtualizes its cells. Pages outside
 * the window render an equal-size placeholder — frame sizes are sticky once
 * learned (`readerImageSizes`), so swapping causes no layout shift.
 *
 * Radius 3 keeps seven pages decoded, which covers a fast run of swipes in
 * either direction while staying well under the ~100 MiB that radius 5 could
 * reach on Android LMK-class devices.
 */
export const MOBILE_READER_PAGE_RENDER_WINDOW = 3;

export function isMobileReaderPageNearViewport(
  displayIndex: number | undefined,
  currentPageIndex: number,
  windowRadius: number = MOBILE_READER_PAGE_RENDER_WINDOW,
): boolean {
  // Unknown display position (e.g. a page not in the displayed list) must
  // stay mounted — dropping its image would be an invisible regression.
  if (displayIndex === undefined || !Number.isFinite(displayIndex)) return true;
  return Math.abs(displayIndex - currentPageIndex) <= windowRadius;
}

/**
 * Scroll (continuous vertical) reading: the window is measured in screen
 * heights, not pages. A fixed page count ran out on a hard fling through
 * short webtoon slices (the strip outran six pages and showed bare plates),
 * while tall pages held far more picture than needed. So: the pages that
 * cover three viewport heights past the bottom of the screen in the scroll
 * direction, and one viewport height past its other edge, within page caps —
 * at least a couple of pages each way, and never more than ~two dozen ahead
 * (very short slices), which also bounds the decoded bitmaps held.
 */
export const MOBILE_READER_SCROLL_RENDER_AHEAD_VIEWPORTS = 3;
export const MOBILE_READER_SCROLL_RENDER_BEHIND_VIEWPORTS = 1;
export const MOBILE_READER_SCROLL_RENDER_MIN_AHEAD = 2;
export const MOBILE_READER_SCROLL_RENDER_MAX_AHEAD = 24;
export const MOBILE_READER_SCROLL_RENDER_MIN_BEHIND = 2;
export const MOBILE_READER_SCROLL_RENDER_MAX_BEHIND = 8;

/**
 * Mounting is hysteretic: a page mounts inside the render range above (with
 * two screens the other way, so turning round still has a lead) and stays
 * mounted until it leaves this wider one. Scrolling back a little therefore
 * finds its pages still decoded, instead of each one decoding again.
 */
export const MOBILE_READER_SCROLL_MOUNT_BEHIND_VIEWPORTS = 2;
export const MOBILE_READER_SCROLL_MOUNT_MIN_PAGES = 3;
export const MOBILE_READER_SCROLL_KEEP_AHEAD_VIEWPORTS = 6;
export const MOBILE_READER_SCROLL_KEEP_BEHIND_VIEWPORTS = 4;
export const MOBILE_READER_SCROLL_KEEP_MAX_BEHIND = 16;

export type MobileReaderScrollDirection = "forward" | "backward";

/** Forward is down the strip (increasing display index). */
export function nextMobileReaderScrollDirection(
  previousIndex: number,
  nextIndex: number,
  current: MobileReaderScrollDirection,
): MobileReaderScrollDirection {
  if (nextIndex > previousIndex) return "forward";
  if (nextIndex < previousIndex) return "backward";
  return current;
}

/** Inclusive display-index range. */
export type MobileReaderPageRange = { first: number; last: number };

/** The strip's geometry (see `MobileReaderScrollLayout`); content coordinates. */
export type MobileReaderScrollStripGeometry = {
  readonly heights: readonly number[];
  readonly gaps: readonly number[];
  readonly starts: readonly number[];
};

/**
 * The pages to keep near a scroll position, by distance.
 *
 * `viewportTop` is the content coordinate (the layout's, list padding
 * excluded: scroll offset minus the top padding) of the screen's top edge.
 * Unknown (`null`): the screen is taken as centred on the anchor page.
 * Without a layout every page is `estimatedPageHeight` tall (unknown sizes in
 * a layout are already the chapter's typical page). Page caps count from
 * `anchorIndex`, the page the reader is on.
 */
export function resolveMobileReaderScrollPageRange({
  pageCount,
  anchorIndex,
  direction,
  viewportTop,
  viewportHeight,
  layout,
  estimatedPageHeight,
  aheadViewports = MOBILE_READER_SCROLL_RENDER_AHEAD_VIEWPORTS,
  behindViewports = MOBILE_READER_SCROLL_RENDER_BEHIND_VIEWPORTS,
  minAhead = MOBILE_READER_SCROLL_RENDER_MIN_AHEAD,
  maxAhead = MOBILE_READER_SCROLL_RENDER_MAX_AHEAD,
  minBehind = MOBILE_READER_SCROLL_RENDER_MIN_BEHIND,
  maxBehind = MOBILE_READER_SCROLL_RENDER_MAX_BEHIND,
}: {
  pageCount: number;
  anchorIndex: number;
  direction: MobileReaderScrollDirection;
  viewportTop: number | null;
  viewportHeight: number;
  layout?: MobileReaderScrollStripGeometry | null;
  estimatedPageHeight: number;
  aheadViewports?: number;
  behindViewports?: number;
  minAhead?: number;
  maxAhead?: number;
  minBehind?: number;
  maxBehind?: number;
}): MobileReaderPageRange | null {
  if (!Number.isFinite(pageCount) || pageCount <= 0) return null;
  const count = Math.floor(pageCount);
  const anchor = Number.isFinite(anchorIndex)
    ? Math.max(0, Math.min(count - 1, Math.round(anchorIndex)))
    : 0;
  const geometry =
    layout && layout.heights.length === count ? layout : null;
  const fallbackHeight =
    Number.isFinite(estimatedPageHeight) && estimatedPageHeight > 0
      ? estimatedPageHeight
      : 1;
  const pageTop = (index: number) =>
    geometry ? geometry.starts[index]! + geometry.gaps[index]! : index * fallbackHeight;
  const pageBottom = (index: number) =>
    geometry ? pageTop(index) + geometry.heights[index]! : (index + 1) * fallbackHeight;
  const screen =
    Number.isFinite(viewportHeight) && viewportHeight > 0
      ? viewportHeight
      : fallbackHeight;
  const top =
    viewportTop != null && Number.isFinite(viewportTop)
      ? viewportTop
      : (pageTop(anchor) + pageBottom(anchor)) / 2 - screen / 2;
  const bottom = top + screen;
  const reachDown =
    bottom + screen * (direction === "forward" ? aheadViewports : behindViewports);
  const reachUp =
    top - screen * (direction === "forward" ? behindViewports : aheadViewports);
  // Last page starting above the lower reach; first page ending below the
  // upper one (pages are in content order, so both are binary searches).
  let low = 0;
  let high = count - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (pageTop(mid) < reachDown) low = mid;
    else high = mid - 1;
  }
  let last = low;
  low = 0;
  high = count - 1;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (pageBottom(mid) > reachUp) high = mid;
    else low = mid + 1;
  }
  let first = low;
  const [downMin, downMax, upMin, upMax] =
    direction === "forward"
      ? [minAhead, maxAhead, minBehind, maxBehind]
      : [minBehind, maxBehind, minAhead, maxAhead];
  last = Math.max(anchor + downMin, Math.min(anchor + downMax, last));
  first = Math.min(anchor - upMin, Math.max(anchor - upMax, first));
  return {
    first: Math.max(0, first),
    last: Math.min(count - 1, last),
  };
}

/**
 * Scroll reading: the order in which pages that must be resolved before they
 * can load (source request rewriting, descrambling) are worked on. The pages
 * on screen come first, nearest the reading page; then the screen a fling
 * comes to rest on; then the rest of `range` ahead in the scroll direction,
 * nearest first; then behind. No index appears twice.
 */
export function orderMobileReaderScrollProcessing({
  currentIndex,
  pageCount,
  range,
  visible,
  landing,
  direction,
}: {
  currentIndex: number;
  pageCount: number;
  range: MobileReaderPageRange | null;
  visible?: MobileReaderPageRange | null;
  landing?: MobileReaderPageRange | null;
  direction: MobileReaderScrollDirection;
}): number[] {
  if (!Number.isFinite(pageCount) || pageCount <= 0) return [];
  const count = Math.floor(pageCount);
  const current = Number.isFinite(currentIndex)
    ? Math.max(0, Math.min(count - 1, Math.round(currentIndex)))
    : 0;
  const order: number[] = [];
  const seen = new Set<number>();
  const push = (index: number) => {
    if (index < 0 || index >= count || seen.has(index)) return;
    seen.add(index);
    order.push(index);
  };
  const step = direction === "forward" ? 1 : -1;
  // Nearest first, ahead before behind at equal distance.
  const pushAround = (span: MobileReaderPageRange) => {
    const first = Math.max(0, span.first);
    const last = Math.min(count - 1, span.last);
    if (first > last) return;
    const center = Math.max(first, Math.min(last, current));
    const reach = Math.max(center - first, last - center);
    for (let distance = 0; distance <= reach; distance += 1) {
      for (const index of [center + distance * step, center - distance * step]) {
        if (index >= first && index <= last) push(index);
      }
    }
  };
  push(current);
  if (visible) pushAround(visible);
  if (landing) {
    const from = direction === "forward" ? landing.first : landing.last;
    const to = direction === "forward" ? landing.last : landing.first;
    for (let index = from; (index - to) * step <= 0; index += step) push(index);
  }
  if (range) {
    const aheadEnd = direction === "forward" ? range.last : range.first;
    const behindEnd = direction === "forward" ? range.first : range.last;
    for (let index = current + step; (index - aheadEnd) * step <= 0; index += step) {
      push(index);
    }
    for (let index = current - step; (index - behindEnd) * step >= 0; index -= step) {
      push(index);
    }
  }
  return order;
}

/**
 * The mounted pages after the reader moved: everything still mounted that is
 * inside `keep`, plus all of `enter` (`enter` lies inside `keep`). A jump
 * that leaves nothing of the previous range in `keep` starts over at `enter`.
 */
export function nextMobileReaderMountedRange(
  previous: MobileReaderPageRange | null,
  enter: MobileReaderPageRange | null,
  keep: MobileReaderPageRange | null,
): MobileReaderPageRange | null {
  if (!enter) return null;
  if (!previous || !keep) return enter;
  const keptFirst = Math.max(previous.first, keep.first);
  const keptLast = Math.min(previous.last, keep.last);
  if (keptFirst > keptLast) return enter;
  return {
    first: Math.max(keep.first, Math.min(keptFirst, enter.first)),
    last: Math.min(keep.last, Math.max(keptLast, enter.last)),
  };
}

export type MobileReaderRenderRangeStore = {
  /** Whether `index` is mounted now: in the range or in the fling's landing. */
  includes(index: number): boolean;
  /**
   * Records the range without telling anyone (safe while rendering: cells
   * rendered after it read the new value); `notify` then tells the cells
   * that were not re-rendered.
   */
  set(range: MobileReaderPageRange | null, landing: MobileReaderPageRange | null): void;
  notify(): void;
  subscribe(listener: () => void): () => void;
};

/**
 * Holds the scroll list's mounted range outside React state, so each page
 * cell can subscribe to its own membership: a page crossing re-renders only
 * the cells that mount or unmount, not every cell in the list.
 */
export function createMobileReaderRenderRangeStore(): MobileReaderRenderRangeStore {
  let range: MobileReaderPageRange | null = null;
  let landing: MobileReaderPageRange | null = null;
  let dirty = false;
  const listeners = new Set<() => void>();
  const same = (a: MobileReaderPageRange | null, b: MobileReaderPageRange | null) =>
    a === b || (a != null && b != null && a.first === b.first && a.last === b.last);
  return {
    includes(index) {
      return (
        isMobileReaderPageInRange(index, range) ||
        (landing != null && index >= landing.first && index <= landing.last)
      );
    },
    set(nextRange, nextLanding) {
      if (same(range, nextRange) && same(landing, nextLanding)) return;
      range = nextRange;
      landing = nextLanding;
      dirty = true;
    },
    notify() {
      if (!dirty) return;
      dirty = false;
      for (const listener of [...listeners]) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export function isMobileReaderPageInRange(
  displayIndex: number | undefined,
  range: MobileReaderPageRange | null,
): boolean {
  // Unknown position or no range: keep the page mounted.
  if (displayIndex === undefined || !Number.isFinite(displayIndex) || !range) {
    return true;
  }
  return displayIndex >= range.first && displayIndex <= range.last;
}

export type MobileReaderPageRenderPolicy =
  | "none"
  | "far-placeholder"
  | "processing-placeholder"
  | "image";

export function getMobileReaderPageRenderPolicy({
  currentPageIndex,
  displayIndex,
  hasImageUri,
  processingPending,
  windowRadius = MOBILE_READER_PAGE_RENDER_WINDOW,
  inRenderWindow,
}: {
  currentPageIndex: number;
  displayIndex: number | undefined;
  hasImageUri: boolean;
  processingPending: boolean;
  windowRadius?: number;
  /** Decided by the caller (the scroll gallery's directional window). */
  inRenderWindow?: boolean;
}): MobileReaderPageRenderPolicy {
  if (!hasImageUri) return "none";
  // Apply virtualization before processing UI: otherwise every pending page in
  // a long chapter mounts its own ActivityIndicator despite being far outside
  // the visible window.
  const near =
    inRenderWindow ??
    isMobileReaderPageNearViewport(displayIndex, currentPageIndex, windowRadius);
  if (!near) {
    return "far-placeholder";
  }
  return processingPending ? "processing-placeholder" : "image";
}
