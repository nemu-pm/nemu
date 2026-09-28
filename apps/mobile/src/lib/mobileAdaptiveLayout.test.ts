import { describe, expect, test } from "bun:test";
import { mobileAdaptiveGridColumns, mobileAdaptiveLayout, mobileFoldSplitForContainer, mobileVerticalBarSide } from "./mobileAdaptiveLayout";
import { MOBILE_FOLD_MIN_GUTTER, type MobileWindowLayout, type WindowReservedRegion } from "./mobileWindowLayout";

const hinge = (x: number, y: number, width: number, height: number, active = true): WindowReservedRegion => ({ id: "hinge", x, y, width, height, active });
const duoInnerLandscape = (divisions: WindowReservedRegion[] = []): MobileWindowLayout => ({ width: 951, height: 669, supported: true, divisions, occlusions: [] });

describe("mobile adaptive layout", () => {
  test("outer display and flat inner display are flat; width classes follow Material breaks", () => {
    expect(mobileAdaptiveLayout({ width: 466, height: 678, supported: true, divisions: [], occlusions: [] })).toMatchObject({ posture: "flat", widthClass: "compact", regularWidth: false, fold: null });
    expect(mobileAdaptiveLayout(duoInnerLandscape([hinge(465, 0, 21, 669, false)]))).toMatchObject({ posture: "flat", widthClass: "expanded", regularWidth: true });
    expect(mobileAdaptiveLayout({ width: 669, height: 951, supported: true, divisions: [], occlusions: [] }).widthClass).toBe("medium");
  });
  test("a vertical fold is book; a horizontal fold is notebook", () => {
    const book = mobileAdaptiveLayout(duoInnerLandscape([hinge(465, 0, 21, 669)]));
    expect(book.posture).toBe("book");
    expect(book.fold).toEqual({ x: 465, y: 0, width: 21, height: 669 });
    const notebook = mobileAdaptiveLayout({ width: 669, height: 951, supported: true, divisions: [hinge(0, 465, 669, 21)], occlusions: [] });
    expect(notebook.posture).toBe("notebook");
    expect(notebook.fold).toEqual({ x: 0, y: 465, width: 669, height: 21 });
  });
  test("fold split converts to container coordinates and ignores containers on one side", () => {
    const book = mobileAdaptiveLayout(duoInnerLandscape([hinge(465, 0, 21, 669)]));
    expect(mobileFoldSplitForContainer(book, { x: 60, y: 80, width: 860, height: 589 })).toEqual({
      axis: "horizontal",
      first: { x: 0, y: 0, width: 405, height: 589 },
      second: { x: 426, y: 0, width: 434, height: 589 },
      gutter: { start: 405, end: 426 },
    });
    expect(mobileFoldSplitForContainer(book, { x: 500, y: 0, width: 451, height: 669 })).toBeNull();
  });
  test("regular-width grids prefer an even column count", () => {
    expect(mobileAdaptiveGridColumns({ contentWidth: 900, minItemWidth: 150, gap: 12, preferEven: true }).columns).toBe(4);
    expect(mobileAdaptiveGridColumns({ contentWidth: 900, minItemWidth: 150, gap: 12, preferEven: false }).columns).toBe(5);
    expect(mobileAdaptiveGridColumns({ contentWidth: 340, minItemWidth: 150, gap: 12, preferEven: true }).columns).toBe(2);
  });
  test("vertical bar edge and safe area pass through; absent fields stay null", () => {
    const outer = mobileAdaptiveLayout({
      width: 466, height: 678, supported: true, divisions: [], occlusions: [],
      verticalBarEdge: "trailing", layoutDirection: "ltr",
      safeAreaInsets: { top: 0, left: 0, bottom: 20, right: 62 }, hinge: "closed",
    });
    expect(outer).toMatchObject({ verticalBarEdge: "trailing", verticalBarSide: "right", hinge: "closed" });
    expect(outer.safeAreaInsets).toEqual({ top: 0, left: 0, bottom: 20, right: 62 });
    const fallback = mobileAdaptiveLayout({ width: 390, height: 844, supported: false, divisions: [], occlusions: [] });
    expect(fallback).toMatchObject({ verticalBarEdge: null, verticalBarSide: null, safeAreaInsets: null, hinge: null });
    // A native null (inner portrait: bars stay horizontal) is not an edge.
    expect(mobileAdaptiveLayout({ width: 669, height: 951, supported: true, divisions: [], occlusions: [], verticalBarEdge: null }).verticalBarEdge).toBeNull();
  });
  test("vertical bar side resolves leading/trailing through the layout direction", () => {
    expect(mobileVerticalBarSide("trailing", "ltr")).toBe("right");
    expect(mobileVerticalBarSide("leading", "ltr")).toBe("left");
    expect(mobileVerticalBarSide("trailing", "rtl")).toBe("left");
    expect(mobileVerticalBarSide("leading", "rtl")).toBe("right");
    expect(mobileVerticalBarSide(null, "rtl")).toBeNull();
  });
  test("an Android half-opened zero-width fold is a book split with the minimum gutter", () => {
    // Pixel Fold inner display: WindowManager reports a physical zero-width line.
    const fold = mobileAdaptiveLayout({ width: 841, height: 701, supported: true, divisions: [hinge(420.5, 0, 0, 701)], occlusions: [], hinge: "partiallyOpen" });
    expect(fold.posture).toBe("book");
    expect(fold.fold).toEqual({ x: 420.5 - MOBILE_FOLD_MIN_GUTTER / 2, y: 0, width: MOBILE_FOLD_MIN_GUTTER, height: 701 });
    expect(fold.panels).toEqual([
      { x: 0, y: 0, width: 410.5, height: 701 },
      { x: 430.5, y: 0, width: 410.5, height: 701 },
    ]);
    // Tabletop: a zero-height horizontal line is a notebook fold with the same gutter.
    const tabletop = mobileAdaptiveLayout({ width: 701, height: 841, supported: true, divisions: [hinge(0, 420.5, 701, 0)], occlusions: [], hinge: "partiallyOpen" });
    expect(tabletop.posture).toBe("notebook");
    expect(tabletop.fold).toEqual({ x: 0, y: 410.5, width: 701, height: MOBILE_FOLD_MIN_GUTTER });
    const flat = mobileAdaptiveLayout({ width: 841, height: 701, supported: true, divisions: [hinge(420.5, 0, 0, 701, false)], occlusions: [], hinge: "fullyOpen" });
    expect(flat.posture).toBe("flat");
  });
  test("a zero-width fold splits a measured container with the same gutter as a reported region", () => {
    const pixelFold = mobileAdaptiveLayout({ width: 841, height: 701, supported: true, divisions: [hinge(420.5, 0, 0, 701)], occlusions: [] });
    // A page content box inside 16pt gutters, below a 100pt header.
    expect(mobileFoldSplitForContainer(pixelFold, { x: 16, y: 100, width: 809, height: 601 })).toEqual({
      axis: "horizontal",
      first: { x: 0, y: 0, width: 394.5, height: 601 },
      second: { x: 414.5, y: 0, width: 394.5, height: 601 },
      gutter: { start: 394.5, end: 414.5 },
    });
    // Duo's 40pt region (interaction margins included) is kept as reported.
    const duo = mobileAdaptiveLayout(duoInnerLandscape([hinge(455.5, 0, 40, 669)]));
    expect(mobileFoldSplitForContainer(duo, { x: 0, y: 0, width: 951, height: 669 })?.gutter).toEqual({ start: 455.5, end: 495.5 });
  });
});
