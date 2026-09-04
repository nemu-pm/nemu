import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  getMobileAboutSheetLayout,
  MOBILE_ABOUT_VERSION_PULSE,
  shouldAnimateMobileAboutVersionPulse,
} from "./mobileAboutLayout";

describe("getMobileAboutSheetLayout", () => {
  test("keeps the native version pulse linked to the production web marker", () => {
    const webAbout = readFileSync(
      path.join(import.meta.dir, "../../../../src/components/about-dialog.tsx"),
      "utf8",
    );
    expect(webAbout).toContain("bg-green-500 animate-pulse");
    expect(MOBILE_ABOUT_VERSION_PULSE).toEqual({
      duration: 2_000,
      easing: [0.4, 0, 0.6, 1],
      midpointOpacity: 0.5,
    });
  });

  test("does not pulse before the native reduce-motion preference resolves", () => {
    expect(shouldAnimateMobileAboutVersionPulse(true, null)).toBe(false);
    expect(shouldAnimateMobileAboutVersionPulse(true, true)).toBe(false);
    expect(shouldAnimateMobileAboutVersionPulse(true, false)).toBe(true);
    expect(shouldAnimateMobileAboutVersionPulse(false, false)).toBe(false);
  });

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
