import { describe, expect, test } from "bun:test";
import {
  MOBILE_READER_PAGE_RENDER_WINDOW,
  getMobileReaderPageRenderPolicy,
  isMobileReaderPageNearViewport,
} from "./mobileReaderPageWindow";

describe("isMobileReaderPageNearViewport", () => {
  test("bounds the plain ScrollView to at most five nearby image cells", () => {
    expect(MOBILE_READER_PAGE_RENDER_WINDOW).toBe(2);
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
