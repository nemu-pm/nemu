import { describe, expect, test } from "bun:test";
import {
  getMobileCollectionsManagerSheetLayout,
  getMobileLibraryTitleMenuSheetLayout,
  getMobileCollectionListNativeDetents,
  MOBILE_GROUPED_FORM_TOP_MARGIN,
} from "./mobileLibrarySheetLayout";
import {
  getMobileLibraryOptionsNativeSheetHeight,
  MOBILE_LIBRARY_OPTIONS_SHEET_METRICS,
} from "./mobileLibraryOptionsSheetLayout";

describe("mobile library sheet layout", () => {
  const portrait = { fontScale: 1, height: 840, width: 432 };

  test("content-sizes short shelf selectors", () => {
    expect(
      getMobileLibraryTitleMenuSheetLayout({ ...portrait, collectionCount: 0 }),
    ).toEqual({
      snapPoints: undefined,
      scroll: false,
    });
    expect(
      getMobileLibraryTitleMenuSheetLayout({ ...portrait, collectionCount: 3 }),
    ).toEqual({
      snapPoints: undefined,
      scroll: false,
    });
  });

  test("bounds shelf selectors with many collections", () => {
    expect(
      getMobileLibraryTitleMenuSheetLayout({ ...portrait, collectionCount: 9 }),
    ).toEqual({
      snapPoints: ["48%"],
      scroll: true,
    });
  });

  test("bounds taller Material rows sooner than the iOS rows", () => {
    expect(
      getMobileLibraryTitleMenuSheetLayout({ ...portrait, collectionCount: 8 }),
    ).toEqual({ snapPoints: undefined, scroll: false });
    expect(
      getMobileLibraryTitleMenuSheetLayout({
        ...portrait,
        collectionCount: 8,
        rowHeight: 64,
      }),
    ).toEqual({ snapPoints: ["48%"], scroll: true });
    expect(
      getMobileCollectionsManagerSheetLayout({
        ...portrait,
        collectionCount: 7,
      }).scroll,
    ).toBe(false);
    expect(
      getMobileCollectionsManagerSheetLayout({
        ...portrait,
        collectionCount: 7,
        rowHeight: 90,
      }).scroll,
    ).toBe(true);
  });

  test("bounds shelf selectors to the current native sheet width in landscape", () => {
    expect(
      getMobileLibraryTitleMenuSheetLayout({
        fontScale: 1,
        height: 432,
        width: 840,
        collectionCount: 1,
      }),
    ).toEqual({ snapPoints: ["78%", "100%"], scroll: true });
  });

  test("content-sizes the shelf selector on an unfolded foldable in landscape", () => {
    // Pixel Fold inner display, flat: wider than tall but not compact height.
    expect(
      getMobileLibraryTitleMenuSheetLayout({
        fontScale: 1,
        height: 701,
        width: 841,
        collectionCount: 1,
        rowHeight: 64,
      }),
    ).toEqual({ snapPoints: undefined, scroll: false });
  });

  test("content-sizes short collection managers and bounds long ones", () => {
    expect(
      getMobileCollectionsManagerSheetLayout({ ...portrait, collectionCount: 4 }),
    ).toEqual({
      snapPoints: undefined,
      scroll: false,
    });
    expect(
      getMobileCollectionsManagerSheetLayout({ ...portrait, collectionCount: 8 }),
    ).toEqual({
      snapPoints: ["78%"],
      scroll: true,
    });
  });

  test("keeps short accessibility sheets dynamic but bounds overflowing ones", () => {
    const accessibility = { fontScale: 1.5, height: 840, width: 432 };
    expect(
      getMobileLibraryTitleMenuSheetLayout({
        ...accessibility,
        collectionCount: 0,
      }),
    ).toEqual({ snapPoints: undefined, scroll: false });
    expect(
      getMobileCollectionsManagerSheetLayout({
        ...accessibility,
        collectionCount: 1,
      }),
    ).toEqual({ snapPoints: undefined, scroll: false });
    expect(
      getMobileCollectionsManagerSheetLayout({
        ...accessibility,
        collectionCount: 5,
      }),
    ).toEqual({ snapPoints: ["78%"], scroll: true });
  });

  describe("native collection list sheets", () => {
    const window = { fontScale: 1, height: 912, topInset: 62 };

    test("a short list opens at its rows' height, not a half-empty medium", () => {
      const [detent] = getMobileCollectionListNativeDetents({ ...window, collectionCount: 2 });
      expect(typeof detent).toBe("object");
      const height = (detent as { height: number }).height;
      expect(height).toBeGreaterThan(200);
      expect(height).toBeLessThan(912 * 0.5);
    });

    test("budgets the grouped Form's tighter top margin, not the options sheet's", () => {
      const [detent] = getMobileCollectionListNativeDetents({ ...window, collectionCount: 2 });
      const options = getMobileLibraryOptionsNativeSheetHeight({
        sections: [3],
        footerLines: 2,
        maxHeight: window.height - window.topInset,
      });
      expect((detent as { height: number }).height).toBe(
        options - (MOBILE_LIBRARY_OPTIONS_SHEET_METRICS.formTop - MOBILE_GROUPED_FORM_TOP_MARGIN),
      );
    });

    test("each collection adds a row", () => {
      const heightFor = (collectionCount: number) =>
        (getMobileCollectionListNativeDetents({ ...window, collectionCount })[0] as { height: number })
          .height;
      expect(heightFor(3)).toBeGreaterThan(heightFor(2));
      expect(heightFor(0)).toBeLessThan(heightFor(1));
    });

    test("larger text grows the fitted height", () => {
      const regular = getMobileCollectionListNativeDetents({ ...window, collectionCount: 2 })[0] as {
        height: number;
      };
      const large = getMobileCollectionListNativeDetents({
        ...window,
        fontScale: 1.4,
        collectionCount: 2,
      })[0] as { height: number };
      expect(large.height).toBeGreaterThan(regular.height);
    });

    test("a long list gets the medium and large detents to scroll in", () => {
      expect(getMobileCollectionListNativeDetents({ ...window, collectionCount: 12 })).toEqual([
        "medium",
        "large",
      ]);
    });

    test("a phone on its side stays inside the window", () => {
      const detents = getMobileCollectionListNativeDetents({
        fontScale: 1,
        height: 420,
        topInset: 0,
        collectionCount: 1,
      });
      const first = detents[0];
      if (typeof first === "object") expect(first.height).toBeLessThanOrEqual(420);
      else expect(detents).toEqual(["medium", "large"]);
    });
  });
});
