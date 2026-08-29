import { describe, expect, test } from "bun:test";
import { getMobileCollectionMembershipSheetLayout } from "./mobileCollectionMembershipLayout";

describe("getMobileCollectionMembershipSheetLayout", () => {
  test("keeps empty and short portrait sheets content-sized", () => {
    expect(
      getMobileCollectionMembershipSheetLayout({
        collectionCount: 0,
        fontScale: 1,
        height: 840,
        width: 432,
      }),
    ).toEqual({ snapPoints: undefined, scroll: false });

    expect(
      getMobileCollectionMembershipSheetLayout({
        collectionCount: 2,
        fontScale: 1,
        height: 840,
        width: 432,
      }),
    ).toEqual({ snapPoints: undefined, scroll: false });
  });

  test("bounds long or constrained sheets and enables scrolling", () => {
    for (const input of [
      { collectionCount: 6, fontScale: 1, height: 840, width: 432 },
      { collectionCount: 4, fontScale: 1.5, height: 840, width: 432 },
      { collectionCount: 2, fontScale: 1, height: 432, width: 840 },
      { collectionCount: 4, fontScale: 1.5, height: 640, width: 360 },
    ]) {
      expect(getMobileCollectionMembershipSheetLayout(input)).toEqual({
        snapPoints: ["82%"],
        scroll: true,
      });
    }
  });

  test("does not manufacture blank space for short accessibility sheets", () => {
    expect(
      getMobileCollectionMembershipSheetLayout({
        collectionCount: 1,
        fontScale: 1.5,
        height: 840,
        width: 432,
      }),
    ).toEqual({ snapPoints: undefined, scroll: false });
  });
});
