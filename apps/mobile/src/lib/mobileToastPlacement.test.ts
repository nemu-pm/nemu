import { describe, expect, test } from "bun:test";
import {
  MOBILE_TOAST_MAX_WIDTH,
  resolveMobileToastPlacement,
  type MobileToastPlacementInput,
} from "./mobileToastPlacement";

function input(overrides: Partial<MobileToastPlacementInput> = {}): MobileToastPlacementInput {
  const windowWidth = overrides.windowWidth ?? 402;
  return {
    windowWidth,
    posture: "flat",
    panels: [{ x: 0, y: 0, width: windowWidth, height: 874 }],
    verticalBarSide: null,
    safeArea: { left: 0, right: 0, bottom: 34 },
    gutters: { left: 16, right: 16 },
    bottomTabBarVisible: true,
    bottomTabBarInset: 83,
    fallbackBottomTabBarInset: 34 + 49,
    ...overrides,
  };
}

describe("resolveMobileToastPlacement", () => {
  test("phone: full gutter width, 12pt above the measured tab bar", () => {
    expect(resolveMobileToastPlacement(input())).toEqual({ left: 16, width: 370, bottom: 95 });
  });

  test("width caps at 420 and is centred in the region", () => {
    const wide = resolveMobileToastPlacement(input({ windowWidth: 1024 }));
    expect(wide.width).toBe(MOBILE_TOAST_MAX_WIDTH);
    expect(wide.left).toBe(16 + (1024 - 32 - 420) / 2);
    expect(resolveMobileToastPlacement(input({ windowWidth: 440 })).width).toBe(408);
  });

  test("falls back to safe area + 49 before the tab bar is measured", () => {
    expect(resolveMobileToastPlacement(input({ bottomTabBarInset: null })).bottom).toBe(34 + 49 + 12);
  });

  test("no bottom tab bar (pushed screen without tabs): safe area + 16", () => {
    expect(resolveMobileToastPlacement(input({ bottomTabBarVisible: false })).bottom).toBe(50);
  });

  test("Duo rail: no bottom bar, never under the rail", () => {
    const placement = resolveMobileToastPlacement(input({
      windowWidth: 700,
      verticalBarSide: "right",
      safeArea: { left: 0, right: 62, bottom: 20 },
      gutters: { left: 16, right: 16 },
    }));
    expect(placement.bottom).toBe(36);
    expect(placement.left + placement.width).toBeLessThanOrEqual(700 - 62);
    expect(placement.left).toBeGreaterThanOrEqual(16);
  });

  test("Duo rail: centred on the content between the gutters (outer 466, inner landscape 951)", () => {
    // The gutters already include the rail's safe area.
    const outer = resolveMobileToastPlacement(input({
      windowWidth: 466,
      verticalBarSide: "right",
      safeArea: { left: 0, right: 84, bottom: 20 },
      gutters: { left: 20, right: 85 },
    }));
    expect(outer.left).toBe(20);
    expect(outer.left + outer.width).toBe(466 - 85);

    const inner = resolveMobileToastPlacement(input({
      windowWidth: 951,
      verticalBarSide: "right",
      safeArea: { left: 0, right: 84, bottom: 20 },
      gutters: { left: 20, right: 85 },
    }));
    expect(inner.width).toBe(MOBILE_TOAST_MAX_WIDTH);
    expect(inner.left + inner.width / 2).toBe((20 + 951 - 85) / 2);
    expect(inner.bottom).toBe(36);
  });

  const book = {
    windowWidth: 841,
    posture: "book" as const,
    panels: [
      { x: 0, y: 0, width: 400, height: 700 },
      { x: 441, y: 0, width: 400, height: 700 },
    ],
  };

  test("book posture with a rail: in the rail's pane, ≥16 from fold and rail", () => {
    const right = resolveMobileToastPlacement(input({
      ...book,
      verticalBarSide: "right",
      safeArea: { left: 0, right: 60, bottom: 20 },
      gutters: { left: 16, right: 76 },
    }));
    expect(right.left).toBeGreaterThanOrEqual(441 + 16);
    expect(right.left + right.width).toBeLessThanOrEqual(841 - 60 - 16);
    expect(right.bottom).toBe(36);

    const left = resolveMobileToastPlacement(input({
      ...book,
      verticalBarSide: "left",
      safeArea: { left: 60, right: 0, bottom: 20 },
      gutters: { left: 76, right: 16 },
    }));
    expect(left.left).toBeGreaterThanOrEqual(60 + 16);
    expect(left.left + left.width).toBeLessThanOrEqual(400 - 16);
  });

  test("book posture without a rail: the trailing pane, never across the fold", () => {
    const ltr = resolveMobileToastPlacement(input(book));
    expect(ltr.left).toBe(441 + 16);
    expect(ltr.left + ltr.width).toBeLessThanOrEqual(841 - 16);
    expect(ltr.bottom).toBe(95);

    const rtl = resolveMobileToastPlacement(input({ ...book, layoutDirection: "rtl" }));
    expect(rtl.left).toBeGreaterThanOrEqual(16);
    expect(rtl.left + rtl.width).toBeLessThanOrEqual(400 - 16);
  });

  test("laptop posture: stays bottom-anchored in the lower pane", () => {
    const placement = resolveMobileToastPlacement(input({
      windowWidth: 841,
      posture: "notebook",
      panels: [
        { x: 0, y: 0, width: 841, height: 330 },
        { x: 0, y: 370, width: 841, height: 330 },
      ],
      bottomTabBarVisible: false,
      safeArea: { left: 0, right: 0, bottom: 20 },
    }));
    // 48pt pill + 36pt offset stays well inside the 330pt lower pane.
    expect(placement.bottom).toBe(36);
    expect((placement.bottom ?? Infinity) + 48).toBeLessThan(330);
    expect(placement.width).toBe(420);
  });

  describe("screen regions", () => {
    // Settings on the Duo's inner display: a 250pt sidebar beside the section.
    const portraitSplit = { x: 250, width: 419 };

    test("split: in the trailing pane, 16pt off the sidebar, never across it", () => {
      const placement = resolveMobileToastPlacement(input({
        windowWidth: 669,
        safeArea: { left: 0, right: 0, bottom: 20 },
        gutters: { left: 20, right: 20 },
        region: portraitSplit,
      }));
      expect(placement.left).toBe(250 + 16);
      expect(placement.left + placement.width).toBe(669 - 20);
      expect(placement.bottom).toBe(95);
    });

    test("split beside a rail: in the trailing pane and clear of the rail", () => {
      const placement = resolveMobileToastPlacement(input({
        windowWidth: 951,
        verticalBarSide: "right",
        safeArea: { left: 0, right: 84, bottom: 20 },
        gutters: { left: 20, right: 85 },
        region: { x: 320, width: 631 },
      }));
      expect(placement.left).toBeGreaterThanOrEqual(320 + 16);
      expect(placement.left + placement.width).toBeLessThanOrEqual(951 - 84);
      expect(placement.left + placement.width / 2).toBe((336 + 951 - 85) / 2);
    });

    test("book posture: the fold-aligned pane wins over the posture's pane choice", () => {
      const leftPane = resolveMobileToastPlacement(input({
        ...book,
        region: { x: 0, width: 400 },
      }));
      expect(leftPane.left).toBeGreaterThanOrEqual(16);
      expect(leftPane.left + leftPane.width).toBeLessThanOrEqual(400 - 16);

      const rightPane = resolveMobileToastPlacement(input({
        ...book,
        verticalBarSide: "right",
        safeArea: { left: 0, right: 60, bottom: 20 },
        gutters: { left: 16, right: 76 },
        region: { x: 441, width: 400 },
      }));
      expect(rightPane.left).toBe(441 + 16);
      expect(rightPane.left + rightPane.width).toBeLessThanOrEqual(841 - 60);
    });

    test("a region too narrow for a toast is ignored", () => {
      const placement = resolveMobileToastPlacement(input({ region: { x: 300, width: 102 } }));
      expect(placement).toEqual({ left: 16, width: 370, bottom: 95 });
    });

    test("a top anchor (the reader) replaces the bottom placement", () => {
      const placement = resolveMobileToastPlacement(input({
        windowWidth: 951,
        bottomTabBarVisible: false,
        keyboardHeight: 300,
        region: { x: 0, width: 951, top: 96 },
      }));
      expect(placement.top).toBe(96);
      expect(placement.bottom).toBeUndefined();
      expect(placement.width).toBe(MOBILE_TOAST_MAX_WIDTH);
    });
  });

  test("keyboard: 12pt above it, never lower than the resting place", () => {
    expect(resolveMobileToastPlacement(input({ keyboardHeight: 336 })).bottom).toBe(348);
    // A keyboard below the tab bar (hardware keyboard bar) leaves it in place.
    expect(resolveMobileToastPlacement(input({ keyboardHeight: 44 })).bottom).toBe(95);
    expect(resolveMobileToastPlacement(input({ keyboardHeight: 0 })).bottom).toBe(95);
  });
});
