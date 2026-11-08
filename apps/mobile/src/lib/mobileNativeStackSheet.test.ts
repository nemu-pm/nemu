import { describe, expect, test } from "bun:test";
import {
  MOBILE_NATIVE_STACK_SHEET_BAR,
  mobileNativeStackSheetDetent,
  mobileNativeStackSheetFullWidthBesideBar,
  mobileNativeStackSheetMeasureKey,
} from "./mobileNativeStackSheet";

describe("mobileNativeStackSheetDetent", () => {
  test("a measured page gets the bar above it", () => {
    expect(mobileNativeStackSheetDetent({ contentHeight: 300.2, estimatedHeight: 500, windowHeight: 900 })).toBe(
      Math.ceil(300.2 + MOBILE_NATIVE_STACK_SHEET_BAR),
    );
  });

  test("the estimate until the page is measured; never taller than the window", () => {
    expect(mobileNativeStackSheetDetent({ contentHeight: undefined, estimatedHeight: 420, windowHeight: 900 })).toBe(420);
    expect(mobileNativeStackSheetDetent({ contentHeight: 0, estimatedHeight: 420, windowHeight: 900 })).toBe(420);
    expect(mobileNativeStackSheetDetent({ contentHeight: 2000, estimatedHeight: 420, windowHeight: 678 })).toBe(678);
  });
});

describe("mobileNativeStackSheetMeasureKey", () => {
  test("sub-half-point width differences share a key; another width does not", () => {
    expect(mobileNativeStackSheetMeasureKey("plugins", 402.1)).toBe(mobileNativeStackSheetMeasureKey("plugins", 402.2));
    expect(mobileNativeStackSheetMeasureKey("plugins", 402)).not.toBe(mobileNativeStackSheetMeasureKey("plugins", 450));
  });
});

describe("mobileNativeStackSheetFullWidthBesideBar", () => {
  const outer = { verticalBarSide: "right" as const, regularWidth: false, windowHeight: 678 };
  test("a sheet below the bar's status items takes the full width", () => {
    expect(mobileNativeStackSheetFullWidthBesideBar({ ...outer, detent: 300 })).toBe(true);
  });
  test("a tall sheet keeps the column beside the status items", () => {
    expect(mobileNativeStackSheetFullWidthBesideBar({ ...outer, detent: 500 })).toBe(false);
  });
  test("no vertical bar, or a regular width where the sheet floats clear of it: nothing to do", () => {
    expect(mobileNativeStackSheetFullWidthBesideBar({ ...outer, verticalBarSide: null, detent: 300 })).toBe(false);
    expect(mobileNativeStackSheetFullWidthBesideBar({ ...outer, regularWidth: true, detent: 300 })).toBe(false);
  });
});
