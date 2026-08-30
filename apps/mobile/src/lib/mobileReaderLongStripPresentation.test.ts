import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  MOBILE_READER_LONG_STRIP_MIN_ASPECT_RATIO,
  getMobileReaderImageFrameSize,
  isMobileReaderLongStripLogicalPage,
  shouldUseMobileReaderLongStripPresentation,
} from "./mobileReaderLongStripPresentation";

describe("mobile reader long-strip presentation", () => {
  test("uses width-first vertical presentation for the observed single-page strip", () => {
    expect(
      shouldUseMobileReaderLongStripPresentation({
        pagedMode: true,
        pageCount: 1,
        naturalSize: { width: 475, height: 16_384 },
      }),
    ).toBe(true);

    expect(
      getMobileReaderImageFrameSize({
        imageWidth: 390,
        naturalSize: { width: 475, height: 16_384 },
        clampHeightToPagedViewport: false,
        maximumPagedHeight: 844,
      }),
    ).toEqual({
      width: 390,
      height: (390 * 16_384) / 475,
    });
  });

  test("keeps ordinary and multi-page manga in their requested paged presentation", () => {
    expect(
      shouldUseMobileReaderLongStripPresentation({
        pagedMode: true,
        pageCount: 1,
        naturalSize: { width: 1_000, height: 1_500 },
      }),
    ).toBe(false);
    expect(
      shouldUseMobileReaderLongStripPresentation({
        pagedMode: true,
        pageCount: 2,
        naturalSize: { width: 475, height: 16_384 },
      }),
    ).toBe(false);
    expect(
      shouldUseMobileReaderLongStripPresentation({
        pagedMode: false,
        pageCount: 1,
        naturalSize: { width: 475, height: 16_384 },
      }),
    ).toBe(false);
  });

  test("classifies a scrolling one-page strip independently of paged geometry", () => {
    expect(
      isMobileReaderLongStripLogicalPage({
        pageCount: 1,
        naturalSize: { width: 1_000, height: 8_000 },
      }),
    ).toBe(true);
    expect(
      shouldUseMobileReaderLongStripPresentation({
        pagedMode: false,
        pageCount: 1,
        naturalSize: { width: 1_000, height: 8_000 },
      }),
    ).toBe(false);
  });

  test("uses an inclusive, conservative aspect boundary and rejects invalid metadata", () => {
    expect(
      shouldUseMobileReaderLongStripPresentation({
        pagedMode: true,
        pageCount: 1,
        naturalSize: {
          width: 1_000,
          height: 1_000 * MOBILE_READER_LONG_STRIP_MIN_ASPECT_RATIO,
        },
      }),
    ).toBe(true);
    expect(
      shouldUseMobileReaderLongStripPresentation({
        pagedMode: true,
        pageCount: 1,
        naturalSize: {
          width: 1_000,
          height: 1_000 * MOBILE_READER_LONG_STRIP_MIN_ASPECT_RATIO - 1,
        },
      }),
    ).toBe(false);

    for (const naturalSize of [
      null,
      { width: 0, height: 4_000 },
      { width: 1_000, height: Number.NaN },
      { width: Number.POSITIVE_INFINITY, height: 4_000 },
      { width: 4_000, height: 1_000 },
    ]) {
      expect(
        shouldUseMobileReaderLongStripPresentation({
          pagedMode: true,
          pageCount: 1,
          naturalSize,
        }),
      ).toBe(false);
    }
  });

  test("caps ordinary paged frames but never caps width-first strip height", () => {
    expect(
      getMobileReaderImageFrameSize({
        imageWidth: 390,
        naturalSize: { width: 1_000, height: 4_000 },
        clampHeightToPagedViewport: true,
        maximumPagedHeight: 844,
      }),
    ).toEqual({ width: 390, height: 844 });
    expect(
      getMobileReaderImageFrameSize({
        imageWidth: 390,
        naturalSize: { width: 1_000, height: 4_000 },
        clampHeightToPagedViewport: false,
        maximumPagedHeight: 844,
      }),
    ).toEqual({ width: 390, height: 1_560 });
  });

  test("bounds invalid layout inputs and retains the existing fallback ratio", () => {
    expect(
      getMobileReaderImageFrameSize({
        imageWidth: Number.NaN,
        naturalSize: { width: 0, height: 0 },
        clampHeightToPagedViewport: true,
        maximumPagedHeight: Number.POSITIVE_INFINITY,
      }),
    ).toEqual({ width: 1, height: 220 });
  });

  test("wires the alternate gallery geometry without changing the saved mode", () => {
    const screen = readFileSync(
      path.join(import.meta.dir, "../screens/ReaderScreen.tsx"),
      "utf8",
    );
    const gallery = readFileSync(
      path.join(
        import.meta.dir,
        "../components/reader/MobileReaderGallery.tsx",
      ),
      "utf8",
    );

    expect(screen).toContain(
      "const galleryPagedMode = pagedMode && !useLongStripPresentation;",
    );
    expect(screen).toContain("clampHeightToPagedViewport: galleryPagedMode");
    expect(screen).toContain("pagedMode={galleryPagedMode}");
    expect(screen).toContain("pageTurnAccessibilityEnabled={");
    expect(screen).toContain("isLongStripLogicalPage");
    expect(gallery).toContain("logicalLongStripMode");
    expect(gallery).toContain(
      '{ name: "activate", label: accessibilityLabel }',
    );
  });
});
