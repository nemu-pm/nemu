import { describe, expect, test } from "bun:test";
import { mobileFoldAwareGridLayout } from "./mobileFoldAwareGrid";
import {
  MOBILE_LIBRARY_REGULAR_MIN_ITEM_WIDTH,
  MOBILE_MANGA_GRID_GAP,
  MOBILE_MANGA_GRID_MAX_COLUMNS,
  MOBILE_MANGA_GRID_MIN_ITEM_WIDTH,
  mobileLibraryGridMinItemWidth,
} from "./mobileAdaptiveGrid";

describe("Library cover size by window", () => {
  test("an iPad in either orientation gets the larger covers", () => {
    expect(mobileLibraryGridMinItemWidth({ width: 834, height: 1210, hasFoldRegion: false })).toBe(
      MOBILE_LIBRARY_REGULAR_MIN_ITEM_WIDTH,
    );
    expect(mobileLibraryGridMinItemWidth({ width: 1210, height: 834, hasFoldRegion: false })).toBe(
      MOBILE_LIBRARY_REGULAR_MIN_ITEM_WIDTH,
    );
  });

  test("phones, landscape phones and the Duo keep the phone size", () => {
    for (const window of [
      { width: 375, height: 667, hasFoldRegion: false },
      { width: 956, height: 440, hasFoldRegion: false },
      { width: 466, height: 678, hasFoldRegion: false },
      { width: 669, height: 951, hasFoldRegion: true },
      { width: 951, height: 669, hasFoldRegion: true },
    ]) {
      expect(mobileLibraryGridMinItemWidth(window)).toBe(MOBILE_MANGA_GRID_MIN_ITEM_WIDTH);
    }
  });

  test("an 11-inch iPad shelf drops from phone-sized covers to about 160pt", () => {
    const layout = (minItemWidth: number) =>
      mobileFoldAwareGridLayout({
        contentWidth: 1032,
        minItemWidth,
        gap: MOBILE_MANGA_GRID_GAP,
        maxColumns: MOBILE_MANGA_GRID_MAX_COLUMNS,
        preferEven: false,
      });
    expect(layout(MOBILE_MANGA_GRID_MIN_ITEM_WIDTH).itemWidth).toBeLessThan(120);
    const regular = layout(MOBILE_LIBRARY_REGULAR_MIN_ITEM_WIDTH);
    expect(regular.columns).toBe(6);
    expect(regular.itemWidth).toBeGreaterThanOrEqual(150);
  });
});
