import { describe, expect, test } from "bun:test";
import { getMobileDualReaderSheetLayout } from "./mobileDualReaderSheetLayout";

describe("getMobileDualReaderSheetLayout", () => {
  test("hugs a short empty state", () => {
    expect(
      getMobileDualReaderSheetLayout({
        candidateCount: 1,
        chapterCount: 0,
        fontScale: 1,
        height: 900,
        loading: false,
        width: 420,
      }),
    ).toEqual({ frameMaxHeight: "auto", listFillsFrame: false });
  });

  test("hugs a small selectable chapter list", () => {
    expect(
      getMobileDualReaderSheetLayout({
        candidateCount: 1,
        chapterCount: 3,
        fontScale: 1,
        height: 900,
        loading: false,
        width: 420,
      }),
    ).toEqual({ frameMaxHeight: "auto", listFillsFrame: false });
  });

  test("bounds long chapter lists", () => {
    expect(
      getMobileDualReaderSheetLayout({
        candidateCount: 1,
        chapterCount: 4,
        fontScale: 1,
        height: 900,
        loading: false,
        width: 420,
      }),
    ).toEqual({ frameMaxHeight: "85%", listFillsFrame: true });
  });

  test("bounds many linked sources", () => {
    expect(
      getMobileDualReaderSheetLayout({
        candidateCount: 3,
        chapterCount: 0,
        fontScale: 1,
        height: 900,
        loading: false,
        width: 420,
      }),
    ).toEqual({ frameMaxHeight: "85%", listFillsFrame: true });
  });

  test("bounds large text and landscape layouts", () => {
    expect(
      getMobileDualReaderSheetLayout({
        candidateCount: 1,
        chapterCount: 0,
        fontScale: 1.8,
        height: 900,
        loading: true,
        width: 420,
      }),
    ).toEqual({ frameMaxHeight: "85%", listFillsFrame: true });

    expect(
      getMobileDualReaderSheetLayout({
        candidateCount: 1,
        chapterCount: 0,
        fontScale: 1,
        height: 420,
        loading: false,
        width: 900,
      }),
    ).toEqual({ frameMaxHeight: "85%", listFillsFrame: true });
  });
});
