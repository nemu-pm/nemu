import { describe, expect, test } from "bun:test";
import {
  fitMobileDetailTagRow as fit,
  getMobileDetailHeroCopyLayout as heroLayout,
  getMobileDetailActionRowOverhang,
  getMobileDetailOverflowSampleLabel,
} from "./mobileMangaDetailTagLayout";

describe("detail tag row fitting", () => {
  test("shows every tag when they fit one line", () => {
    expect(fit({ availableWidth: 220, tagWidths: [60, 70, 70], overflowChipWidth: 36, gap: 8 }))
      .toEqual({ ready: true, visibleCount: 3, overflowCount: 0 });
  });

  test("keeps a prefix and reserves the +N chip when tags overflow", () => {
    // 60 + 8 + 70 + 8 + 36 = 182 fits; adding the third (70) does not.
    expect(fit({ availableWidth: 200, tagWidths: [60, 70, 70, 50, 40], overflowChipWidth: 36, gap: 8 }))
      .toEqual({ ready: true, visibleCount: 2, overflowCount: 3 });
  });

  test("row width never depends on how many tags there are", () => {
    const many = Array.from({ length: 30 }, () => 64);
    const result = fit({ availableWidth: 210, tagWidths: many, overflowChipWidth: 44, gap: 8 });
    expect(result.visibleCount).toBe(2);
    expect(result.overflowCount).toBe(28);
    expect(2 * 64 + 2 * 8 + 44).toBeLessThanOrEqual(210);
  });

  test("pinned badges are always kept and take room first", () => {
    expect(fit({ availableWidth: 200, pinnedWidths: [80], tagWidths: [60, 60], overflowChipWidth: 30, gap: 8 }))
      .toEqual({ ready: true, visibleCount: 1, overflowCount: 1 });
  });

  test("only the +N chip when even the first tag does not fit beside it", () => {
    expect(fit({ availableWidth: 150, tagWidths: [154, 90], overflowChipWidth: 30, gap: 8 }))
      .toEqual({ ready: true, visibleCount: 0, overflowCount: 2 });
  });

  test("a second line is allowed when requested (large text, stacked hero)", () => {
    expect(fit({ availableWidth: 200, tagWidths: [90, 90, 90, 90, 90], overflowChipWidth: 36, gap: 8, maxLines: 2 }))
      .toEqual({ ready: true, visibleCount: 3, overflowCount: 2 });
  });

  test("waits for every measurement", () => {
    expect(fit({ availableWidth: 200, tagWidths: [60, undefined], overflowChipWidth: 30, gap: 8 }).ready).toBe(false);
    expect(fit({ availableWidth: 0, tagWidths: [60], overflowChipWidth: 30, gap: 8 }).ready).toBe(false);
    expect(fit({ availableWidth: 200, tagWidths: [60], overflowChipWidth: undefined, gap: 8 }).ready).toBe(false);
    expect(fit({ availableWidth: 200, tagWidths: [], overflowChipWidth: undefined, gap: 8 }))
      .toEqual({ ready: true, visibleCount: 0, overflowCount: 0 });
  });

  test("overflow sample label covers two-digit counts", () => {
    expect(getMobileDetailOverflowSampleLabel(9)).toBe("+8");
    expect(getMobileDetailOverflowSampleLabel(42)).toBe("+88");
  });
});

describe("detail hero copy layout", () => {
  const base = { fontScale: 1, compact: false, hasAuthors: true, hasTagRow: true, maxTitleLines: 3 };

  test("the copy column fits beside the cover so actions sit on its bottom edge", () => {
    const layout = heroLayout({ ...base, surfaceWidth: 342 });
    // title 2×28 + author 18 + chips 30 + actions 36 + 3 gaps of 8.
    expect(layout.coverHeight).toBeGreaterThanOrEqual(164);
    expect(layout.titleLines).toBe(2);
    expect(layout.coverWidth).toBeLessThanOrEqual(Math.floor(342 * 0.4));
  });

  test("keeps the historic 112pt cover on wide rows", () => {
    expect(heroLayout({ ...base, surfaceWidth: 380 }).coverWidth).toBe(112);
    expect(heroLayout({ ...base, surfaceWidth: 380 }).coverHeight).toBe(168);
  });

  test("without a tag row or authors the title gets the room back", () => {
    expect(heroLayout({ ...base, surfaceWidth: 380, hasTagRow: false }).titleLines).toBe(3);
    expect(heroLayout({ ...base, surfaceWidth: 380, hasAuthors: false, hasTagRow: false, maxTitleLines: 4 }).titleLines).toBe(4);
  });

  test("compact rows grow the cover instead of pushing the actions below it", () => {
    const layout = heroLayout({ ...base, surfaceWidth: 315, compact: true, maxTitleLines: 4 });
    expect(layout.gap).toBe(6);
    expect(layout.coverHeight).toBeGreaterThanOrEqual(2 * 26 + 18 + 30 + 36 + 3 * 6);
  });

  test("enlarged text below the stacked threshold grows the cover, capped at 40% of the row", () => {
    const layout = heroLayout({ ...base, surfaceWidth: 342, fontScale: 1.25 });
    expect(layout.coverHeight).toBeGreaterThan(168);
    expect(layout.coverWidth).toBeLessThanOrEqual(Math.floor(342 * 0.4));
    expect(layout.titleLines).toBeGreaterThanOrEqual(2);
  });

  test("the touch frame overhang is paid back so the pill meets the cover edge", () => {
    expect(getMobileDetailActionRowOverhang({ minimumTouchTarget: 44 })).toBe(4);
    expect(getMobileDetailActionRowOverhang({ minimumTouchTarget: 48 })).toBe(6);
    expect(getMobileDetailActionRowOverhang({ pillHeight: 50, minimumTouchTarget: 44 })).toBe(0);
    // Android's taller frame asks for a slightly taller cover, never a lower button.
    const ios = heroLayout({ ...base, surfaceWidth: 342 });
    const android = heroLayout({ ...base, surfaceWidth: 342, minimumTouchTarget: 48 });
    expect(android.coverHeight).toBeGreaterThanOrEqual(ios.coverHeight);
  });

  test("tag count is not an input: the same inputs always give the same card", () => {
    expect(heroLayout({ ...base, surfaceWidth: 342 })).toEqual(heroLayout({ ...base, surfaceWidth: 342 }));
  });
});
