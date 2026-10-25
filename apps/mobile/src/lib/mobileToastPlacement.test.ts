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

  test("Duo rail: no bottom bar, keeps 16pt off the rail", () => {
    const placement = resolveMobileToastPlacement(input({
      windowWidth: 700,
      verticalBarSide: "right",
      safeArea: { left: 0, right: 62, bottom: 20 },
      gutters: { left: 16, right: 16 },
    }));
    expect(placement.bottom).toBe(36);
    expect(placement.left + placement.width).toBeLessThanOrEqual(700 - 62 - 16);
    expect(placement.left).toBeGreaterThanOrEqual(16);
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
    expect(placement.bottom + 48).toBeLessThan(330);
    expect(placement.width).toBe(420);
  });
});
