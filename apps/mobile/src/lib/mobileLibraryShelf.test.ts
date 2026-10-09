import { describe, expect, test } from "bun:test";
import { getMobileShelfPlankSegments, getMobileShelfRow } from "./mobileLibraryShelf";

const layout = { columns: 3, itemWidth: 100, columnMargins: [0, 12, 12] };

describe("library shelf", () => {
  test("a row's shelf spans every column plus the overhang; a fold gutter breaks the row and its plank", () => {
    expect(getMobileShelfRow(layout, 12, 16)).toEqual({ left: -16, width: 356, dividers: [] });
    const book = { columns: 4, itemWidth: 80, columnMargins: [0, 12, 40, 12] };
    const row = getMobileShelfRow(book, 12, 10);
    expect(row.dividers).toEqual([{ x: 182, width: 40 }]);
    expect(getMobileShelfPlankSegments({ width: 404, dividers: row.dividers })).toEqual([
      { x: 0, width: 182 },
      { x: 222, width: 182 },
    ]);
  });
});
