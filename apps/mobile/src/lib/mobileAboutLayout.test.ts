import { describe, expect, test } from "bun:test";
import { getMobileAboutSheetLayout } from "./mobileAboutLayout";

describe("getMobileAboutSheetLayout", () => {
  test("fits normal iOS portrait content instead of reserving a fixed detent", () => {
    expect(
      getMobileAboutSheetLayout({
        bottomInset: 34,
        fontScale: 1,
        height: 844,
        platform: "ios",
        topInset: 47,
        width: 390,
      }),
    ).toEqual({ scroll: false, snapPoint: undefined });
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
    ).toEqual({ scroll: true, snapPoint: 512 });
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
    ).toEqual({ scroll: true, snapPoint: "82%" });
  });

  test("keeps normal Android portrait dynamic", () => {
    expect(
      getMobileAboutSheetLayout({
        bottomInset: 24,
        fontScale: 1,
        height: 780,
        platform: "android",
        topInset: 24,
        width: 360,
      }),
    ).toEqual({ scroll: false, snapPoint: undefined });
  });

  test("keeps large Android portrait content-sized", () => {
    expect(
      getMobileAboutSheetLayout({
        bottomInset: 24,
        fontScale: 1.5,
        height: 873,
        platform: "android",
        topInset: 24,
        width: 393,
      }),
    ).toEqual({ scroll: false, snapPoint: undefined });
  });
});
