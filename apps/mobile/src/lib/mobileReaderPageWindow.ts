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
 * Scroll (continuous vertical) reading: a fling runs ahead of the page the
 * reader settles on, so the window is directional — six pages ahead in the
 * scroll direction, four behind (a back-fling to pages seen seconds ago
 * shows their art, not placeholders) — and follows the live visible page
 * rather than the committed one. Eleven decoded pages at most, against seven
 * paged.
 */
export const MOBILE_READER_SCROLL_RENDER_AHEAD = 6;
export const MOBILE_READER_SCROLL_RENDER_BEHIND = 4;

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

export function isMobileReaderPageInScrollRenderWindow(
  displayIndex: number | undefined,
  anchorIndex: number,
  direction: MobileReaderScrollDirection,
  ahead: number = MOBILE_READER_SCROLL_RENDER_AHEAD,
  behind: number = MOBILE_READER_SCROLL_RENDER_BEHIND,
): boolean {
  if (
    displayIndex === undefined ||
    !Number.isFinite(displayIndex) ||
    !Number.isFinite(anchorIndex)
  ) {
    return true;
  }
  const offset = displayIndex - anchorIndex;
  return direction === "forward"
    ? offset >= -behind && offset <= ahead
    : offset >= -ahead && offset <= behind;
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
