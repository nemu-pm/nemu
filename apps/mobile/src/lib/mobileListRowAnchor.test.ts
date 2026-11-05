import { describe, expect, test } from "bun:test";
import { isMobileListAtRest, mobileListRowAnchor, mobileListRowAnchorOffset } from "./mobileListRowAnchor";

// Chapter rows 58 pt tall under a 700 pt header (the hero in the list).
const rows = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => ({ index: from + i, y: 700 + (from + i) * 58, height: 58 }));

describe("the chapter at the top of a list through a rotation or fold", () => {
  test("is the row under the visible top, and how far into it the top is", () => {
    expect(mobileListRowAnchor(rows(10, 30), 700 + 12 * 58 + 20)).toEqual({ index: 12, delta: 20 });
    expect(mobileListRowAnchor(rows(10, 30), 700 + 12 * 58)).toEqual({ index: 12, delta: 0 });
  });

  test("none while the header still shows above the first row (a page at its top stays at its top)", () => {
    expect(mobileListRowAnchor(rows(0, 12), 0)).toBeNull();
    expect(mobileListRowAnchor(rows(0, 12), 699)).toBeNull();
    expect(mobileListRowAnchor(rows(0, 12), 700)).toEqual({ index: 0, delta: 0 });
  });

  test("frames in any order; nothing laid out or no offset known gives none", () => {
    expect(mobileListRowAnchor([...rows(10, 14)].reverse(), 700 + 11 * 58 + 5)).toEqual({ index: 11, delta: 5 });
    expect(mobileListRowAnchor([], 1200)).toBeNull();
    expect(mobileListRowAnchor(rows(10, 14), Number.NaN)).toBeNull();
    // Scrolled past every laid-out row.
    expect(mobileListRowAnchor(rows(10, 14), 700 + 40 * 58)).toBeNull();
  });

  test("puts the row back under the new bar at its new place", () => {
    // Landscape columns (no bar inset) → portrait under a 98 pt bar, the hero
    // back above the rows.
    const anchor = { index: 12, delta: 20 };
    expect(mobileListRowAnchorOffset(anchor, { y: 1400, height: 58 }, 98)).toBe(1400 + 20 - 98);
    expect(mobileListRowAnchorOffset(anchor, { y: 1400, height: 58 }, 0)).toBe(1420);
    // A row that got shorter keeps the top inside it.
    expect(mobileListRowAnchorOffset({ index: 12, delta: 50 }, { y: 1400, height: 40 }, 0)).toBe(1439);
  });
});

describe("isMobileListAtRest", () => {
  test("never scrolled, at offset 0 beside a rail, or at minus the bar's inset", () => {
    expect(isMobileListAtRest(null)).toBe(true);
    expect(isMobileListAtRest(0)).toBe(true);
    expect(isMobileListAtRest(-82)).toBe(true);
  });

  test("a scrolled list is not", () => {
    expect(isMobileListAtRest(12)).toBe(false);
    expect(isMobileListAtRest(Number.NaN)).toBe(false);
  });
});
