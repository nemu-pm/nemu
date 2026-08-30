import { describe, expect, test } from "bun:test";
import { getMobileSourceHomeImageScrollerCardSize } from "./mobileSourceHomeImageScroller";

describe("mobile source home image scroller presentation", () => {
  test("uses the web default banner footprint", () => {
    expect(getMobileSourceHomeImageScrollerCardSize({})).toEqual({
      width: 280,
      height: 160,
    });
  });

  test("honors source-provided image scroller dimensions when they fit", () => {
    expect(
      getMobileSourceHomeImageScrollerCardSize({ width: 300, height: 160 }),
    ).toEqual({ width: 300, height: 160 });
  });

  test("preserves source aspect ratio while bounding oversized banners", () => {
    expect(
      getMobileSourceHomeImageScrollerCardSize({ width: 900, height: 300 }),
    ).toEqual({ width: 340, height: 113 });
  });

  test("derives missing dimensions from the native default aspect ratio", () => {
    expect(getMobileSourceHomeImageScrollerCardSize({ height: 180 })).toEqual({
      width: 315,
      height: 180,
    });
    expect(getMobileSourceHomeImageScrollerCardSize({ width: 210 })).toEqual({
      width: 210,
      height: 120,
    });
  });

  test("ignores invalid source dimensions", () => {
    expect(
      getMobileSourceHomeImageScrollerCardSize({
        width: Number.NaN,
        height: -40,
      }),
    ).toEqual({ width: 280, height: 160 });
  });
});
