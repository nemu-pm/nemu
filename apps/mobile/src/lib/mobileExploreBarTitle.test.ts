import { describe, expect, test } from "bun:test";
import {
  getMobileExploreBarTitleBookFrame,
  getMobileExploreBarTitleCentredWidth,
  getMobileExploreBarTitleMaxWidth,
  getMobileExploreBarTitleInlineItems,
  getMobileExploreBarTitleShift,
  getMobileExploreBarTitleShown,
  getMobileExploreBarTitleSlotX,
  MOBILE_EXPLORE_BAR_TITLE_FOLD_CLEARANCE,
} from "./mobileExploreBarTitle";
import fixture from "../../../../tests/fixtures/iphone-duo/safearea-measurements.json";
import { mobileAdaptiveLayout } from "./mobileAdaptiveLayout";
import { getMobilePageGutters } from "./mobilePageGutters";
import { readFileSync } from "node:fs";
import path from "node:path";
import { READER_LAPTOP_CREASE_CLEARANCE } from "./mobileReaderPoseLayout";
import type { MobileWindowLayout } from "./mobileWindowLayout";

/** A measured iPhone Duo window (safearea.info, Xcode 27.1). */
function duo(screen: string, pose: string, orientation: string): MobileWindowLayout {
  const m = fixture.measurements.find((x) => x.screen === screen && x.pose === pose && x.orientation === orientation)!;
  const regions = m.regions.map((r, index) => ({ id: `${r.kind}-${index}`, active: r.active, ...r.frame }));
  return {
    width: m.bounds.width,
    height: m.bounds.height,
    supported: true,
    divisions: regions.filter((_, i) => m.regions[i].kind === "division"),
    occlusions: regions.filter((_, i) => m.regions[i].kind === "occlusion"),
    safeAreaInsets: m.insets,
  };
}

