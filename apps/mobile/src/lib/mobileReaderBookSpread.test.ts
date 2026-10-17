import { describe, expect, test } from "bun:test";
import type { MobileWindowLayout, WindowReservedRegion } from "./mobileWindowLayout";
import { mobileReaderPoseLayout } from "./mobileReaderPoseLayout";
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

describe("book posture: each page in its own pane, leaning on the fold", () => {
  for (const [label, inset, sideBar] of [["no vertical bar", 0, false], ["beside the vertical bar", 84, true]] as const) {
    test(label, () => {
      const [left, right] = placedPages(book(inset), sideBar);
      // Against the fold, never on it.
      expect(left!.x + left!.width).toBeCloseTo(fold.x, 5);
      expect(right!.x).toBeCloseTo(fold.x + fold.width, 5);
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
