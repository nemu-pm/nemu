import { describe, expect, test } from "bun:test";
import {
  MOBILE_READER_COVER_VIEW_FADE_MS,
  mobileReaderCoverViewAvailable,
  mobileReaderCoverViewBarChromeShown,
  mobileReaderCoverViewFadeMs,
  mobileReaderCoverViewPausesProgress,
  mobileReaderOuterCanvas,
  normalizeReaderOuterDisplayView,
  resolveMobileReaderCoverViewImage,
  resolveMobileReaderCoverViewPhase,
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

describe("reader outer display: the saved view", () => {
  const image = resolveMobileReaderCoverViewImage({ cover: { uri: "https://example.test/c.jpg" }, firstPage: null });
  const base = { outerCanvas: true, view: "cover", viewKnown: true, image, pagesSettled: true } as const;

  test("the cover unless chosen otherwise; anything unknown in storage is the default", () => {
    expect(normalizeReaderOuterDisplayView(undefined)).toBe("cover");
    expect(normalizeReaderOuterDisplayView(null)).toBe("cover");
    expect(normalizeReaderOuterDisplayView("bogus")).toBe("cover");
    expect(normalizeReaderOuterDisplayView("pages")).toBe("pages");
    expect(normalizeReaderOuterDisplayView("cover")).toBe("cover");
  });

  test("Cover: the outer display shows it; the inner display reads, in every posture", () => {
    expect(resolveMobileReaderCoverViewPhase(base)).toBe("cover");
    expect(resolveMobileReaderCoverViewPhase({ ...base, outerCanvas: false })).toBe("reading");
  });

  test("Pages: the outer display reads", () => {
    expect(resolveMobileReaderCoverViewPhase({ ...base, view: "pages" })).toBe("reading");
    expect(resolveMobileReaderCoverViewPhase({ ...base, view: "pages", outerCanvas: false })).toBe("reading");
  });

  test("a fold and an unfold and a refold land where the view says, the view itself untouched", () => {
    for (const view of ["cover", "pages"] as const) {
      const on = (outerCanvas: boolean) => resolveMobileReaderCoverViewPhase({ ...base, view, outerCanvas });
      expect([on(false), on(true), on(false), on(true)]).toEqual(
        view === "cover" ? ["reading", "cover", "reading", "cover"] : ["reading", "reading", "reading", "reading"],
      );
    }
  });

  test("no cover yet: a blank while the first page may still stand in, never a flash of pages", () => {
    expect(resolveMobileReaderCoverViewPhase({ ...base, image: null, pagesSettled: false })).toBe("pending");
    expect(resolveMobileReaderCoverViewPhase({ ...base, viewKnown: false })).toBe("pending");
    expect(resolveMobileReaderCoverViewPhase({ ...base, view: "pages", viewKnown: false })).toBe("pending");
  });

  test("neither a cover nor a first page: reads normally", () => {
    expect(resolveMobileReaderCoverViewPhase({ ...base, image: null })).toBe("reading");
  });

  test("off the outer display nothing waits, whatever is unknown", () => {
    expect(resolveMobileReaderCoverViewPhase({ ...base, outerCanvas: false, viewKnown: false, image: null, pagesSettled: false })).toBe("reading");
  });

  test("time on the cover saves nothing; a turn landing under it does", () => {
    expect(mobileReaderCoverViewPausesProgress({ coverShown: true, pageIndex: 4, heldPageIndex: 4 })).toBe(true);
    expect(mobileReaderCoverViewPausesProgress({ coverShown: true, pageIndex: 5, heldPageIndex: 4 })).toBe(false);
    expect(mobileReaderCoverViewPausesProgress({ coverShown: false, pageIndex: 4, heldPageIndex: 4 })).toBe(false);
  });
});

describe("reader outer display: where it is", () => {
  test("only the closed Duo full screen; a Split View half or an open hinge is not it", () => {
    const outer = { sideBar: true, hinge: "closed", fillsScreen: true };
    expect(mobileReaderOuterCanvas(outer)).toBe(true);
    expect(mobileReaderOuterCanvas({ ...outer, fillsScreen: undefined })).toBe(true);
    expect(mobileReaderOuterCanvas({ ...outer, fillsScreen: false })).toBe(false);
    expect(mobileReaderOuterCanvas({ ...outer, hinge: "fullyOpen" })).toBe(false);
    expect(mobileReaderOuterCanvas({ ...outer, hinge: "partiallyOpen" })).toBe(false);
    expect(mobileReaderOuterCanvas({ ...outer, sideBar: false })).toBe(false);
  });
});