describe("bar title", () => {
  test("the title ends before the button group, gets more room with fewer buttons, and stays within its limits", () => {
    const three = getMobileExploreBarTitleMaxWidth(420, 3);
    expect(three).toBe(156);
    expect(getMobileExploreBarTitleMaxWidth(420, 1)).toBeGreaterThan(three);
    expect(getMobileExploreBarTitleMaxWidth(320, 4)).toBe(96);
    expect(getMobileExploreBarTitleMaxWidth(1024, 3)).toBe(260);
    expect(getMobileExploreBarTitleCentredWidth(420, 3)).toBeLessThan(120);
  });

  test("shown once the hero title passes the bar, hidden on the way back, and wobbling on the line does not toggle", () => {
    const seq: boolean[] = [];
    let shown = false;
    for (const y of [0, 299, 305, 320, 295, 291, 0]) {
      shown = getMobileExploreBarTitleShown(shown, y, 300);
      seq.push(shown);
    }
    expect(seq).toEqual([false, false, false, true, true, false, false]);
    let state = true;
    for (const y of [298, 302, 296, 304]) state = getMobileExploreBarTitleShown(state, y, 300);
    expect(state).toBe(true);
  });

  describe("book posture (Duo F1)", () => {
    // Book and book-flipped: the inner display half folded, upright 951×669, the rail on the right.
    const book = mobileAdaptiveLayout(duo("iphone-duo-inner", "partially-folded", "landscape-left"));
    const bookFlipped = mobileAdaptiveLayout(duo("iphone-duo-inner", "partially-folded", "landscape-right"));

    test("centred in the left pane, from x 0 to the fold region's leading edge, not on the window", () => {
      expect(book.posture).toBe("book");
      expect(book.fold?.x).toBe(455.5);
      const frame = getMobileExploreBarTitleBookFrame(book)!;
      expect(frame).not.toBeNull();
      expect(frame.x + frame.width / 2).toBeCloseTo(455.5 / 2, 5);
      // Before: x313–573 across the fold (455.5–495.5).
      expect(frame.x + frame.width).toBeLessThan(455.5);
    });

    test("ends at least the reader's 20pt before the fold's leading edge (measured from the edge, not the 475.5 centre line)", () => {
      expect(MOBILE_EXPLORE_BAR_TITLE_FOLD_CLEARANCE).toBe(READER_LAPTOP_CREASE_CLEARANCE);
      const frame = getMobileExploreBarTitleBookFrame(book)!;
      expect(frame.x + frame.width).toBeLessThanOrEqual(455.5 - 20);
      // From the 475.5 centre line the same 20pt would have let it run to the region's edge at 455.5.
      expect(frame).toEqual({ x: 20.25, width: 415 });
      expect(frame.x + frame.width).toBe(435.25);
    });

    test("never wider than the pane less 16pt a side", () => {
      const frame = getMobileExploreBarTitleBookFrame(book)!;
      expect(frame.width).toBeLessThanOrEqual(455.5 - 2 * 16);
      expect(frame.x).toBeGreaterThanOrEqual(16);
      // A narrow pane: the 16pt margins bind on the leading side, the 20pt clearance on the fold side.
      const narrow = getMobileExploreBarTitleBookFrame({ posture: "book", fold: { x: 200, y: 0, width: 40, height: 669 } })!;
      expect(narrow.x).toBeGreaterThanOrEqual(16);
      expect(narrow.x + narrow.width).toBeLessThanOrEqual(180);
      expect(narrow.width).toBeLessThanOrEqual(200 - 32);
    });

    test("book-flipped reports the same upright window: the left pane is still the title's", () => {
      expect(bookFlipped.posture).toBe("book");
      expect(getMobileExploreBarTitleBookFrame(bookFlipped)).toEqual(getMobileExploreBarTitleBookFrame(book));
    });

    test("other poses keep the bar's own placement", () => {
      for (const [screen, pose, orientation] of [
        ["iphone-duo-inner", "open", "landscape-left"],
        ["iphone-duo-inner", "partially-folded", "portrait"],
        ["iphone-duo-inner", "partially-folded", "upside-down"],
        ["iphone-duo-outer", "closed", "portrait"],
        ["iphone-duo-outer", "closed", "landscape-right"],
      ]) {
        const adaptive = mobileAdaptiveLayout(duo(screen, pose, orientation));
        expect(adaptive.posture).not.toBe("book");
        expect(getMobileExploreBarTitleBookFrame(adaptive)).toBeNull();
      }
    });

    test("the shift moves the bar's slot onto the pane frame, and nothing until measured", () => {
      const frame = getMobileExploreBarTitleBookFrame(book)!;
      // The bar centred a slot of that width on x≈443 (the survey's 313–573 centre).
      const slotX = 443 - frame.width / 2;
      expect(slotX + getMobileExploreBarTitleShift(frame.x, slotX)).toBe(frame.x);
      expect(getMobileExploreBarTitleShift(frame.x, null)).toBe(0);
    });
    describe("the slot's position is computed, not measured (r19: 77.35pt left after laptop → book)", () => {
      // Book with the rail on the right: safe area R84, the bar's margins as the
      // page gutters (content X20.33–865.67 in the r19 dumps).
      const margins = getMobilePageGutters({ left: 0, right: 84 }, 16, { left: 20.33, right: 85.33 });
      const slot = (slotWidth: number) =>
        getMobileExploreBarTitleSlotX({ windowWidth: 951, slotWidth, margins, inlineItems: null })!;

      test("UIKit's centring between the margins: the r17 260pt slot at x313–573", () => {
        expect(slot(260)).toBeCloseTo(313, 0);
        expect(slot(260) + 260).toBeCloseTo(573, 0);
      });

      test("the 415pt book slot lands on the pane frame whatever width the slot had before the rotation", () => {
        const frame = getMobileExploreBarTitleBookFrame(book)!;
        const visible = slot(frame.width) + getMobileExploreBarTitleShift(frame.x, slot(frame.width));
        expect(visible).toBeCloseTo(20.25, 5);
        expect(visible + frame.width).toBeCloseTo(435.25, 5);
        // The bug: the laptop-width (260) slot's origin, measured before the bar
        // re-centred the grown slot, put the title at X−57.
        const staleShift = getMobileExploreBarTitleShift(frame.x, slot(260));
        expect(slot(frame.width) + staleShift).toBeCloseTo(20.25 - (frame.width - 260) / 2, 5);
        expect(slot(frame.width) + staleShift).toBeLessThan(-57);
      });

      test("book-flipped: the same upright window and margins, the same placement", () => {
        const a = getMobileExploreBarTitleBookFrame(book)!;
        const b = getMobileExploreBarTitleBookFrame(bookFlipped)!;
        expect(slot(b.width) + getMobileExploreBarTitleShift(b.x, slot(b.width))).toBe(
          slot(a.width) + getMobileExploreBarTitleShift(a.x, slot(a.width)),
        );
      });

      test("bar items in the horizontal bar keep the slot clear of them; none when they are in the rail", () => {
        const items = getMobileExploreBarTitleInlineItems(1);
        const narrow = getMobileExploreBarTitleSlotX({ windowWidth: 500, slotWidth: 300, margins: { left: 20, right: 140 }, inlineItems: items })!;
        expect(narrow).toBeGreaterThanOrEqual(items.leading);
        expect(narrow + 300).toBeLessThanOrEqual(500 - items.trailing);
        expect(getMobileExploreBarTitleSlotX({ windowWidth: 951, slotWidth: 415, margins: { left: Number.NaN, right: 0 } })).toBeNull();
      });

      test("the component computes the shift in render from the window, gutters and posture (no measureInWindow, no onLayout)", () => {
        const source = readFileSync(path.join(import.meta.dir, "../components/explore/MobileExploreBarTitle.tsx"), "utf8");
        expect(source).not.toContain("measureInWindow");
        expect(source).not.toContain("onLayout");
        expect(source).toContain("getMobileExploreBarTitleSlotX(");
        expect(source).toContain("useMobilePageGutters()");
      });

      test("flat and closed render the plain pre-book title, its own element: no translateX, no pane width, no wrapper (r20: +10.33pt after book)", () => {
        const source = readFileSync(path.join(import.meta.dir, "../components/explore/MobileExploreBarTitle.tsx"), "utf8");
        const component = source.slice(source.indexOf("export function MobileExploreBarTitle("), source.indexOf("type BarTitleRowProps"));
        // Not book: returned before any shift is computed, keyed apart from the book element.
        const plainReturn = component.indexOf('<PlainBarTitle\n        key="plain"');
        expect(component.indexOf("if (!bookFrame) {")).toBeGreaterThanOrEqual(0);
        expect(plainReturn).toBeGreaterThan(component.indexOf("if (!bookFrame) {"));
        expect(plainReturn).toBeLessThan(component.indexOf("getMobileExploreBarTitleSlotX("));
        expect(component).toContain('<BookBarTitle\n      key="book"');
        const plain = source.slice(source.indexOf("function PlainBarTitle("), source.indexOf("function BookBarTitle("));
        expect(plain).not.toContain("translateX");
        expect(plain).not.toContain("<View");
        expect(plain).toContain("return { opacity: value, transform: [{ translateY: (1 - value) * 6 }] };");
        // The bar's own widths, as before the book frame.
        const nonBook = component.slice(component.indexOf("if (!bookFrame) {"), plainReturn);
        expect(nonBook).toContain("getMobileExploreBarTitleCentredWidth(windowWidth, trailingItems)");
        expect(nonBook).toContain("getMobileExploreBarTitleMaxWidth(windowWidth, trailingItems)");
        const book = source.slice(source.indexOf("function BookBarTitle("), source.indexOf("function BarTitleRow("));
        expect(book).toContain("{ translateX: shiftX }");
      });
    });
  });
});
