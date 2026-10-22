import { afterEach, describe, expect, test } from "bun:test";
import {
  MOBILE_READER_SCROLL_DEFAULT_PAGE_RATIO,
  buildMobileReaderScrollLayout,
  clearMobileReaderPageNaturalSizes,
  isMobileReaderScrollSeekLanded,
  isMobileReaderScrollSeekSettled,
  mobileReaderScrollAnchorForOffset,
  mobileReaderScrollIndexViewOffset,
  mobileReaderScrollItemLayout,
  mobileReaderScrollOffsetForAnchor,
  mobileReaderScrollPageRatios,
  recallMobileReaderPageNaturalSize,
  rememberMobileReaderPageNaturalSize,
} from "./mobileReaderScrollLayout";

describe("mobileReaderScrollPageRatios", () => {
  test("known pages keep their own ratio; unknown ones take the chapter median", () => {
    const sizes = [
      { width: 1000, height: 1500 },
      null,
      { width: 1000, height: 1400 },
      { width: 2000, height: 1400 },
      undefined,
    ];
    const ratios = mobileReaderScrollPageRatios(5, (index) => sizes[index]);
    expect(ratios[0]).toBe(1.5);
    expect(ratios[2]).toBe(1.4);
    expect(ratios[3]).toBe(0.7);
    // Median of 0.7, 1.4, 1.5.
    expect(ratios[1]).toBe(1.4);
    expect(ratios[4]).toBe(1.4);
  });

  test("an even count of known pages takes the middle mean", () => {
    const sizes = [{ width: 10, height: 10 }, { width: 10, height: 20 }, null];
    expect(mobileReaderScrollPageRatios(3, (index) => sizes[index])[2]).toBe(1.5);
  });

  test("nothing known falls back to 1:1.45; invalid sizes count as unknown", () => {
    expect(
      mobileReaderScrollPageRatios(2, (index) =>
        index === 0 ? { width: 0, height: 100 } : null,
      ),
    ).toEqual([
      MOBILE_READER_SCROLL_DEFAULT_PAGE_RATIO,
      MOBILE_READER_SCROLL_DEFAULT_PAGE_RATIO,
    ]);
    expect(mobileReaderScrollPageRatios(0, () => null)).toEqual([]);
  });
});

describe("scroll layout offsets", () => {
  // Three pages: 100, 200, 300 tall; 8pt gaps above pages 1 and 2.
  const layout = buildMobileReaderScrollLayout([100, 200, 300], [0, 8, 8]);

  test("cells start after the previous pages and their gaps", () => {
    expect(layout.starts).toEqual([0, 100, 308]);
    expect(layout.length).toBe(616);
  });

  test("missing gaps take the default (none above the first page)", () => {
    const fallback = buildMobileReaderScrollLayout([100, 100, 100], null, 8);
    expect(fallback.gaps).toEqual([0, 8, 8]);
  });

  test("getItemLayout includes the list's top padding and the cell's own gap", () => {
    expect(mobileReaderScrollItemLayout(layout, 0, 150)).toEqual({ index: 0, offset: 150, length: 100 });
    expect(mobileReaderScrollItemLayout(layout, 2, 150)).toEqual({ index: 2, offset: 458, length: 308 });
  });

  test("a page's offset puts its picture top right below the top padding", () => {
    // Page 0 at its top is the very top of the chapter (title area visible).
    expect(mobileReaderScrollOffsetForAnchor(layout, 0)).toBe(0);
    expect(mobileReaderScrollOffsetForAnchor(layout, 1)).toBe(108);
    expect(mobileReaderScrollOffsetForAnchor(layout, 2, 0.5)).toBe(316 + 150);
    // Clamped index and fraction.
    expect(mobileReaderScrollOffsetForAnchor(layout, 9, 2)).toBe(316 + 300);
    expect(mobileReaderScrollOffsetForAnchor(layout, -3)).toBe(0);
  });

  test("anchor and offset round-trip", () => {
    for (const [pageIndex, fraction] of [[0, 0], [0, 0.25], [1, 0], [1, 0.9], [2, 0.5]] as const) {
      const offset = mobileReaderScrollOffsetForAnchor(layout, pageIndex, fraction);
      const anchor = mobileReaderScrollAnchorForOffset(layout, offset);
      expect(anchor?.pageIndex).toBe(pageIndex);
      expect(anchor?.fraction).toBeCloseTo(fraction, 6);
    }
  });

  test("a gap belongs to the page above it; past the end clamps to the last page", () => {
    expect(mobileReaderScrollAnchorForOffset(layout, 104)).toEqual({ pageIndex: 0, fraction: 1 });
    expect(mobileReaderScrollAnchorForOffset(layout, 5000)).toEqual({ pageIndex: 2, fraction: 1 });
    expect(mobileReaderScrollAnchorForOffset(buildMobileReaderScrollLayout([], []), 10)).toBeNull();
  });

  test("an anchor survives a relayout at another width", () => {
    const narrow = buildMobileReaderScrollLayout([100, 200, 300], [0, 8, 8]);
    const wide = buildMobileReaderScrollLayout([150, 300, 450], [0, 8, 8]);
    const anchor = mobileReaderScrollAnchorForOffset(narrow, mobileReaderScrollOffsetForAnchor(narrow, 1, 0.4))!;
    const offset = mobileReaderScrollOffsetForAnchor(wide, anchor.pageIndex, anchor.fraction);
    expect(offset).toBeCloseTo(158 + 120, 6);
  });
});

