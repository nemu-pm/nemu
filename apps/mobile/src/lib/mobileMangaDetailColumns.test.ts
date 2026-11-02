import { describe, expect, test } from "bun:test";
import { mobileAdaptiveLayout, mobileFoldSplitForContainer } from "./mobileAdaptiveLayout";
import {
  getMobileDetailColumnsLayout as columns,
  MOBILE_DETAIL_COLUMNS_MIN_CONTENT_WIDTH,
  mobileDetailUsesColumns,
} from "./mobileMangaDetailColumns";

const plain = { left: 20, right: 20 };
const flat = { posture: "flat" as const, foldSplit: null };

describe("manga detail columns", () => {
  test("the Duo's inner display in landscape (rail on either edge) gets two columns", () => {
    for (const gutters of [{ left: 20, right: 76 }, { left: 76, right: 20 }]) {
      const layout = columns({ containerWidth: 951, compactHeight: false, gutters, ...flat });
      expect(layout.mode).toBe("split");
      if (layout.mode !== "split") continue;
      // The hero column's content share is the same whichever edge the rail is on.
      expect(layout.leading.width - gutters.left).toBe(Math.round((951 - 96) * 0.44));
      expect(layout.trailing.x).toBe(layout.leading.width);
      expect(layout.leading.width + layout.trailing.width).toBe(951);
      expect(layout.gutter).toBe(0);
    }
  });

  test("tablets in both orientations get two columns, the hero column clamped", () => {
    // iPad Air 11" portrait / landscape, iPad Pro 13" landscape.
    expect(columns({ containerWidth: 820, compactHeight: false, gutters: plain, ...flat })).toMatchObject({
      mode: "split",
      leading: { width: 20 + 343 },
    });
    expect(columns({ containerWidth: 1180, compactHeight: false, gutters: plain, ...flat })).toMatchObject({
      leading: { width: 20 + 480 },
    });
    expect(columns({ containerWidth: 1376, compactHeight: false, gutters: plain, ...flat })).toMatchObject({
      leading: { width: 20 + 480 },
      trailing: { x: 500, width: 876 },
    });
  });

  test("narrow and short windows keep the one-list page", () => {
    const single = { mode: "single" as const };
    // Duo inner portrait, Duo outer (both orientations), iPad mini portrait.
    expect(columns({ containerWidth: 669, compactHeight: false, gutters: plain, ...flat })).toEqual(single);
    expect(columns({ containerWidth: 466, compactHeight: false, gutters: { left: 16, right: 76 }, ...flat })).toEqual(single);
    expect(columns({ containerWidth: 678, compactHeight: true, gutters: { left: 76, right: 16 }, ...flat })).toEqual(single);
    expect(columns({ containerWidth: 744, compactHeight: false, gutters: plain, ...flat })).toEqual(single);
    // A phone in landscape is wide but short.
    expect(columns({ containerWidth: 956, compactHeight: true, gutters: { left: 62, right: 62 }, ...flat })).toEqual(single);
    // Split View halves and two-thirds on tablets.
    expect(columns({ containerWidth: 590, compactHeight: false, gutters: plain, ...flat })).toEqual(single);
    expect(columns({ containerWidth: 778, compactHeight: false, gutters: plain, ...flat })).toEqual(single);
    expect(columns({ containerWidth: 0, compactHeight: false, gutters: plain, ...flat })).toEqual(single);
  });

  test("the breakpoint is the content width, gutters taken off", () => {
    const at = MOBILE_DETAIL_COLUMNS_MIN_CONTENT_WIDTH;
    expect(mobileDetailUsesColumns({ containerWidth: at + 40, compactHeight: false, gutters: plain })).toBe(true);
    expect(mobileDetailUsesColumns({ containerWidth: at + 39, compactHeight: false, gutters: plain })).toBe(false);
    // The same window loses the columns when a vertical bar takes its edge.
    expect(mobileDetailUsesColumns({ containerWidth: at + 40, compactHeight: false, gutters: { left: 20, right: 76 } })).toBe(false);
    expect(mobileDetailUsesColumns({ containerWidth: 1200, compactHeight: true, gutters: plain })).toBe(false);
  });

  test("book posture: the columns are the fold halves", () => {
    const hinge = { id: "hinge", x: 465, y: 0, width: 21, height: 669, active: true };
    const adaptive = mobileAdaptiveLayout({ width: 951, height: 669, supported: true, divisions: [hinge], occlusions: [] });
    const foldSplit = mobileFoldSplitForContainer(adaptive, { x: 0, y: 0, width: 951, height: 669 });
    expect(columns({ containerWidth: 951, compactHeight: false, gutters: { left: 20, right: 76 }, posture: "book", foldSplit })).toEqual({
      mode: "split",
      alignment: "fold",
      leading: { x: 0, width: 465 },
      trailing: { x: 486, width: 465 },
      gutter: 21,
    });
  });

  test("notebook posture keeps one list (each column would straddle the fold)", () => {
    expect(columns({ containerWidth: 951, compactHeight: false, gutters: plain, posture: "notebook", foldSplit: null })).toEqual({
      mode: "single",
    });
  });
});
