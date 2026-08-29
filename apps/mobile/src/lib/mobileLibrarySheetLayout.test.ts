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

  test("content-sizes short collection editing and bounds long lists", () => {
    expect(
      getMobileManageCollectionSheetLayout({
        ...portrait,
        collectionCount: 1,
      }),
    ).toEqual({ snapPoints: undefined, scroll: false });
    expect(
      getMobileManageCollectionSheetLayout({
        ...portrait,
        collectionCount: 7,
      }),
    ).toEqual({ snapPoints: ["78%"], scroll: true });
  });
});
