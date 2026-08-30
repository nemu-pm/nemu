import { describe, expect, test } from "bun:test";
import { getMobileAddBooksSheetLayout } from "./mobileAddBooksSheetLayout";

describe("getMobileAddBooksSheetLayout", () => {
  test("sizes short portrait lists to their estimated content", () => {
    expect(
      getMobileAddBooksSheetLayout({
        entryCount: 0,
        fontScale: 1,
        height: 840,
        width: 432,
      }),
    ).toEqual({ snapPoints: undefined, bounded: false });
    expect(
      getMobileAddBooksSheetLayout({
        entryCount: 1,
        fontScale: 1,
        height: 840,
        width: 432,
      }),
    ).toEqual({ snapPoints: undefined, bounded: false });
  });

  test("bounds long, landscape, and accessibility layouts", () => {
    for (const input of [
      { entryCount: 7, fontScale: 1, height: 840, width: 432 },
      { entryCount: 1, fontScale: 1, height: 432, width: 840 },
      { entryCount: 1, fontScale: 1.6, height: 840, width: 432 },
    ]) {
      expect(getMobileAddBooksSheetLayout(input)).toEqual({
        snapPoints: ["62%", "88%"],
        bounded: true,
      });
    }
  });
});
