import { describe, expect, test } from "bun:test";
import {
  getMobileMangaGridColumns,
  getMobileMangaGridItemWidth,
  getMobileMangaGridLayout,
  getMobileMangaGridRowWidths,
  getMobileMangaGridSkeletonGeometry,
  MOBILE_MANGA_GRID_GAP,
} from "./mobileAdaptiveGrid";

describe("getMobileMangaGridColumns", () => {
  test("clamps to a minimum of 2 columns on very narrow widths", () => {
    expect(getMobileMangaGridColumns({ windowWidth: 200, horizontalPadding: 32 })).toBe(2);
  });
  test("2 columns on a typical phone width", () => {
    // contentWidth = 390 - 32 = 358; (358 + 12) / (104 + 12) = 3.17 → 3
    expect(getMobileMangaGridColumns({ windowWidth: 390, horizontalPadding: 32 })).toBe(3);
  });
  test("portrait iPhones stay at three covers", () => {
    for (const windowWidth of [375, 390, 393, 402, 430, 440]) {
      expect(getMobileMangaGridColumns({ windowWidth, horizontalPadding: 32 })).toBe(3);
    }
  });
  test("a landscape iPhone adds columns at the portrait cover size", () => {
    // iPhone 17 Pro landscape: 874pt wide, 62pt safe-area gutters each side.
    // contentWidth = 750; (750 + 12) / 116 = 6.57 → 6 columns of 115pt, the
    // same cover width as the 402pt portrait grid.
    const landscape = { windowWidth: 874, horizontalPadding: 124 };
    expect(getMobileMangaGridColumns(landscape)).toBe(6);
    expect(getMobileMangaGridItemWidth(landscape)).toBe(
      getMobileMangaGridItemWidth({ windowWidth: 402, horizontalPadding: 32 }),
    );
  });
  test("safe-area gutters shrink the column count", () => {
    // Without the insets the same phone would pack 7 columns under the island.
    expect(getMobileMangaGridColumns({ windowWidth: 874, horizontalPadding: 32 })).toBe(7);
    expect(getMobileMangaGridColumns({ windowWidth: 874, horizontalPadding: 124 })).toBe(6);
  });
  test("caps at 10 columns on very wide widths", () => {
    // contentWidth = 1376 - 32 = 1344; (1344 + 12) / 116 = ~11.7 → capped at 10
    expect(getMobileMangaGridColumns({ windowWidth: 1376, horizontalPadding: 32 })).toBe(10);
  });
  test("handles zero/negative content width by returning the floor of 2", () => {
    expect(getMobileMangaGridColumns({ windowWidth: 0, horizontalPadding: 32 })).toBe(2);
    expect(getMobileMangaGridColumns({ windowWidth: 10, horizontalPadding: 32 })).toBe(2);
  });
});

describe("getMobileMangaGridItemWidth", () => {
  test("divides content width evenly across the computed columns (minus gaps)", () => {
    const windowWidth = 390;
    const horizontalPadding = 32;
    const columns = getMobileMangaGridColumns({ windowWidth, horizontalPadding });
    const width = getMobileMangaGridItemWidth({ windowWidth, horizontalPadding });
    const contentWidth = windowWidth - horizontalPadding;
    expect(columns).toBe(3);
    expect(width).toBe(
      Math.floor((contentWidth - MOBILE_MANGA_GRID_GAP * (columns - 1)) / columns),
    );
  });
  test("stays in sync with the column count helper", () => {
    for (const windowWidth of [320, 390, 414, 768, 1024, 1440]) {
      const columns = getMobileMangaGridColumns({ windowWidth, horizontalPadding: 32 });
      const width = getMobileMangaGridItemWidth({ windowWidth, horizontalPadding: 32 });
      // Re-derive the width from the shared column count and confirm it matches.
      const contentWidth = windowWidth - 32;
      expect(width).toBe(
        Math.floor((contentWidth - MOBILE_MANGA_GRID_GAP * (columns - 1)) / columns),
      );
    }
  });
});

describe("getMobileMangaGridSkeletonGeometry", () => {
  test("portrait phone: three columns of the loaded grid's card width", () => {
    const portrait = { windowWidth: 402, horizontalPadding: 32 };
    expect(getMobileMangaGridSkeletonGeometry({ ...portrait, rows: 3 })).toEqual({
      cardCount: 9,
      cardWidth: getMobileMangaGridItemWidth(portrait),
      columnCount: 3,
    });
  });
  test("landscape phone: six columns inside the safe-area gutters", () => {
    const landscape = { windowWidth: 874, horizontalPadding: 124 };
    const geometry = getMobileMangaGridSkeletonGeometry({ ...landscape, rows: 1 });
    expect(geometry).toEqual({
      cardCount: 6,
      cardWidth: getMobileMangaGridItemWidth(landscape),
      columnCount: 6,
    });
    // A full row of skeleton cards fits the content width without wrapping.
    expect(
      geometry.cardWidth * geometry.columnCount +
        MOBILE_MANGA_GRID_GAP * (geometry.columnCount - 1),
    ).toBeLessThanOrEqual(874 - 124);
  });
  test("always renders at least one row", () => {
    expect(
      getMobileMangaGridSkeletonGeometry({
        windowWidth: 402,
        horizontalPadding: 32,
        rows: 0,
      }).cardCount,
    ).toBe(3);
  });
});

describe("getMobileMangaGridLayout", () => {
  const layouts = [
    // Portrait iPhone 17 Pro, landscape with safe-area gutters, iPad.
    { windowWidth: 402, horizontalPadding: 32 },
    { windowWidth: 874, horizontalPadding: 124 },
    { windowWidth: 1032, horizontalPadding: 32 },
  ];

  test("matches the column and width helpers", () => {
    for (const args of layouts) {
      expect(getMobileMangaGridLayout(args)).toEqual({
        columns: getMobileMangaGridColumns(args),
        itemWidth: getMobileMangaGridItemWidth(args),
      });
    }
  });

  test("a partial last row keeps the fixed column width (no stretched lone cover)", () => {
    for (const args of layouts) {
      const layout = getMobileMangaGridLayout(args);
      for (const count of [1, layout.columns + 1, layout.columns * 2 + 1, layout.columns * 3 - 1]) {
        expect(count % layout.columns).not.toBe(0);
        const rows = getMobileMangaGridRowWidths(layout, count);
        const lastRow = rows[rows.length - 1];
        expect(lastRow.length).toBe(count % layout.columns);
        for (const width of rows.flat()) expect(width).toBe(layout.itemWidth);
      }
    }
  });

  test("a full row fits inside the content width in portrait and landscape", () => {
    for (const args of layouts) {
      const layout = getMobileMangaGridLayout(args);
      const rowWidth =
        layout.columns * layout.itemWidth +
        (layout.columns - 1) * MOBILE_MANGA_GRID_GAP;
      expect(rowWidth).toBeLessThanOrEqual(args.windowWidth - args.horizontalPadding);
      // Floor rounding loses at most one point per column.
      expect(rowWidth).toBeGreaterThan(
        args.windowWidth - args.horizontalPadding - layout.columns,
      );
    }
  });
});
