import { describe, expect, test } from "bun:test";
import { resolveMobileMeasuredRowLayout } from "./mobileMeasuredRowLayout";

const ROW = 58 + 1 / 3;
const VOLUME = ROW + 46;
const heights = new Map([
  ["row", ROW],
  ["volume", VOLUME],
]);
// A volume header over rows 0 and 3; the rows start 420pt down (the hero).
const kinds = ["volume", "row", "row", "volume", "row"];
const TOP = 420;
const starts = [0, VOLUME, VOLUME + ROW, VOLUME + 2 * ROW, 2 * VOLUME + 2 * ROW];

function laidOut(indexes: number[], shift = 0) {
  return indexes.map((index) => ({
    index,
    y: TOP + starts[index] + shift,
    height: kinds[index] === "volume" ? VOLUME : ROW,
  }));
}

describe("measured row layout", () => {
  test("predicts every row from the kinds' heights and the rows on screen", () => {
    const layout = resolveMobileMeasuredRowLayout(kinds, laidOut([1, 2]), heights);
    expect(layout).not.toBeNull();
    layout!.offsets.forEach((offset, index) => expect(offset).toBeCloseTo(TOP + starts[index], 6));
    expect(layout!.lengths).toEqual([VOLUME, ROW, ROW, VOLUME, ROW]);
  });

  test("tolerates pixel rounding, not a row out of place", () => {
    const rows = laidOut([0, 1, 2]);
    rows[2] = { ...rows[2], y: rows[2].y + 0.33 };
    expect(resolveMobileMeasuredRowLayout(kinds, rows, heights)).not.toBeNull();
    rows[2] = { ...rows[2], y: rows[2].y + 2 };
    expect(resolveMobileMeasuredRowLayout(kinds, rows, heights)).toBeNull();
  });

  test("a row taller than its kind (larger text, a wrapped title) turns it off", () => {
    const rows = laidOut([0, 1]);
    rows[1] = { ...rows[1], height: ROW + 17 };
    expect(resolveMobileMeasuredRowLayout(kinds, rows, heights)).toBeNull();
  });

  test("a kind in the data that was never laid out turns it off", () => {
    const withRange = [...kinds, "volume-range"];
    expect(resolveMobileMeasuredRowLayout(withRange, laidOut([0, 1]), heights)).toBeNull();
  });

  test("the header above the rows growing moves every prediction with it", () => {
    const layout = resolveMobileMeasuredRowLayout(kinds, laidOut([3, 4], 24), heights);
    expect(layout!.offsets[0]).toBeCloseTo(TOP + 24, 6);
  });

  test("nothing laid out, or no rows: off", () => {
    expect(resolveMobileMeasuredRowLayout(kinds, [], heights)).toBeNull();
    expect(resolveMobileMeasuredRowLayout([], laidOut([0]), heights)).toBeNull();
    expect(resolveMobileMeasuredRowLayout(kinds, [{ index: 9, y: 0, height: ROW }], heights)).toBeNull();
  });
});
