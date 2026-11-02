import { describe, expect, test } from "bun:test";
import {
  MOBILE_NATIVE_STACK_SHEET_BAR,
  mobileNativeStackSheetDetent,
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
