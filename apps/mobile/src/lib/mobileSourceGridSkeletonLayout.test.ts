import { describe, expect, test } from "bun:test";
import {
  getMobileMangaGridColumns,
  MOBILE_MANGA_GRID_GAP,
} from "./mobileAdaptiveGrid";
import {
  getMobileSourceGridSkeletonGeometry,
  MOBILE_SOURCE_GRID_SKELETON_HORIZONTAL_PADDING,
} from "./mobileSourceGridSkeletonLayout";

describe("getMobileSourceGridSkeletonGeometry", () => {
  test("lays out 3 columns on an iPhone-width viewport like the loaded grid", () => {
    const { cardWidth, columnCount } = getMobileSourceGridSkeletonGeometry({
      windowWidth: 393,
    });
    expect(columnCount).toBe(3);
    expect(cardWidth).toBe(Math.floor((393 - 32 - MOBILE_MANGA_GRID_GAP * 2) / 3));
  });

  test.each([320, 375, 390, 414, 428, 768, 1024])(
    "cards fill the listing grid's content width at %dpt without overflowing a row",
    (windowWidth) => {
      const { cardWidth, columnCount } = getMobileSourceGridSkeletonGeometry({
        windowWidth,
      });
      expect(columnCount).toBe(
        getMobileMangaGridColumns({
          windowWidth,
          horizontalPadding: MOBILE_SOURCE_GRID_SKELETON_HORIZONTAL_PADDING,
        }),
      );
      expect(columnCount).toBeGreaterThanOrEqual(2);
      expect(
        cardWidth * columnCount + MOBILE_MANGA_GRID_GAP * (columnCount - 1),
      ).toBeLessThanOrEqual(
        windowWidth - MOBILE_SOURCE_GRID_SKELETON_HORIZONTAL_PADDING,
      );
    },
  );
});
