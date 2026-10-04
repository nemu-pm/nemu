import { describe, expect, test } from "bun:test";
import {
  mobileGridAnchorFallbackOffset,
  mobileGridAnchorLayoutKey,
  mobileGridAnchorRestoreRow,
  mobileGridFirstVisibleIndex,
} from "./mobileGridScrollAnchor";

describe("mobile grid scroll anchor", () => {
  test("first visible item is the lowest viewable index", () => {
    expect(
      mobileGridFirstVisibleIndex([
        { index: 14, isViewable: true },
        { index: 12, isViewable: true },
        { index: 9, isViewable: false },
        { index: null, isViewable: true },
      ]),
    ).toBe(12);
    expect(mobileGridFirstVisibleIndex([])).toBeNull();
  });

  test("the anchored item lands in the matching row of the new column count", () => {
    // Item 13 was the first visible cover in a 2-column outer-display grid;
    // on the inner display's 4 columns it is in row 3.
    expect(mobileGridAnchorRestoreRow({ anchorIndex: 13, columns: 4, itemCount: 40 })).toBe(3);
    expect(mobileGridAnchorRestoreRow({ anchorIndex: 13, columns: 6, itemCount: 40 })).toBe(2);
  });

  test("an anchor in the first row keeps the list at its top (header visible)", () => {
    expect(mobileGridAnchorRestoreRow({ anchorIndex: 3, columns: 4, itemCount: 40 })).toBeNull();
    expect(mobileGridAnchorRestoreRow({ anchorIndex: null, columns: 4, itemCount: 40 })).toBeNull();
  });

  test("an anchor past a shrunken list clamps to the last item", () => {
    expect(mobileGridAnchorRestoreRow({ anchorIndex: 99, columns: 4, itemCount: 10 })).toBe(2);
    expect(mobileGridAnchorRestoreRow({ anchorIndex: 5, columns: 4, itemCount: 0 })).toBeNull();
  });

  test("layout key changes with columns or a rounded cell width", () => {
    expect(mobileGridAnchorLayoutKey({ columns: 4, itemWidth: 150.2 })).toBe(
      mobileGridAnchorLayoutKey({ columns: 4, itemWidth: 149.9 }),
    );
    expect(mobileGridAnchorLayoutKey({ columns: 4, itemWidth: 150 })).not.toBe(
      mobileGridAnchorLayoutKey({ columns: 6, itemWidth: 150 }),
    );
  });

  test("fallback offset estimates the row below the adjusted top inset", () => {
    expect(mobileGridAnchorFallbackOffset({ row: 5, averageRowLength: 240, insetTop: 100 })).toBe(1100);
    expect(mobileGridAnchorFallbackOffset({ row: 5, averageRowLength: 0, insetTop: 100 })).toBe(-100);
  });
});
