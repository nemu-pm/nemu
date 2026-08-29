import { describe, expect, test } from "bun:test";
import { getMobileSettingsSheetLayout } from "./mobileSettingsSheetLayout";

describe("getMobileSettingsSheetLayout", () => {
  test("content-sizes a short settings form in a normal portrait viewport", () => {
    expect(
      getMobileSettingsSheetLayout({
        fontScale: 1,
        height: 844,
        rowCount: 4,
        width: 390,
      }),
    ).toEqual({ scroll: false, snapPoint: undefined });
  });

  test("bounds a long settings form so its rows can scroll", () => {
    expect(
      getMobileSettingsSheetLayout({
        fontScale: 1,
        height: 844,
        rowCount: 5,
        width: 390,
      }),
    ).toEqual({ scroll: true, snapPoint: "82%" });
  });

  test.each([
    { fontScale: 1.5, height: 844, rowCount: 1, width: 390 },
    { fontScale: 1, height: 390, rowCount: 1, width: 844 },
    { fontScale: 1, height: 667, rowCount: 1, width: 375 },
  ])("content-sizes constrained short forms when their content still fits", (input) => {
    expect(getMobileSettingsSheetLayout(input)).toEqual({
      scroll: false,
      snapPoint: undefined,
    });
  });

  test.each([
    { fontScale: 1.5, height: 844, rowCount: 5, width: 390 },
    { fontScale: 1, height: 390, rowCount: 3, width: 844 },
    { fontScale: 1.5, height: 667, rowCount: 4, width: 375 },
  ])("bounds accessibility, landscape, and compact forms that would overflow", (input) => {
    expect(getMobileSettingsSheetLayout(input)).toEqual({
      scroll: true,
      snapPoint: "82%",
    });
  });
});
