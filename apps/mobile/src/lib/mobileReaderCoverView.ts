/**
 * The reader's cover view on the iPhone Duo's outer display (as Apple Books
 * there): a button heading the vertical bar's actions swaps the page for the
 * title's cover, full bleed across the whole display, and back. A session
 * choice only: every reader opens on the page.
 */

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

/**
 * The requested mode after a layout change: the cover exists only on the
 * outer display, so unfolding (or anything else that takes the toggle away)
 * returns to reading, and refolding does not bring the cover back.
 */
export function mobileReaderNextCoverViewRequest(requested: boolean, available: boolean): boolean {
  return requested && available;
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
