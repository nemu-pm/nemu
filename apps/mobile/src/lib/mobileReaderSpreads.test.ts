import { describe, expect, test } from "bun:test";
import {
  buildMobileReaderDisplaySpreads,
  buildMobileReaderSpreads,
  findMobileReaderSpreadIndex,
  firstPageIndexForMobileReaderSpread,
  visualPageIndexesForMobileReaderSpread,
} from "./mobileReaderSpreads";

describe("mobile reader spreads", () => {
  test("builds manga-style spreads with the first page alone", () => {
    expect(buildMobileReaderSpreads(5, "manga")).toEqual([[0], [1, 2], [3, 4]]);
    expect(buildMobileReaderSpreads(4, "manga")).toEqual([[0], [1, 2], [3]]);
  });

  test("builds book-style paired spreads from the first page", () => {
    expect(buildMobileReaderSpreads(5, "book")).toEqual([[0, 1], [2, 3], [4]]);
    expect(buildMobileReaderSpreads(0, "book")).toEqual([]);
  });

  test("keeps manga spreads in source order for every reading mode", () => {
    expect(buildMobileReaderDisplaySpreads(5, "manga", "rtl")).toEqual([
      [0],
      [1, 2],
      [3, 4],
    ]);
    expect(buildMobileReaderDisplaySpreads(5, "manga", "ltr")).toEqual([
      [0],
      [1, 2],
      [3, 4],
    ]);
  });

  test("keeps the first source page solo in RTL manga pairing", () => {
    const spreads = buildMobileReaderDisplaySpreads(5, "manga", "rtl");

    expect(findMobileReaderSpreadIndex(spreads, 0)).toBe(0);
    expect(firstPageIndexForMobileReaderSpread(spreads, 0)).toBe(0);
    expect(visualPageIndexesForMobileReaderSpread(spreads[0]!, "rtl")).toEqual([0]);
    expect(visualPageIndexesForMobileReaderSpread(spreads[1]!, "rtl")).toEqual([
      2,
      1,
    ]);
  });

  test("finds and clamps spread indexes for page positions", () => {
    const spreads = buildMobileReaderSpreads(5, "manga");
    expect(findMobileReaderSpreadIndex(spreads, 0)).toBe(0);
    expect(findMobileReaderSpreadIndex(spreads, 2)).toBe(1);
    expect(findMobileReaderSpreadIndex(spreads, 99)).toBe(2);
    expect(findMobileReaderSpreadIndex(spreads, -4)).toBe(0);
    expect(firstPageIndexForMobileReaderSpread(spreads, 2)).toBe(3);
    expect(firstPageIndexForMobileReaderSpread(spreads, 99)).toBe(3);
  });

  test("places the first-read page on the reading-direction side", () => {
    // RTL (manga): first-read page renders on the right, so it comes last in
    // the left→right render order. LTR reads left→right, so order is as-is.
    expect(visualPageIndexesForMobileReaderSpread([1, 2], "rtl")).toEqual([2, 1]);
    expect(visualPageIndexesForMobileReaderSpread([1, 2], "ltr")).toEqual([1, 2]);
    expect(visualPageIndexesForMobileReaderSpread([1], "ltr")).toEqual([1]);
  });
});
