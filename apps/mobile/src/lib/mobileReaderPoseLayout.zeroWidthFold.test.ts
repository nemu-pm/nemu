import { describe, expect, test } from "bun:test";
import { mobileReaderPoseLayout, mobileReaderTapExcluded } from "./mobileReaderPoseLayout";
import { MOBILE_FOLD_MIN_GUTTER, type MobileWindowLayout } from "./mobileWindowLayout";

// Pixel Fold inner display (841×701dp), half-opened: WindowManager reports a
// physical zero-width fold line, unlike iOS's 40pt division with margins.
const pixelFoldBook: MobileWindowLayout = {
  width: 841,
  height: 701,
  supported: true,
  divisions: [{ id: "fold-0", x: 420.5, y: 0, width: 0, height: 701, active: true }],
  occlusions: [],
};
const pixelFoldTabletop: MobileWindowLayout = {
  width: 701,
  height: 841,
  supported: true,
  divisions: [{ id: "fold-0", x: 0, y: 420.5, width: 701, height: 0, active: true }],
  occlusions: [],
};
const base = {
  fallbackInsets: { top: 0, left: 0, bottom: 0, right: 0 },
  paged: true,
  pageCount: 20,
  rtl: false,
  learningOpen: false,
};

describe("reader pose: zero-width Android fold", () => {
  test("book: a spread puts one page per pane with the minimum gutter off the crease", () => {
    const result = mobileReaderPoseLayout({ ...base, layout: pixelFoldBook, twoPage: true });
    expect(result.posture).toBe("book");
    expect(result.spread).toBe(true);
    expect(result.foldGap).toEqual({ start: 420.5 - MOBILE_FOLD_MIN_GUTTER / 2, end: 420.5 + MOBILE_FOLD_MIN_GUTTER / 2 });
    expect(mobileReaderTapExcluded({ x: 420.5, y: 300 }, result.tapExclusions, result.foldGap)).toBe(true);
  });
  test("tabletop: the page sits in the top pane above the gutter", () => {
    const result = mobileReaderPoseLayout({ ...base, layout: pixelFoldTabletop, twoPage: false });
    expect(result.posture).toBe("notebook");
    expect(result.stage.y + result.stage.height).toBe(420.5 - MOBILE_FOLD_MIN_GUTTER / 2);
  });
  test("tabletop: two-page honours the setting when the top pane is wider than tall", () => {
    const result = mobileReaderPoseLayout({ ...base, layout: pixelFoldTabletop, twoPage: true });
    const wide = result.stage.width > result.stage.height;
    expect(result.twoPageAvailable).toBe(wide);
    expect(result.spread).toBe(wide);
    expect(result.spreadSlots).toBeUndefined();
    expect(result.foldGap).toBeNull();
  });
});
