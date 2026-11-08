/**
 * The reader's cover view on the iPhone Duo's outer display (as Apple Books
 * there): the title's cover, full bleed across the whole display, or the
 * pages. A saved preference, the cover unless chosen otherwise; a button in the
 * vertical bar sets it. The inner display always reads.
 */

export type MobileReaderOuterDisplayView = "cover" | "pages";

export const DEFAULT_READER_OUTER_DISPLAY_VIEW: MobileReaderOuterDisplayView = "cover";

/** The saved value, or the default (the cover) when there is none. */
export function normalizeReaderOuterDisplayView(value: unknown): MobileReaderOuterDisplayView {
  return value === "pages" || value === "cover" ? value : DEFAULT_READER_OUTER_DISPLAY_VIEW;
}

export type MobileReaderCoverViewImage = {
  uri: string;
  headers?: Record<string, string>;
  uriOwnership: "source" | "app";
  cacheKind: "cover" | "page";
  /** A stand-in for a missing cover (the chapter's first page), blurred. */
  blurred: boolean;
};

/** The crossfade between the page and the cover; Reduce Motion swaps at once. */
export const MOBILE_READER_COVER_VIEW_FADE_MS = 220;

export function mobileReaderCoverViewFadeMs(reduceMotion: boolean | null | undefined): number {
  return reduceMotion === true ? 0 : MOBILE_READER_COVER_VIEW_FADE_MS;
}

/** The blur over a first page standing in for the cover. */
export const MOBILE_READER_COVER_VIEW_PAGE_BLUR = 24;

/**
 * What the cover view shows: the title's cover (the library's display cover,
 * else the source's cached details), else the chapter's first page blurred,
 * else nothing (the toggle is not offered).
 */
export function resolveMobileReaderCoverViewImage(input: {
  cover: { uri: string; headers?: Record<string, string> } | null;
  firstPage: { imageUri?: string | null; headers?: Record<string, string>; imageUriOwnership?: "source" | "app" } | null;
}): MobileReaderCoverViewImage | null {
  const coverUri = input.cover?.uri.trim();
  if (coverUri) {
    return { uri: coverUri, headers: input.cover?.headers, uriOwnership: "source", cacheKind: "cover", blurred: false };
  }
  const pageUri = input.firstPage?.imageUri?.trim();
  if (pageUri) {
    return {
      uri: pageUri,
      headers: input.firstPage?.headers,
      uriOwnership: input.firstPage?.imageUriOwnership ?? "source",
      cacheKind: "page",
      blurred: true,
    };
  }
  return null;
}

/**
 * Whether the toggle is in the bar: the outer display read full screen (the
 * closed Duo's own canvas; never the inner display, book posture or a Split
 * View half), with something to show.
 */
export function mobileReaderCoverViewAvailable(input: {
  outerCanvas: boolean;
  image: MobileReaderCoverViewImage | null;
}): boolean {
  return input.outerCanvas && input.image !== null;
}

export type MobileReaderCoverViewPhase = "cover" | "pending" | "reading";

/**
 * What the reader shows, from the saved view and where it is. Reading anywhere
 * but the outer display; there, reading if that is the saved view or nothing
 * can stand for the cover. `pending` holds a blank rather than flash a page
 * while the saved view is unread, or the pages (whose first stands in for a
 * missing cover) are still on their way.
 */
export function resolveMobileReaderCoverViewPhase(input: {
  outerCanvas: boolean;
  view: MobileReaderOuterDisplayView;
  viewKnown: boolean;
  image: MobileReaderCoverViewImage | null;
  pagesSettled: boolean;
}): MobileReaderCoverViewPhase {
  if (!input.outerCanvas) return "reading";
  if (!input.viewKnown) return "pending";
  if (input.view === "pages") return "reading";
  if (input.image) return "cover";
  return input.pagesSettled ? "reading" : "pending";
}

/**
 * Time on the cover isn't reading, so it saves nothing. A page that changed
 * under it did get read: a fold that came mid-turn, which lands after it.
 */
export function mobileReaderCoverViewPausesProgress(input: {
  coverShown: boolean;
  pageIndex: number;
  heldPageIndex: number;
}): boolean {
  return input.coverShown && input.pageIndex === input.heldPageIndex;
}

/**
 * The system chrome (status bar, the vertical bar's items) while the cover
 * shows: the cover's own tap toggle decides, never the reading HUD's state or
 * its auto-hide. Reading, the HUD decides as usual.
 */
export function mobileReaderCoverViewBarChromeShown(input: {
  coverShown: boolean;
  coverChromeShown: boolean;
  readerControlsShown: boolean;
}): boolean {
  return input.coverShown ? input.coverChromeShown : input.readerControlsShown;
}
