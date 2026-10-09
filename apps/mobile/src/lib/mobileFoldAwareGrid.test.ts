import { describe, expect, test } from "bun:test";
import {
  chunkMobileGridRows,
  mobileFoldAwareGridCellStyle,
  mobileFoldAwareGridColumnOffsets,
  mobileFoldAwareGridContentWidth,
  mobileFoldAwareGridLayout,
  mobileFoldPagerLayout,
  mobileNudgeOffFold,
  mobilePaneContentRegion,
} from "./mobileFoldAwareGrid";
import { mobileAdaptiveLayout, mobileFoldSplitForContainer } from "./mobileAdaptiveLayout";
import { MOBILE_FOLD_MIN_GUTTER } from "./mobileWindowLayout";

// Manga cover grid tuning (see mobileAdaptiveGrid.ts).
const covers = { minItemWidth: 104, gap: 12, minColumns: 2, maxColumns: 10 };

/** Every cell's [start, end] in content-box coordinates. */
function cellSpans(layout: ReturnType<typeof mobileFoldAwareGridLayout>) {
  return mobileFoldAwareGridColumnOffsets(layout).map((x) => [x, x + layout.itemWidth]);
}

describe("fold-aware grid: flat windows", () => {
  test("portrait iPhones keep three covers (compact width, odd allowed)", () => {
    for (const width of [375, 402, 440]) {
      const layout = mobileFoldAwareGridLayout({ ...covers, contentWidth: width - 32, preferEven: false });
      expect(layout.columns).toBe(3);
      expect(layout.foldAligned).toBe(false);
      expect(layout.columnMargins).toEqual([0, 12, 12]);
    }
  });
  test("Duo outer display (466pt, compact) packs by width", () => {
    expect(mobileFoldAwareGridLayout({ ...covers, contentWidth: 466 - 32, preferEven: false }).columns).toBe(3);
  });
  test("regular widths prefer an even column count", () => {
    // Duo inner landscape with the trailing system bars (≈85pt).
    expect(mobileFoldAwareGridLayout({ ...covers, contentWidth: 951 - 16 - 85, preferEven: true }).columns).toBe(6);
    // Duo inner portrait: bars stay horizontal.
    expect(mobileFoldAwareGridLayout({ ...covers, contentWidth: 669 - 32, preferEven: true }).columns).toBe(4);
    expect(mobileFoldAwareGridLayout({ ...covers, contentWidth: 669 - 32, preferEven: false }).columns).toBe(5);
  });
  test("cover width stays near the tuned size as the window grows (no scale-up)", () => {
    for (const contentWidth of [370, 637, 850, 919, 1334]) {
      const layout = mobileFoldAwareGridLayout({ ...covers, contentWidth, preferEven: contentWidth >= 568 });
      expect(layout.itemWidth).toBeGreaterThanOrEqual(104);
      expect(layout.itemWidth).toBeLessThan(104 * 1.5);
    }
  });
  test("a full row fits the content box", () => {
    const layout = mobileFoldAwareGridLayout({ ...covers, contentWidth: 919, preferEven: true });
    const spans = cellSpans(layout);
    expect(spans[spans.length - 1][1]).toBeLessThanOrEqual(919);
  });
});

