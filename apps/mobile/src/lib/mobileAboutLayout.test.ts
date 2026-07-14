import { describe, expect, test } from "bun:test";
import { getMobileAboutSheetLayout } from "./mobileAboutLayout";

describe("getMobileAboutSheetLayout", () => {
  test("preserves the compact fixed iOS presentation at the default text size", () => {
    expect(
      getMobileAboutSheetLayout({
        bottomInset: 34,
        fontScale: 1,
        height: 844,
        platform: "ios",
        topInset: 47,
        width: 390,
      }),
    ).toEqual({ scroll: true, snapPointHeight: 392 });
  });

  test("allows a taller scrollable sheet for accessibility text", () => {
    expect(
      getMobileAboutSheetLayout({
        bottomInset: 34,
        fontScale: 2,
        height: 844,
        platform: "ios",
        topInset: 47,
        width: 390,
      }),
    ).toEqual({ scroll: true, snapPointHeight: 512 });
  });

  test("bounds the sheet to the usable landscape viewport", () => {
    expect(
      getMobileAboutSheetLayout({
        bottomInset: 20,
        fontScale: 1,
        height: 360,
        platform: "android",
        topInset: 24,
        width: 780,
      }),
    ).toEqual({ scroll: true, snapPointHeight: 316 });
  });

  test("keeps normal Android portrait dynamic sizing", () => {
    expect(
      getMobileAboutSheetLayout({
        bottomInset: 24,
        fontScale: 1,
        height: 780,
        platform: "android",
        topInset: 24,
        width: 360,
      }),
    ).toEqual({ scroll: false, snapPointHeight: undefined });
  });
});
