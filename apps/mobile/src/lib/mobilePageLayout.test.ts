import { describe, expect, test } from "bun:test";
import {
  getMobilePageTopPadding,
  getMobileSourceGridLayout,
  resolveMobilePageContentInsetAdjustment,
} from "./mobilePageLayout";

describe("page top padding follows the title bar on screen", () => {
  const base = { nativeHeader: true, pageTop: 18 };

  test("portrait iPhone keeps its 18pt padding under the 44pt bar", () => {
    expect(getMobilePageTopPadding({ ...base, platform: "ios", safeAreaTop: 62, headerHeight: 106 })).toBe(18);
    expect(getMobilePageTopPadding({ ...base, platform: "ios", safeAreaTop: 59, headerHeight: 103 })).toBe(18);
    // Before the native header reports its height.
    expect(getMobilePageTopPadding({ ...base, platform: "ios", safeAreaTop: 62 })).toBe(18);
  });

  test("landscape iPhone's 32pt bar never grows the padding", () => {
    expect(getMobilePageTopPadding({ ...base, platform: "ios", safeAreaTop: 0, headerHeight: 32 })).toBe(18);
  });

  test("Android's 64dp Material bar gets the same title-to-content distance", () => {
    const padding = getMobilePageTopPadding({ ...base, platform: "android", safeAreaTop: 24, headerHeight: 88 });
    expect(padding).toBe(8);
    // Title center → content: 32 + 8 = 40, the iPhone's 22 + 18.
    expect(64 / 2 + padding).toBe(44 / 2 + 18);
    expect(getMobilePageTopPadding({ ...base, platform: "android", safeAreaTop: 24 })).toBe(8);
    expect(getMobilePageTopPadding({ ...base, platform: "android", safeAreaTop: 24, headerHeight: 80 })).toBe(12);
  });

  test("taller bars (Duo trailing-bar layouts) compress to the minimum, never below", () => {
    // Duo inner landscape (old accessibility dump): first content at y=100 with 18pt padding → header bottom ≈ 82pt.
    expect(getMobilePageTopPadding({ ...base, platform: "ios", safeAreaTop: 0, headerHeight: 82 })).toBe(8);
    expect(getMobilePageTopPadding({ ...base, platform: "ios", safeAreaTop: 24, headerHeight: 82 })).toBe(11);
  });

  test("a screen-drawn header states its own bar height", () => {
    // Title row only, then title row + search row.
    expect(getMobilePageTopPadding({ ...base, platform: "android", safeAreaTop: 24, headerHeight: 0, headerBarHeight: 44 })).toBe(18);
    expect(getMobilePageTopPadding({ ...base, platform: "android", safeAreaTop: 24, headerHeight: 0, headerBarHeight: 92 })).toBe(8);
  });

  test("system-inset scroll views (header search bars) keep the page padding", () => {
    expect(getMobilePageTopPadding({ ...base, platform: "ios", safeAreaTop: 62, headerHeight: 158, insetAdjusted: true })).toBe(18);
  });

  test("pages without a native header pad past the safe area", () => {
    expect(getMobilePageTopPadding({ ...base, nativeHeader: false, platform: "ios", safeAreaTop: 62 })).toBe(80);
  });
});

describe("browse source grid", () => {
  test("cards fit the usable width and reduce columns for large text", () => {
    for (const [width, scale, preferEven, columns] of [
      [370, 1, false, 1],
      [850, 1, true, 2],
      [1100, 1, false, 3],
      [1100, 1, true, 2],
      [1334, 1, true, 4],
      [850, 1.6, true, 1],
    ] as const) {
      const result = getMobileSourceGridLayout(width, scale, { preferEven });
      expect(result.columns).toBe(columns);
      const rowWidth = result.itemWidth * result.columns + (result.columns - 1) * 12;
      expect(rowWidth).toBeLessThanOrEqual(width);
      expect(rowWidth).toBeGreaterThan(width - result.columns);
    }
  });

  test("book posture: one card per pane, gutter on the fold", () => {
    const result = getMobileSourceGridLayout(850, 1, { preferEven: true, fold: { start: 449, end: 470 } });
    expect(result).toMatchObject({ columns: 2, foldAligned: true });
    // Leading card on the page gutter (aligned with section headers), never
    // past the fold; the trailing card starts right after the fold.
    expect(result.columnMargins[0]).toBe(0);
    expect(result.itemWidth).toBeLessThanOrEqual(449);
    expect(result.columnMargins[0] + result.itemWidth + result.columnMargins[1]).toBe(470);
  });
});

describe("page scroll view inset adjustment", () => {
  test("iOS pages under the native (soft-edge) header adjust automatically", () => {
    expect(resolveMobilePageContentInsetAdjustment({ platform: "ios", nativeHeader: true })).toBe("automatic");
  });

  test("own headers and Android keep never", () => {
    expect(resolveMobilePageContentInsetAdjustment({ platform: "ios", nativeHeader: false })).toBe("never");
    expect(resolveMobilePageContentInsetAdjustment({ platform: "android", nativeHeader: true })).toBe("never");
  });

  test("an explicit request wins", () => {
    expect(
      resolveMobilePageContentInsetAdjustment({ platform: "ios", nativeHeader: true, requested: "never" }),
    ).toBe("never");
  });
});