describe("fold-aware grid: book posture", () => {
  // Duo inner landscape, fold 465–486 in window coordinates, 16pt gutters.
  const fold = { start: 465 - 16, end: 486 - 16 };

  test("the middle gutter coincides with the fold and no cell crosses it", () => {
    const layout = mobileFoldAwareGridLayout({ ...covers, contentWidth: 951 - 32, preferEven: true, fold });
    expect(layout.foldAligned).toBe(true);
    expect(layout.columns % 2).toBe(0);
    const spans = cellSpans(layout);
    const half = layout.columns / 2;
    expect(spans[0][0]).toBe(0);
    expect(spans[half - 1][1]).toBeLessThanOrEqual(fold.start);
    expect(spans[half][0]).toBe(fold.end);
    for (const [start, end] of spans) {
      expect(end <= fold.start || start >= fold.end).toBe(true);
      expect(start).toBeGreaterThanOrEqual(0);
      expect(end).toBeLessThanOrEqual(951 - 32);
    }
  });

  test("keeps the flat column count across fold/unfold when covers barely shrink", () => {
    const flat = mobileFoldAwareGridLayout({ ...covers, contentWidth: 951 - 32, preferEven: true });
    const folded = mobileFoldAwareGridLayout({ ...covers, contentWidth: 951 - 32, preferEven: true, fold });
    expect(flat.columns).toBe(8);
    expect(folded.columns).toBe(8);
    expect(folded.itemWidth).toBeGreaterThanOrEqual(104 * 0.9);
  });

  test("asymmetric panes (trailing system bars) use equal half-grids aligned to the page gutter", () => {
    const contentWidth = 951 - 16 - 85; // right pane narrowed by the vertical bars
    const layout = mobileFoldAwareGridLayout({ ...covers, contentWidth, preferEven: true, fold });
    const spans = cellSpans(layout);
    const half = layout.columns / 2;
    expect(spans[half - 1][1]).toBeLessThanOrEqual(fold.start);
    expect(spans[half][0]).toBe(fold.end);
    // Same cell width on both sides; the wider (leading) pane keeps its slack
    // beside the fold so the grid stays on the page gutter (section headers).
    expect(spans[0][0]).toBe(0);
    expect(spans[spans.length - 1][1]).toBeLessThanOrEqual(contentWidth);
  });

  test("a narrow fold still gets at least the ordinary gap", () => {
    const layout = mobileFoldAwareGridLayout({ ...covers, contentWidth: 919, preferEven: true, fold: { start: 459, end: 460 } });
    const spans = cellSpans(layout);
    const half = layout.columns / 2;
    expect(spans[half][0] - spans[half - 1][1]).toBeGreaterThanOrEqual(12);
    expect(spans[half - 1][1]).toBeLessThanOrEqual(459);
    expect(spans[half][0]).toBeGreaterThanOrEqual(460);
  });

  test("a zero-width fold (container-local, start == end) is still a fold", () => {
    const layout = mobileFoldAwareGridLayout({ ...covers, contentWidth: 809, preferEven: true, fold: { start: 404.5, end: 404.5 } });
    expect(layout.foldAligned).toBe(true);
    const spans = cellSpans(layout);
    const half = layout.columns / 2;
    expect(spans[half - 1][1]).toBeLessThanOrEqual(404.5 - 6);
    expect(spans[half][0]).toBeGreaterThanOrEqual(404.5 + 6);
  });

  test("a zero-width Pixel Fold hinge through the window pipeline aligns the grid like Duo", () => {
    const adaptive = mobileAdaptiveLayout({
      width: 841, height: 701, supported: true,
      divisions: [{ id: "fold-0", x: 420.5, y: 0, width: 0, height: 701, active: true }], occlusions: [],
    });
    const split = mobileFoldSplitForContainer(adaptive, { x: 0, y: 0, width: 841, height: 701 });
    expect(split).not.toBeNull();
    // A full-bleed list with 16pt page gutters, as useMobileFoldAwareGrid does.
    const fold = { start: split!.gutter.start - 16, end: split!.gutter.end - 16 };
    const layout = mobileFoldAwareGridLayout({ ...covers, contentWidth: 841 - 32, preferEven: true, fold });
    expect(layout.foldAligned).toBe(true);
    const spans = cellSpans(layout);
    const half = layout.columns / 2;
    expect(spans[half - 1][1]).toBeLessThanOrEqual(fold.start);
    expect(spans[half][0]).toBeGreaterThanOrEqual(fold.end);
    expect(spans[half][0] - spans[half - 1][1]).toBeGreaterThanOrEqual(MOBILE_FOLD_MIN_GUTTER);
  });

  test("source cards: one per pane in book, two flat", () => {
    const cards = { minItemWidth: 290, gap: 12, maxColumns: 4 };
    expect(mobileFoldAwareGridLayout({ ...cards, contentWidth: 850, preferEven: true }).columns).toBe(2);
    const folded = mobileFoldAwareGridLayout({ ...cards, contentWidth: 850, preferEven: true, fold });
    expect(folded.columns).toBe(2);
    expect(folded.foldAligned).toBe(true);
    expect(folded.columnMargins[0]).toBe(0);
    expect(folded.columnMargins[0] + folded.itemWidth + folded.columnMargins[1]).toBe(fold.end);
  });

  test("a fold outside the content box changes nothing", () => {
    const flat = mobileFoldAwareGridLayout({ ...covers, contentWidth: 400, preferEven: false });
    expect(mobileFoldAwareGridLayout({ ...covers, contentWidth: 400, preferEven: false, fold: { start: 420, end: 440 } })).toEqual(flat);
    expect(mobileFoldAwareGridLayout({ ...covers, contentWidth: 400, preferEven: false, fold: { start: -30, end: -5 } })).toEqual(flat);
  });

  test("cell style follows the column of a row-major index", () => {
    const layout = mobileFoldAwareGridLayout({ ...covers, contentWidth: 919, preferEven: true, fold });
    const half = layout.columns / 2;
    expect(mobileFoldAwareGridCellStyle(layout, 0).marginLeft).toBe(layout.columnMargins[0]);
    const foldMargin = layout.columnMargins[half];
    expect(mobileFoldAwareGridCellStyle(layout, half).marginLeft).toBe(foldMargin);
    expect(mobileFoldAwareGridCellStyle(layout, layout.columns + half).marginLeft).toBe(foldMargin);
    expect(foldMargin).toBeGreaterThanOrEqual(fold.end - fold.start);
    expect(mobileFoldAwareGridCellStyle(layout, 1).width).toBe(layout.itemWidth);
  });
});

