import { describe, expect, test } from "bun:test";
import {
  buildMobileReaderDisplaySpreads,
  buildMobileReaderSpreads,
  findMobileReaderSpreadIndex,
  firstPageIndexForMobileReaderSpread,
  getMobileReaderSpreadImageFrameSize,
  mobileReaderSpreadPageAlignment,
  pageIndexForMobileReaderSpreadStep,
  visualPageIndexesForMobileReaderSpread,
} from "./mobileReaderSpreads";

describe("mobile reader spreads", () => {
  test("builds manga-style spreads with the first page alone", () => {
    expect(buildMobileReaderSpreads(5, "manga")).toEqual([[0], [1, 2], [3, 4]]);
    expect(buildMobileReaderSpreads(4, "manga")).toEqual([[0], [1, 2], [3]]);
  });

  test("builds book-style paired spreads from the first page", () => {
    expect(buildMobileReaderSpreads(5, "book")).toEqual([[0, 1], [2, 3], [4]]);
    expect(buildMobileReaderSpreads(0, "book")).toEqual([]);
  });

  test("keeps manga spreads in source order for every reading mode", () => {
    expect(buildMobileReaderDisplaySpreads(5, "manga", "rtl")).toEqual([
      [0],
      [1, 2],
      [3, 4],
    ]);
    expect(buildMobileReaderDisplaySpreads(5, "manga", "ltr")).toEqual([
      [0],
      [1, 2],
      [3, 4],
    ]);
  });

  test("keeps the first source page solo in RTL manga pairing", () => {
    const spreads = buildMobileReaderDisplaySpreads(5, "manga", "rtl");

    expect(findMobileReaderSpreadIndex(spreads, 0)).toBe(0);
    expect(firstPageIndexForMobileReaderSpread(spreads, 0)).toBe(0);
    expect(visualPageIndexesForMobileReaderSpread(spreads[0]!, "rtl")).toEqual([0]);
    expect(visualPageIndexesForMobileReaderSpread(spreads[1]!, "rtl")).toEqual([
      2,
      1,
    ]);
  });

  test("finds and clamps spread indexes for page positions", () => {
    const spreads = buildMobileReaderSpreads(5, "manga");
    expect(findMobileReaderSpreadIndex(spreads, 0)).toBe(0);
    expect(findMobileReaderSpreadIndex(spreads, 2)).toBe(1);
    expect(findMobileReaderSpreadIndex(spreads, 99)).toBe(2);
    expect(findMobileReaderSpreadIndex(spreads, -4)).toBe(0);
    expect(firstPageIndexForMobileReaderSpread(spreads, 2)).toBe(3);
    expect(firstPageIndexForMobileReaderSpread(spreads, 99)).toBe(3);
  });

  test("steps whole spreads instead of stopping on the paired page", () => {
    const book = buildMobileReaderSpreads(5, "book");
    expect(pageIndexForMobileReaderSpreadStep(book, 0, "next")).toBe(2);
    expect(pageIndexForMobileReaderSpreadStep(book, 1, "next")).toBe(2);
    expect(pageIndexForMobileReaderSpreadStep(book, 3, "previous")).toBe(0);
    expect(pageIndexForMobileReaderSpreadStep(book, 0, "previous")).toBeNull();
    expect(pageIndexForMobileReaderSpreadStep(book, 4, "next")).toBeNull();

    const manga = buildMobileReaderDisplaySpreads(5, "manga", "rtl");
    expect(pageIndexForMobileReaderSpreadStep(manga, 0, "next")).toBe(1);
    expect(pageIndexForMobileReaderSpreadStep(manga, 2, "next")).toBe(3);
  });

  test("places the first-read page on the reading-direction side", () => {
    // RTL (manga): first-read page renders on the right, so it comes last in
    // the left→right render order. LTR reads left→right, so order is as-is.
    expect(visualPageIndexesForMobileReaderSpread([1, 2], "rtl")).toEqual([2, 1]);
    expect(visualPageIndexesForMobileReaderSpread([1, 2], "ltr")).toEqual([1, 2]);
    expect(visualPageIndexesForMobileReaderSpread([1], "ltr")).toEqual([1]);
  });

  test("height-limited facing pages meet at the spine in either reading direction", () => {
    const slotWidth = 560;
    const fittedWidths = [360, 410];
    for (const mode of ["ltr", "rtl"] as const) {
      const frames = visualPageIndexesForMobileReaderSpread([0, 1], mode).map(
        (pageIndex, slotIndex) => {
          const width = fittedWidths[pageIndex]!;
          const alignment = mobileReaderSpreadPageAlignment(slotIndex, 2, false);
          const offset = alignment === "flex-end" ? slotWidth - width
            : alignment === "center" ? (slotWidth - width) / 2 : 0;
          return { x: slotIndex * slotWidth + offset, width };
        },
      );
      expect(frames[0]!.x + frames[0]!.width).toBe(frames[1]!.x);
      expect(frames[0]!.x).toBeGreaterThanOrEqual(0);
      expect(frames[1]!.x + frames[1]!.width).toBeLessThanOrEqual(slotWidth * 2);
    }
  });

  test("centers covers and real fold-region pages in their available viewport", () => {
    expect(mobileReaderSpreadPageAlignment(0, 1, false)).toBe("center");
    expect(mobileReaderSpreadPageAlignment(0, 2, true)).toBe("center");
    expect(mobileReaderSpreadPageAlignment(1, 2, true)).toBe("center");
  });

  test("fits the frame to the page without cropping or an internal contain gutter", () => {
    expect(getMobileReaderSpreadImageFrameSize({
      availableWidth: 560, availableHeight: 600, naturalSize: { width: 1000, height: 1500 },
    })).toEqual({ width: 400, height: 600 });
    // A tall unfolded viewport uses all available half-width, exceeding the old 420 cap.
    expect(getMobileReaderSpreadImageFrameSize({
      availableWidth: 560, availableHeight: 1000, naturalSize: { width: 1000, height: 1500 },
    })).toEqual({ width: 560, height: 840 });
    // Real fold slots may be shorter than the old 260-point minimum.
    expect(getMobileReaderSpreadImageFrameSize({
      availableWidth: 300, availableHeight: 180, naturalSize: { width: 1000, height: 1500 },
    })).toEqual({ width: 120, height: 180 });
    const fallback = getMobileReaderSpreadImageFrameSize({ availableWidth: 400, availableHeight: 600 });
    expect(fallback).toEqual({ width: 400, height: 580 });
  });
});
