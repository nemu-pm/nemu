import { describe, expect, test } from "bun:test";
import {
  getMobileShelfPlankSegments,
  getMobileShelfRow,
} from "./mobileLibraryShelf";

const layout = { columns: 3, itemWidth: 100, columnMargins: [0, 12, 12] };

describe("getMobileShelfRow", () => {
  test("a row's shelf spans every column plus the overhang", () => {
    expect(getMobileShelfRow(layout, 12, 16)).toEqual({ left: -16, width: 356, dividers: [] });
    expect(getMobileShelfRow(layout, 12, 0)).toEqual({ left: 0, width: 324, dividers: [] });
  });

  test("a fold gutter breaks the row", () => {
    const book = { columns: 4, itemWidth: 80, columnMargins: [0, 12, 40, 12] };
    const row = getMobileShelfRow(book, 12, 10);
    expect(row.dividers).toEqual([{ x: 182, width: 40 }]);
    expect(row.width).toBe(10 + 80 + 12 + 80 + 40 + 80 + 12 + 80 + 10);
  });
});

describe("shelf planks and covers", () => {
  test("one plank per row, broken at a fold so each pane has its own", () => {
    expect(getMobileShelfPlankSegments({ width: 356, dividers: [] })).toEqual([{ x: 0, width: 356 }]);
    expect(getMobileShelfPlankSegments({ width: 404, dividers: [{ x: 182, width: 40 }] })).toEqual([
      { x: 0, width: 182 },
      { x: 222, width: 182 },
    ]);
  });
});
