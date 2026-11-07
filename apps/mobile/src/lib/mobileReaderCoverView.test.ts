import { describe, expect, test } from "bun:test";
import {
  MOBILE_READER_COVER_VIEW_FADE_MS,
  mobileReaderCoverViewAvailable,
  mobileReaderCoverViewBarChromeShown,
  mobileReaderCoverViewFadeMs,
  mobileReaderNextCoverViewRequest,
  resolveMobileReaderCoverViewImage,
} from "./mobileReaderCoverView";

describe("reader cover view (iPhone Duo outer display)", () => {
  const cover = { uri: "https://example.test/cover.jpg", headers: { Referer: "https://example.test/" } };
  const firstPage = { imageUri: "https://example.test/p1.jpg", headers: { Cookie: "a=1" }, imageUriOwnership: "app" as const };

  test("shows the title's cover, as a cover, unblurred", () => {
    expect(resolveMobileReaderCoverViewImage({ cover, firstPage })).toEqual({
      uri: cover.uri,
      headers: cover.headers,
      uriOwnership: "source",
      cacheKind: "cover",
      blurred: false,
    });
  });

  test("without a cover, the chapter's first page stands in, blurred, with its own request", () => {
    expect(resolveMobileReaderCoverViewImage({ cover: null, firstPage })).toEqual({
      uri: firstPage.imageUri,
      headers: firstPage.headers,
      uriOwnership: "app",
      cacheKind: "page",
      blurred: true,
    });
    expect(resolveMobileReaderCoverViewImage({ cover: { uri: "  " }, firstPage: { imageUri: "https://x.test/1.png" } }))
      .toMatchObject({ uriOwnership: "source", blurred: true });
  });

  test("nothing to show: no image, and no toggle", () => {
    const none = resolveMobileReaderCoverViewImage({ cover: null, firstPage: { imageUri: null } });
    expect(none).toBeNull();
    expect(resolveMobileReaderCoverViewImage({ cover: null, firstPage: null })).toBeNull();
    expect(mobileReaderCoverViewAvailable({ outerCanvas: true, image: none })).toBe(false);
  });

  test("the toggle is offered on the outer display only", () => {
    const image = resolveMobileReaderCoverViewImage({ cover, firstPage });
    expect(mobileReaderCoverViewAvailable({ outerCanvas: true, image })).toBe(true);
    // Unfolded, book posture, a Split View half: not the outer canvas.
    expect(mobileReaderCoverViewAvailable({ outerCanvas: false, image })).toBe(false);
  });

  test("leaving the outer display returns to reading, and refolding stays on the page", () => {
    expect(mobileReaderNextCoverViewRequest(true, true)).toBe(true);
    expect(mobileReaderNextCoverViewRequest(true, false)).toBe(false);
    // Refolded: the request was dropped, so availability alone never shows the cover.
    expect(mobileReaderNextCoverViewRequest(false, true)).toBe(false);
  });

  test("on the cover its own tap toggle drives the bar and status bar, not the HUD", () => {
    expect(mobileReaderCoverViewBarChromeShown({ coverShown: true, coverChromeShown: true, readerControlsShown: false }))
      .toBe(true);
    expect(mobileReaderCoverViewBarChromeShown({ coverShown: true, coverChromeShown: false, readerControlsShown: true }))
      .toBe(false);
    expect(mobileReaderCoverViewBarChromeShown({ coverShown: false, coverChromeShown: false, readerControlsShown: true }))
      .toBe(true);
  });

  test("a short crossfade; Reduce Motion swaps at once", () => {
    expect(mobileReaderCoverViewFadeMs(false)).toBe(MOBILE_READER_COVER_VIEW_FADE_MS);
    expect(mobileReaderCoverViewFadeMs(null)).toBe(MOBILE_READER_COVER_VIEW_FADE_MS);
    expect(MOBILE_READER_COVER_VIEW_FADE_MS).toBeLessThanOrEqual(300);
    expect(mobileReaderCoverViewFadeMs(true)).toBe(0);
  });
});
