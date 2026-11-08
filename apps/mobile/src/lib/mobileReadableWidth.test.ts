import { describe, expect, test } from "bun:test";
import { getMobileReadableGutters, MOBILE_READABLE_WIDTH } from "./mobileReadableWidth";

const gutters = { left: 20, right: 20 };

describe("readable width", () => {
  test("a 13-inch iPad in portrait centres a readable column", () => {
    const padding = getMobileReadableGutters({ containerWidth: 1032, gutters, regularWidth: true });
    expect(padding).toEqual({ paddingLeft: 180, paddingRight: 180 });
    expect(1032 - padding.paddingLeft - padding.paddingRight).toBe(MOBILE_READABLE_WIDTH);
  });

  test("compact widths keep the page gutters, however wide", () => {
    expect(getMobileReadableGutters({ containerWidth: 1032, gutters, regularWidth: false })).toEqual({
      paddingLeft: 20,
      paddingRight: 20,
    });
  });

  test("a window narrower than the column keeps the page gutters", () => {
    expect(getMobileReadableGutters({ containerWidth: 694, gutters, regularWidth: true })).toEqual({
      paddingLeft: 20,
      paddingRight: 20,
    });
  });

  test("larger text widens the column", () => {
    const padding = getMobileReadableGutters({ containerWidth: 1032, gutters, regularWidth: true, fontScale: 1.25 });
    expect(1032 - padding.paddingLeft - padding.paddingRight).toBe(840);
  });

  test("a side safe area keeps its own gutter on top of the centring", () => {
    expect(
      getMobileReadableGutters({ containerWidth: 1032, gutters: { left: 20, right: 60 }, regularWidth: true }),
    ).toEqual({ paddingLeft: 160, paddingRight: 200 });
  });
});
