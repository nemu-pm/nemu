import { describe, expect, test } from "bun:test";
import type { MobileWindowLayout, WindowReservedRegion } from "./mobileWindowLayout";
import {
  mobileReaderAnticipatedWindowLayout,
  mobileReaderPoseLayout,
  mobileReaderSpreadHalves,
  type MobileReaderPoseLayout,
} from "./mobileReaderPoseLayout";
import { getMobileReaderSpreadSheetFrames, mobileReaderSpreadPageAlignment } from "./mobileReaderSpreads";

// The Duo's open display half folded like a book: a 40pt fold at x 455.5–495.5.
const fold: WindowReservedRegion = { id: "hinge", x: 455.5, y: 0, width: 40, height: 669, active: true };
const book = (rightInset: number): MobileWindowLayout => ({
  width: 951, height: 669, supported: true, divisions: [fold], occlusions: [],
  verticalBarEdge: "trailing", layoutDirection: "ltr",
  safeAreaInsets: { top: 0, left: 0, bottom: 20, right: rightInset },
});
const page = { width: 1132, height: 1600 };

/** Where the spread's two pages sit (stage-local = window here), as the gallery places them. */
function placedPages(layout: MobileWindowLayout, sideBar: boolean) {
  const pose = mobileReaderPoseLayout({
    layout, fallbackInsets: { top: 0, left: 0, bottom: 0, right: 0 },
    paged: true, pageCount: 10, twoPage: true, spreadMode: "auto", rtl: true, sideBar,
  });
  expect(pose.posture).toBe("book");
  expect(pose.spread).toBe(true);
  const slots = pose.spreadSlots!;
  const frames = getMobileReaderSpreadSheetFrames({ slots: [slots[0]!, slots[1]!], sizes: [page, page] });
  return slots.map((slot, index) => {
    const frame = frames[index]!;
    const align = mobileReaderSpreadPageAlignment(index, 2);
    const x = align === "flex-end" ? slot.x + slot.width - frame.width : slot.x;
    return { x: pose.stage.x + x, y: pose.stage.y + slot.y + (slot.height - frame.height) / 2, ...frame };
  });
}

describe("book posture: the spread's pages lean on the spine", () => {
  for (const [label, inset, sideBar] of [["no vertical bar", 0, false], ["beside the vertical bar", 84, true]] as const) {
    test(label, () => {
      const [left, right] = placedPages(book(inset), sideBar);
      if (sideBar) {
        // Beside the bar column: each page in its own pane, against the fold, never on it.
        expect(left!.x + left!.width).toBeCloseTo(fold.x, 5);
        expect(right!.x).toBeCloseTo(fold.x + fold.width, 5);
      } else {
        // The fold is on the window's centre line: the pages meet there, as flat.
        expect(left!.x + left!.width).toBeCloseTo(475.5, 5);
        expect(right!.x).toBeCloseTo(475.5, 5);
      }
      // One sheet: the same height, the page shape kept (no crop, no stretch).
      expect(left!.height).toBeCloseTo(right!.height, 5);
      expect(left!.width / left!.height).toBeCloseTo(page.width / page.height, 5);
      // Inside the display (and clear of the vertical bar column).
      expect(left!.x).toBeGreaterThanOrEqual(0);
      expect(right!.x + right!.width).toBeLessThanOrEqual(951 - inset + 1e-6);
      expect(left!.y).toBeGreaterThanOrEqual(0);
      expect(left!.y + left!.height).toBeLessThanOrEqual(669 + 1e-6);
    });
  }
});