describe("grid rows", () => {
  test("chunks row-major with a partial last row", () => {
    expect(chunkMobileGridRows([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunkMobileGridRows([], 3)).toEqual([]);
    expect(chunkMobileGridRows([1], 0)).toEqual([[1]]);
  });
});

describe("featured pager", () => {
  test("flat: one full-width card per page (no 520pt cap)", () => {
    expect(mobileFoldPagerLayout({ containerWidth: 850, margin: 4 })).toEqual({
      cardWidth: 846, stride: 846, viewportWidth: 846, foldAligned: false,
    });
  });
  test("book: each card rests in one pane and paging moves one pane", () => {
    const layout = mobileFoldPagerLayout({ containerWidth: 850, margin: 4, fold: { start: 449, end: 470 } });
    expect(layout.foldAligned).toBe(true);
    expect(layout.stride).toBe(470);
    // Card k at [0, w] ends before the fold; card k+1 at [stride, stride + w] fits the trailing pane.
    expect(layout.cardWidth).toBeLessThanOrEqual(449);
    expect(layout.stride + layout.cardWidth).toBeLessThanOrEqual(850);
  });
  test("panes too narrow for a featured card stay flat", () => {
    expect(mobileFoldPagerLayout({ containerWidth: 400, fold: { start: 190, end: 210 } }).foldAligned).toBe(false);
  });
  test("book with a zero-width fold: cards still rest one per pane, clear of the crease", () => {
    const layout = mobileFoldPagerLayout({ containerWidth: 809, margin: 4, fold: { start: 404.5, end: 404.5 } });
    expect(layout.foldAligned).toBe(true);
    expect(layout.stride).toBe(404.5 + MOBILE_FOLD_MIN_GUTTER / 2);
    expect(layout.cardWidth).toBeLessThanOrEqual(404.5 - MOBILE_FOLD_MIN_GUTTER / 2 - 4);
    expect(layout.viewportWidth).toBe(809);
  });
});

describe("fixed elements avoid the fold", () => {
  const fold = { start: 465, end: 486 };
  test("clear frames stay put", () => {
    expect(mobileNudgeOffFold({ start: 100, size: 44 }, fold)).toBe(0);
    expect(mobileNudgeOffFold({ start: 486, size: 44 }, fold)).toBe(0);
    expect(mobileNudgeOffFold({ start: 421, size: 44 }, fold)).toBe(0);
    expect(mobileNudgeOffFold({ start: 470, size: 44 }, null)).toBe(0);
  });
  test("moves to the nearer pane", () => {
    // Mostly above the fold: move up so it ends at the fold's start.
    expect(mobileNudgeOffFold({ start: 440, size: 44 }, fold)).toBe(465 - 484);
    // Mostly below: move down to start at the fold's end.
    expect(mobileNudgeOffFold({ start: 470, size: 44 }, fold)).toBe(16);
  });
  test("respects bounds, and never rearranges when neither side fits", () => {
    expect(mobileNudgeOffFold({ start: 440, size: 44 }, fold, { min: 440 })).toBe(486 - 440);
    expect(mobileNudgeOffFold({ start: 470, size: 44 }, fold, { max: 520 })).toBe(465 - 514);
    expect(mobileNudgeOffFold({ start: 400, size: 200 }, fold, { min: 400, max: 600 })).toBe(0);
  });
  test("a zero-width fold still pushes a straddling element off the crease", () => {
    const line = { start: 420, end: 420 };
    expect(mobileNudgeOffFold({ start: 400, size: 44 }, line)).toBe(420 + MOBILE_FOLD_MIN_GUTTER / 2 - 400);
    expect(mobileNudgeOffFold({ start: 380, size: 44 }, line)).toBe(420 - MOBILE_FOLD_MIN_GUTTER / 2 - 424);
    expect(mobileNudgeOffFold({ start: 100, size: 44 }, line)).toBe(0);
  });
});

describe("pane content region (empty / loading / error states)", () => {
  const window = { windowHeight: 669 };
  test("flat: full width, readable max width", () => {
    expect(mobilePaneContentRegion({ ...window, container: { x: 16, y: 90, width: 850 }, posture: "flat", fold: null }))
      .toEqual({ x: 0, y: 0, width: 850, height: 0, contentWidth: 480 });
    expect(mobilePaneContentRegion({ ...window, container: { x: 16, y: 90, width: 370 }, posture: "flat", fold: null }).contentWidth).toBe(370);
  });
  test("book: centered in the leading pane", () => {
    const region = mobilePaneContentRegion({
      ...window, container: { x: 16, y: 90, width: 850 }, posture: "book", fold: { x: 465, y: 0, width: 21, height: 669 },
    });
    expect(region).toMatchObject({ x: 0, width: 449, height: 0 });
    expect(region.contentWidth).toBe(449);
  });
  test("book with a zero-width hinge: the adaptive fold keeps the placeholder in one pane", () => {
    const adaptive = mobileAdaptiveLayout({
      width: 841, height: 701, supported: true,
      divisions: [{ id: "fold-0", x: 420.5, y: 0, width: 0, height: 701, active: true }], occlusions: [],
    });
    const region = mobilePaneContentRegion({
      windowHeight: 701, container: { x: 16, y: 90, width: 809 }, posture: adaptive.posture, fold: adaptive.fold,
    });
    expect(region).toMatchObject({ x: 0, width: 420.5 - MOBILE_FOLD_MIN_GUTTER / 2 - 16 });
  });
  test("book: the trailing pane when the leading one is too narrow", () => {
    const region = mobilePaneContentRegion({
      ...window, container: { x: 300, y: 90, width: 600 }, posture: "book", fold: { x: 400, y: 0, width: 20, height: 669 },
    });
    expect(region).toMatchObject({ x: 120, width: 480 });
  });
  test("notebook: fills the top pane below the chrome, else the bottom pane", () => {
    const fold = { x: 0, y: 465, width: 669, height: 21 };
    expect(mobilePaneContentRegion({ windowHeight: 951, container: { x: 16, y: 110, width: 637 }, posture: "notebook", fold }))
      .toMatchObject({ y: 0, height: 355 });
    expect(mobilePaneContentRegion({ windowHeight: 951, bottomInset: 80, container: { x: 16, y: 380, width: 637 }, posture: "notebook", fold }))
      .toMatchObject({ y: 106, height: 951 - 80 - 380 - 106 });
  });
  test("result does not depend on the container height (no measurement feedback)", () => {
    const fold = { x: 0, y: 465, width: 669, height: 21 };
    const a = mobilePaneContentRegion({ windowHeight: 951, container: { x: 16, y: 110, width: 637 }, posture: "notebook", fold });
    const b = mobilePaneContentRegion({ windowHeight: 951, container: { x: 16, y: 110, width: 637, height: 355 } as never, posture: "notebook", fold });
    expect(a).toEqual(b);
  });
});

describe("fold-aware grid: content width", () => {
  const pageGutters = { left: 16, right: 16 };
  test("a measured full-bleed list loses its gutters; a content box keeps its width", () => {
    expect(mobileFoldAwareGridContentWidth({ containerWidth: 402, windowWidth: 402, insets: pageGutters, pageGutters })).toBe(370);
    expect(mobileFoldAwareGridContentWidth({ containerWidth: 370, windowWidth: 402, insets: { left: 0, right: 0 }, pageGutters })).toBe(370);
  });
  test("before measurement both start from the window inside the gutters", () => {
    // A content-box container (skeletons, home list stacks) must not guess the
    // full window width, which can fit one column more than the real box.
    for (const insets of [pageGutters, { left: 0, right: 0 }]) {
      expect(mobileFoldAwareGridContentWidth({ containerWidth: null, windowWidth: 402, insets, pageGutters })).toBe(370);
    }
    expect(mobileFoldAwareGridContentWidth({ containerWidth: null, windowWidth: 20, insets: pageGutters, pageGutters })).toBe(0);
  });
});
