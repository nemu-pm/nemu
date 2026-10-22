import { describe, expect, test } from "bun:test";
import {
  MOBILE_READER_PAGE_RENDER_WINDOW,
  getMobileReaderPageRenderPolicy,
  isMobileReaderPageInScrollRenderWindow,
  isMobileReaderPageNearViewport,
  nextMobileReaderScrollDirection,
} from "./mobileReaderPageWindow";

describe("isMobileReaderPageNearViewport", () => {
  test("bounds the reader to at most seven nearby image cells", () => {
    expect(MOBILE_READER_PAGE_RENDER_WINDOW).toBe(3);
  });

  test("keeps pages within the window mounted", () => {
    expect(isMobileReaderPageNearViewport(10, 10)).toBe(true);
    expect(
      isMobileReaderPageNearViewport(10 - MOBILE_READER_PAGE_RENDER_WINDOW, 10),
    ).toBe(true);
    expect(
      isMobileReaderPageNearViewport(10 + MOBILE_READER_PAGE_RENDER_WINDOW, 10),
    ).toBe(true);
  });

  test("unmounts pages outside the window", () => {
    expect(
      isMobileReaderPageNearViewport(10 + MOBILE_READER_PAGE_RENDER_WINDOW + 1, 10),
    ).toBe(false);
    expect(isMobileReaderPageNearViewport(0, 99)).toBe(false);
  });

  test("keeps pages with unknown display position mounted", () => {
    expect(isMobileReaderPageNearViewport(undefined, 10)).toBe(true);
    expect(isMobileReaderPageNearViewport(Number.NaN, 10)).toBe(true);
  });

  test("honors a custom radius", () => {
    expect(isMobileReaderPageNearViewport(12, 10, 1)).toBe(false);
    expect(isMobileReaderPageNearViewport(11, 10, 1)).toBe(true);
  });
});

describe("getMobileReaderPageRenderPolicy", () => {
  test("far pending pages stay cheap placeholders instead of mounting spinners", () => {
    expect(
      getMobileReaderPageRenderPolicy({
        currentPageIndex: 0,
        displayIndex: MOBILE_READER_PAGE_RENDER_WINDOW + 1,
        hasImageUri: true,
        processingPending: true,
      }),
    ).toBe("far-placeholder");
  });

  test("near pending pages show processing while ready pages render images", () => {
    expect(
      getMobileReaderPageRenderPolicy({
        currentPageIndex: 4,
        displayIndex: 4,
        hasImageUri: true,
        processingPending: true,
      }),
    ).toBe("processing-placeholder");
    expect(
      getMobileReaderPageRenderPolicy({
        currentPageIndex: 4,
        displayIndex: 4,
        hasImageUri: true,
        processingPending: false,
      }),
    ).toBe("image");
  });

  test("pages without an image do not reserve image content", () => {
    expect(
      getMobileReaderPageRenderPolicy({
        currentPageIndex: 0,
        displayIndex: 0,
        hasImageUri: false,
        processingPending: true,
      }),
    ).toBe("none");
  });
});

describe("scroll render window", () => {
  test("reaches six pages ahead and two behind when scrolling down", () => {
    expect(isMobileReaderPageInScrollRenderWindow(16, 10, "forward")).toBe(true);
    expect(isMobileReaderPageInScrollRenderWindow(17, 10, "forward")).toBe(false);
    expect(isMobileReaderPageInScrollRenderWindow(8, 10, "forward")).toBe(true);
    expect(isMobileReaderPageInScrollRenderWindow(7, 10, "forward")).toBe(false);
  });

  test("flips with the scroll direction", () => {
    expect(isMobileReaderPageInScrollRenderWindow(4, 10, "backward")).toBe(true);
    expect(isMobileReaderPageInScrollRenderWindow(3, 10, "backward")).toBe(false);
    expect(isMobileReaderPageInScrollRenderWindow(12, 10, "backward")).toBe(true);
    expect(isMobileReaderPageInScrollRenderWindow(13, 10, "backward")).toBe(false);
  });

  test("keeps pages with unknown position mounted", () => {
    expect(isMobileReaderPageInScrollRenderWindow(undefined, 10, "forward")).toBe(true);
  });

  test("direction follows the visible page and holds when it stays", () => {
    expect(nextMobileReaderScrollDirection(3, 4, "backward")).toBe("forward");
    expect(nextMobileReaderScrollDirection(4, 3, "forward")).toBe("backward");
    expect(nextMobileReaderScrollDirection(4, 4, "backward")).toBe("backward");
  });

  test("a caller-decided window overrides the symmetric radius", () => {
    expect(
      getMobileReaderPageRenderPolicy({
        currentPageIndex: 0,
        displayIndex: 6,
        hasImageUri: true,
        processingPending: false,
        inRenderWindow: true,
      }),
    ).toBe("image");
    expect(
      getMobileReaderPageRenderPolicy({
        currentPageIndex: 0,
        displayIndex: 0,
        hasImageUri: true,
        processingPending: false,
        inRenderWindow: false,
      }),
    ).toBe("far-placeholder");
  });
});
