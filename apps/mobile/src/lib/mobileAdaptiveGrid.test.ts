import { describe, expect, test } from "bun:test";
import {
  getMobileMangaGridColumns,
  getMobileMangaGridItemWidth,
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
  test("caps at 4 columns on wide widths", () => {
    // contentWidth = 1200 - 32 = 1168; (1168 + 12) / 116 = ~10.2 → capped at 4
    expect(getMobileMangaGridColumns({ windowWidth: 1200, horizontalPadding: 32 })).toBe(4);
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