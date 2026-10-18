import { describe, expect, test } from "bun:test";
import {
  buildMobileReaderDisplaySpreads,
  buildMobileReaderSpreads,
  findMobileReaderSpreadIndex,
  firstPageIndexForMobileReaderSpread,
  mobileReaderPageIndexForSettledSpread,
  getMobileReaderSpreadImageFrameSize,
  getMobileReaderSpreadSheetFrames,
  getMobileReaderSplitWidePageFrame,
  mobileReaderSplitWideHalfRects,
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
          const alignment = mobileReaderSpreadPageAlignment(slotIndex, 2);
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

  test("a page alone is centred; facing pages lean on the spine, fold panes included", () => {
    expect(mobileReaderSpreadPageAlignment(0, 1)).toBe("center");
    expect(mobileReaderSpreadPageAlignment(0, 2)).toBe("flex-end");
    expect(mobileReaderSpreadPageAlignment(1, 2)).toBe("flex-start");
  });

  test("facing pages are fitted as one sheet: same height, each inside its slot", () => {
    const page = { width: 1000, height: 1500 };
    // Flat stage halves 475×669: the height limits (475 / (2/3) = 712.5 > 669).
    expect(getMobileReaderSpreadSheetFrames({
      slots: [{ width: 475, height: 669 }, { width: 475, height: 669 }],
      sizes: [page, page],
    })).toEqual([{ width: 446, height: 669 }, { width: 446, height: 669 }]);
    // Different shapes: both share the height the wider page fits at, nothing crosses the spine.
    const [left, right] = getMobileReaderSpreadSheetFrames({
      slots: [{ width: 400, height: 800 }, { width: 400, height: 800 }],
      sizes: [{ width: 800, height: 1000 }, page],
    });
    expect(left.height).toBe(right.height);
    expect(left.width).toBeLessThanOrEqual(400);
    expect(right.width).toBeLessThanOrEqual(400);
    expect(left.width).toBe(400);
    // Fold panes of different sizes: the smaller one decides.
    const panes = getMobileReaderSpreadSheetFrames({
      slots: [{ width: 455, height: 669 }, { width: 400, height: 669 }],
      sizes: [page, null],
    });
    expect(panes[0].height).toBe(panes[1].height);
    expect(panes[1].width).toBeLessThanOrEqual(400);
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

describe("settled spread page", () => {
  const spreads = [[0], [1, 2], [3, 4], [5]];
  test("keeps the page the reader was on when the spread shows it (rotate / unfold and back)", () => {
    expect(mobileReaderPageIndexForSettledSpread(spreads, 1, 2)).toBe(2);
    expect(mobileReaderPageIndexForSettledSpread(spreads, 2, 3)).toBe(3);
  });
  test("a new spread starts at its first page", () => {
    expect(mobileReaderPageIndexForSettledSpread(spreads, 2, 2)).toBe(3);
    expect(mobileReaderPageIndexForSettledSpread(spreads, 3, 4)).toBe(5);
    expect(mobileReaderPageIndexForSettledSpread(spreads, 9, 0)).toBe(5);
  });

  describe("a wide page in the book posture", () => {
    // Duo book posture: two panes beside a vertical fold (the right pane is
    // narrower beside the rail), stage-local.
    const left = { x: 0, y: 0, width: 455.5, height: 669 };
    const right = { x: 479.5, y: 0, width: 371.5, height: 669 };

    test("is split at its centre: each half fits its pane, the whole page shown at its own shape", () => {
      const frame = getMobileReaderSplitWidePageFrame({ slots: [left, right], size: { width: 2264, height: 1600 } });
      expect(frame.width / 2).toBeLessThanOrEqual(371.5 + 1e-9);
      expect(frame.width / 2).toBeCloseTo(371.5, 6);
      expect(frame.height).toBeLessThanOrEqual(669);
      expect(frame.width / frame.height).toBeCloseTo(2264 / 1600, 6);
    });

    test("a shorter, very wide page is held by the panes' height", () => {
      const frame = getMobileReaderSplitWidePageFrame({
        slots: [{ ...left, width: 900 }, { ...right, width: 900 }],
        size: { width: 2000, height: 1000 },
      });
      expect(frame.height).toBeCloseTo(669, 6);
      expect(frame.width).toBeCloseTo(1338, 6);
    });

    test("the halves rest against the fold edges at the same height, nothing on the fold", () => {
      const frame = getMobileReaderSplitWidePageFrame({ slots: [left, right], size: { width: 2264, height: 1600 } });
      const [l, r] = mobileReaderSplitWideHalfRects({ slots: [left, right], frame });
      expect(l.x + l.width).toBeCloseTo(455.5, 6);
      expect(r.x).toBeCloseTo(479.5, 6);
      expect(l.width).toBeCloseTo(frame.width / 2, 6);
      expect(r.width).toBeCloseTo(frame.width / 2, 6);
      expect(l.y).toBe(r.y);
      expect(l.height).toBe(r.height);
      // Centred vertically in the panes.
      expect(l.y).toBeCloseTo((669 - frame.height) / 2, 6);
      expect(l.x).toBeGreaterThanOrEqual(left.x);
      expect(r.x + r.width).toBeLessThanOrEqual(right.x + right.width + 1e-9);
    });

    test("panes of different heights share their common band", () => {
      const tall = { x: 0, y: 0, width: 455.5, height: 669 };
      const short = { x: 479.5, y: 40, width: 455.5, height: 600 };
      const frame = getMobileReaderSplitWidePageFrame({ slots: [tall, short], size: { width: 1000, height: 300 } });
      const [l, r] = mobileReaderSplitWideHalfRects({ slots: [tall, short], frame });
      expect(frame.height).toBeLessThanOrEqual(600);
      expect(l.y).toBe(r.y);
      expect(l.y).toBeGreaterThanOrEqual(40);
      expect(l.y + l.height).toBeLessThanOrEqual(640 + 1e-9);
    });
  });
});