describe("mobileReaderScrollIndexViewOffset", () => {
  test("lands the page below the chrome padding instead of under it", () => {
    // FlatList: offset = cellOffset (padding + cells above) - viewOffset.
    expect(mobileReaderScrollIndexViewOffset(150, 8)).toBe(142);
    expect(mobileReaderScrollIndexViewOffset(150, 0)).toBe(150);
    expect(mobileReaderScrollIndexViewOffset(Number.NaN, 8)).toBe(-8);
  });
});

describe("isMobileReaderScrollSeekLanded", () => {
  test("within tolerance of the target", () => {
    expect(isMobileReaderScrollSeekLanded({ currentOffset: 1001, targetOffset: 1000, maximumOffset: 5000 })).toBe(true);
    expect(isMobileReaderScrollSeekLanded({ currentOffset: 900, targetOffset: 1000, maximumOffset: 5000 })).toBe(false);
  });

  test("a target past the scrollable end lands at the end", () => {
    expect(isMobileReaderScrollSeekLanded({ currentOffset: 4000, targetOffset: 4500, maximumOffset: 4000 })).toBe(true);
  });

  test("unknown maximum: only the target itself", () => {
    expect(isMobileReaderScrollSeekLanded({ currentOffset: 0, targetOffset: 400, maximumOffset: 0 })).toBe(false);
    expect(isMobileReaderScrollSeekLanded({ currentOffset: 400, targetOffset: 400, maximumOffset: 0 })).toBe(true);
  });
});

describe("resume round trip (save on one layout, restore on another)", () => {
  // 20 pages, 650pt wide. Saved with every page decoded; reopened after a
  // relaunch where only some heights are known and the rest stand in at the
  // chapter's typical ratio.
  const width = 650;
  const real = Array.from({ length: 20 }, (_, index) => (index % 3 === 0 ? 1.62 : 1.4) * width);
  const saved = buildMobileReaderScrollLayout(real, null, 8, real.map(() => true));
  const estimatedKnown = real.map((_, index) => index >= 9);
  const estimated = buildMobileReaderScrollLayout(
    real.map((height, index) => (estimatedKnown[index] ? height : 1.45 * width)),
    null,
    8,
    estimatedKnown,
  );

  test("the spot on the page survives different heights above it", () => {
    const leftAt = mobileReaderScrollOffsetForAnchor(saved, 9, 0) + 0.37 * real[9]!;
    const anchor = mobileReaderScrollAnchorForOffset(saved, leftAt)!;
    expect(anchor.pageIndex).toBe(9);
    // Restore against the estimated layout: same page, same point of it at
    // the reading line (pixels into the page), though the offset differs.
    const reopenedAt = mobileReaderScrollOffsetForAnchor(estimated, anchor.pageIndex, anchor.fraction);
    expect(reopenedAt).not.toBeCloseTo(leftAt, 0);
    const pageTop = mobileReaderScrollOffsetForAnchor(estimated, 9, 0);
    expect(reopenedAt - pageTop).toBeCloseTo(leftAt - mobileReaderScrollOffsetForAnchor(saved, 9, 0), 6);
    // And once the heights above resolve, re-placing lands on the exact spot.
    expect(
      mobileReaderScrollOffsetForAnchor(saved, anchor.pageIndex, anchor.fraction),
    ).toBeCloseTo(leftAt, 6);
  });

  test("a seek is held until the pages up to the viewport top are real", () => {
    // Near the page's top: the page above still shows under the chrome.
    expect(isMobileReaderScrollSeekSettled(estimated, 9, 0.05, 150)).toBe(false);
    // Deep into the page: only the page itself decides.
    expect(isMobileReaderScrollSeekSettled(estimated, 9, 0.5, 150)).toBe(true);
    // The target page itself standing in.
    expect(isMobileReaderScrollSeekSettled(estimated, 5, 0.5, 150)).toBe(false);
    // No flags: everything real.
    expect(isMobileReaderScrollSeekSettled(buildMobileReaderScrollLayout(real, null, 8), 9, 0, 150)).toBe(true);
  });
});

describe("page natural size memory", () => {
  afterEach(() => clearMobileReaderPageNaturalSizes());

  test("remembers valid sizes by page identity", () => {
    rememberMobileReaderPageNaturalSize("page-a", { width: 800, height: 1200 });
    rememberMobileReaderPageNaturalSize("page-b", { width: 0, height: 1200 });
    expect(recallMobileReaderPageNaturalSize("page-a")).toEqual({ width: 800, height: 1200 });
    expect(recallMobileReaderPageNaturalSize("page-b")).toBeUndefined();
    expect(recallMobileReaderPageNaturalSize("")).toBeUndefined();
  });
});
