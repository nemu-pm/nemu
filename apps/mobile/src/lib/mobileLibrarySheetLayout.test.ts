import { describe, expect, test } from "bun:test";
import {
  getMobileCollectionsManagerSheetLayout,
  getMobileLibraryTitleMenuSheetLayout,
  getMobileManageCollectionSheetLayout,
} from "./mobileLibrarySheetLayout";

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

  test("bounds both short and long collection editing for the fixed commit footer", () => {
    expect(
      getMobileManageCollectionSheetLayout({
        ...portrait,
        collectionCount: 1,
      }),
    ).toEqual({ snapPoints: ["78%"], scroll: false });
    expect(
      getMobileManageCollectionSheetLayout({
        ...portrait,
        collectionCount: 7,
      }),
    ).toEqual({ snapPoints: ["78%"], scroll: false });
  });

  test("opens landscape collection editing at its fully accessible height", () => {
    expect(
      getMobileManageCollectionSheetLayout({
        fontScale: 1,
        height: 432,
        width: 840,
        collectionCount: 1,
      }),
    ).toEqual({
      snapPoints: ["100%"],
      scroll: false,
    });
  });
});
