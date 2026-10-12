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