// Fully open ⇄ half folded with a two-page spread on the Duo: the pages stay
// exactly where they are (the spine at x 475.5); only the chrome follows.
describe("Duo two-page spread: fully open ⇄ half folded never moves a page", () => {
  const inactive: WindowReservedRegion = { ...fold, active: false };
  const duo = (division: WindowReservedRegion, hinge: MobileWindowLayout["hinge"]): MobileWindowLayout => ({
    width: 951, height: 669, supported: true, divisions: [division], occlusions: [],
    verticalBarEdge: null, layoutDirection: "ltr", hinge,
    safeAreaInsets: { top: 0, left: 0, bottom: 20, right: 0 },
  });
  const flat = duo(inactive, "fullyOpen");
  const folded = duo(fold, "partiallyOpen"); // active region 455.5–495.5
  const poseOf = (layout: MobileWindowLayout, rtl: boolean) => mobileReaderPoseLayout({
    layout, fallbackInsets: { top: 0, left: 0, bottom: 0, right: 0 },
    paged: true, pageCount: 10, twoPage: true, spreadMode: "double", rtl,
  });

  /**
   * The spread's page rects (window coordinates) as the reader places them:
   * `getReaderImageFrameSize` fits the pair in the pose's slots (or, flat,
   * in the stage halves less the page side insets), and the gallery lays the
   * slots out (absolute, or the flat spread's flex halves), each page against
   * the spine, centred vertically.
   */
  function spreadPages(pose: MobileReaderPoseLayout, sizes: [{ width: number; height: number }, { width: number; height: number }]) {
    const safeWidth = pose.constrained
      ? pose.spreadSlots ? Math.min(...pose.spreadSlots.map((slot) => slot.width)) * 2 : pose.stage.width
      : pose.stage.width - pose.pageSideInsets.left - pose.pageSideInsets.right;
    const maxHeight = pose.constrained
      ? Math.min(pose.stage.height, ...(pose.spreadSlots?.map((slot) => slot.height) ?? [pose.stage.height]))
      : Math.max(260, pose.stage.height);
    const half = { width: safeWidth / 2, height: maxHeight };
    const fitSlots = pose.spreadSlots ? [pose.spreadSlots[0]!, pose.spreadSlots[1]!] : [half, half];
    const frames = getMobileReaderSpreadSheetFrames({ slots: [fitSlots[0]!, fitSlots[1]!], sizes });
    const boxes = pose.spreadSlots ?? mobileReaderSpreadHalves(pose.stage);
    return boxes.map((box, index) => {
      const frame = frames[index]!;
      const x = mobileReaderSpreadPageAlignment(index, 2) === "flex-end" ? box.x + box.width - frame.width : box.x;
      return { x: pose.stage.x + x, y: pose.stage.y + box.y + (box.height - frame.height) / 2, ...frame };
    });
  }

  const pairs: Array<[string, [{ width: number; height: number }, { width: number; height: number }]]> = [
    ["matching portrait pages", [page, page]],
    ["pages of different shapes", [{ width: 1100, height: 1600 }, { width: 1200, height: 1650 }]],
  ];
  for (const rtl of [false, true]) {
    for (const [label, sizes] of pairs) {
      test(`${rtl ? "rtl" : "ltr"}, ${label}: page rects within 1pt, the spine at 475.5`, () => {
        const open = poseOf(flat, rtl);
        const book = poseOf(folded, rtl);
        expect(open.posture).toBe("flat");
        expect(book.posture).toBe("book");
        expect(book.spread).toBe(true);
        // The same stage, slot geometry and constrained flag: nothing to re-lay out.
        expect(book.stage).toEqual(open.stage);
        expect(book.constrained).toBe(open.constrained);
        expect(book.spreadSlots).toEqual(mobileReaderSpreadHalves(open.stage));
        // The fold still swallows taps.
        expect(book.foldGap).toEqual({ start: 455.5, end: 495.5 });
        const a = spreadPages(open, sizes);
        const b = spreadPages(book, sizes);
        a.forEach((rect, index) => {
          for (const key of ["x", "y", "width", "height"] as const) {
            expect(Math.abs(rect[key] - b[index]![key])).toBeLessThanOrEqual(1);
          }
        });
        expect(b[0]!.x + b[0]!.width).toBeCloseTo(475.5, 5);
        expect(b[1]!.x).toBeCloseTo(475.5, 5);
      });
    }
  }

  test("the hinge leading the region adds no layout pass for a spread (no anticipation, same geometry)", () => {
    const hinted = duo(inactive, "partiallyOpen");
    // A spread across a centred fold: the hint is skipped, the window stays as reported.
    expect(mobileReaderAnticipatedWindowLayout(hinted, { keepsSpread: true })).toBe(hinted);
    // Anticipated anyway (single page, or not a spread): the fold is laid out early as before.
    const anticipated = mobileReaderAnticipatedWindowLayout(hinted);
    expect(anticipated.divisions[0]!.active).toBe(true);
    // And even then a spread's pages are where they were.
    expect(spreadPages(poseOf(anticipated, false), [page, page])).toEqual(spreadPages(poseOf(flat, false), [page, page]));
    // An off-centre fold is still anticipated for a spread.
    const offCentre = duo({ ...inactive, x: 380 }, "partiallyOpen");
    expect(mobileReaderAnticipatedWindowLayout(offCentre, { keepsSpread: true }).divisions[0]!.active).toBe(true);
  });

  test("an off-centre fold keeps its panes; a single page keeps its pane", () => {
    const offCentre = duo({ ...fold, x: 380 }, "partiallyOpen");
    const spread = poseOf(offCentre, false);
    expect(spread.posture).toBe("book");
    expect(spread.constrained).toBe(true);
    expect(spread.spreadSlots).toEqual([
      { x: 0, y: 0, width: 380, height: 669 },
      { x: 420, y: 0, width: 531, height: 669 },
    ]);
    expect(spread.foldGap).toEqual({ start: 380, end: 420 });
    const single = mobileReaderPoseLayout({
      layout: folded, fallbackInsets: { top: 0, left: 0, bottom: 0, right: 0 },
      paged: true, pageCount: 10, twoPage: false, spreadMode: "single", rtl: false,
    });
    expect(single.spread).toBe(false);
    expect(single.constrained).toBe(true);
    expect(single.spreadSlots).toBeUndefined();
    expect(single.stage).toEqual({ x: 0, y: 0, width: 455.5, height: 669 });
  });
});
