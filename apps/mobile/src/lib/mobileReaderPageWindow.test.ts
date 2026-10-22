import { describe, expect, test } from "bun:test";
import {
  MOBILE_READER_PAGE_RENDER_WINDOW,
  getMobileReaderPageRenderPolicy,
  isMobileReaderPageInRange,
  isMobileReaderPageNearViewport,
  nextMobileReaderScrollDirection,
  resolveMobileReaderScrollPageRange,
} from "./mobileReaderPageWindow";
import { buildMobileReaderScrollLayout } from "./mobileReaderScrollLayout";

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
  const viewportHeight = 900;
  // Webtoon slices 800×1280 on a 430pt column: ~688pt each.
  const slices = buildMobileReaderScrollLayout(
    Array.from({ length: 60 }, () => 688),
    null,
  );

  test("reaches three screens past the bottom and one above the top", () => {
    // Screen top at page 20's top: bottom at 20*688+900; reach down to +2700.
    const top = 20 * 688;
    const range = resolveMobileReaderScrollPageRange({
      pageCount: 60,
      anchorIndex: 20,
      direction: "forward",
      viewportTop: top,
      viewportHeight,
      layout: slices,
      estimatedPageHeight: 688,
    });
    // Down to top + 3600: the last page starting above it is 25.
    // Up to top - 900: the first page ending below it is 18.
    expect(range).toEqual({ first: 18, last: 25 });
  });

  test("flips with the scroll direction", () => {
    const top = 20 * 688;
    expect(
      resolveMobileReaderScrollPageRange({
        pageCount: 60,
        anchorIndex: 20,
        direction: "backward",
        viewportTop: top,
        viewportHeight,
        layout: slices,
        estimatedPageHeight: 688,
      }),
    ).toEqual({ first: 16, last: 22 });
  });

  test("very short slices are capped; tall pages keep a couple each way", () => {
    const short = buildMobileReaderScrollLayout(
      Array.from({ length: 200 }, () => 40),
      null,
    );
    const range = resolveMobileReaderScrollPageRange({
      pageCount: 200,
      anchorIndex: 100,
      direction: "forward",
      viewportTop: 100 * 40 - 450,
      viewportHeight,
      layout: short,
      estimatedPageHeight: 40,
    })!;
    expect(range.last).toBe(124);
    expect(range.first).toBe(92);
    const tall = buildMobileReaderScrollLayout(
      Array.from({ length: 20 }, () => 6000),
      null,
    );
    expect(
      resolveMobileReaderScrollPageRange({
        pageCount: 20,
        anchorIndex: 10,
        direction: "forward",
        viewportTop: 10 * 6000,
        viewportHeight,
        layout: tall,
        estimatedPageHeight: 6000,
      }),
    ).toEqual({ first: 8, last: 12 });
  });

  test("uses each page's own height", () => {
    // A tall page right below the screen ends the reach early.
    const mixed = buildMobileReaderScrollLayout(
      [600, 600, 600, 5000, 600, 600, 600, 600],
      null,
    );
    expect(
      resolveMobileReaderScrollPageRange({
        pageCount: 8,
        anchorIndex: 1,
        direction: "forward",
        viewportTop: 600,
        viewportHeight,
        layout: mixed,
        estimatedPageHeight: 600,
        minBehind: 0,
      }),
    ).toEqual({ first: 0, last: 3 });
  });

  test("estimates without a layout, centred on the anchor when unmeasured", () => {
    expect(
      resolveMobileReaderScrollPageRange({
        pageCount: 60,
        anchorIndex: 20,
        direction: "forward",
        viewportTop: null,
        viewportHeight: 1000,
        estimatedPageHeight: 1000,
      }),
    ).toEqual({ first: 18, last: 23 });
  });

  test("stays inside the chapter", () => {
    expect(
      resolveMobileReaderScrollPageRange({
        pageCount: 3,
        anchorIndex: 2,
        direction: "forward",
        viewportTop: 2 * 688,
        viewportHeight,
        layout: buildMobileReaderScrollLayout([688, 688, 688], null),
        estimatedPageHeight: 688,
      }),
    ).toEqual({ first: 0, last: 2 });
    expect(
      resolveMobileReaderScrollPageRange({
        pageCount: 0,
        anchorIndex: 0,
        direction: "forward",
        viewportTop: 0,
        viewportHeight,
        estimatedPageHeight: 688,
      }),
    ).toBeNull();
  });

  test("keeps pages with unknown position (or no range) mounted", () => {
    expect(isMobileReaderPageInRange(undefined, { first: 0, last: 1 })).toBe(true);
    expect(isMobileReaderPageInRange(5, null)).toBe(true);
    expect(isMobileReaderPageInRange(5, { first: 0, last: 4 })).toBe(false);
    expect(isMobileReaderPageInRange(4, { first: 0, last: 4 })).toBe(true);
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
