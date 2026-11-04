import { clampReaderPageIndex } from "./mobileReaderProgress";

/** Resolve restoration only once page data AND persisted progress are available. */
export function resolveMobileReaderRestorePosition(options: {
  progressLoading: boolean;
  pagesReady: boolean;
  restoreKey: string;
  restoredKey: string;
  chapterPrefix: string;
  currentPageIndex: number;
  savedPageIndex: number;
  relayoutPageAnchor: number | null;
  pageCount: number;
}): number | null {
  if (options.progressLoading || !options.pagesReady || !options.restoreKey
    || options.restoredKey === options.restoreKey) return null;
  return clampReaderPageIndex(options.relayoutPageAnchor
    ?? (options.restoredKey.startsWith(options.chapterPrefix)
      ? options.currentPageIndex : options.savedPageIndex), options.pageCount);
}

export type MobileReaderRestoreSpot = { pageIndex: number; fraction: number };

/**
 * Where a restore seek takes the reader (display page, and in scroll reading
 * how far into it the reading line sits).
 *
 * - `heldSpot`: this screen already placed the chapter and a page-list
 *   refresh (a new `fetchedAt`) re-places it. The reader stays on the spot it
 *   holds — the opening target while that seek is still landing, else where
 *   the reading line last rested. The route page is *not* consulted: the
 *   reader rewrites it to its own page counter (the page at the screen's
 *   centre), which is not the reading-line page, and its top is not the spot.
 * - Otherwise an explicit route page opens at its top, unless it is the saved
 *   page itself (keeps the saved spot); else the saved spot.
 */
export function resolveMobileReaderRestoreSpot(options: {
  pageCount: number;
  scrollReading: boolean;
  heldSpot: MobileReaderRestoreSpot | null;
  routePageIndex: number | null;
  saved: MobileReaderRestoreSpot | null;
}): MobileReaderRestoreSpot {
  const { pageCount, scrollReading, heldSpot, routePageIndex, saved } = options;
  if (pageCount <= 0) return { pageIndex: 0, fraction: 0 };
  const fractionOf = (value: number) =>
    scrollReading && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  if (heldSpot) {
    return {
      pageIndex: clampReaderPageIndex(heldSpot.pageIndex, pageCount),
      fraction: fractionOf(heldSpot.fraction),
    };
  }
  const savedPageIndex = saved ? clampReaderPageIndex(saved.pageIndex, pageCount) : 0;
  const pageIndex = clampReaderPageIndex(routePageIndex ?? savedPageIndex, pageCount);
  return {
    pageIndex,
    fraction:
      saved && (routePageIndex == null || routePageIndex === savedPageIndex)
        ? fractionOf(saved.fraction)
        : 0,
  };
}
