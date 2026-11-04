import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  estimateMobileAboutSheetContentHeight,
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
    ).toEqual({ hero: "regular", scroll: false, snapPoint: undefined });
  });

  test("keeps accessibility text content-sized when the window has room", () => {
    expect(
      getMobileAboutSheetLayout({
        bottomInset: 34,
        fontScale: 2,
        height: 844,
        platform: "ios",
        topInset: 47,
        width: 390,
      }),
    ).toEqual({ hero: "regular", scroll: false, snapPoint: undefined });
  });

  test("never scrolls at default text on any iPhone or iPhone Duo pose", () => {
    const poses = [
      // iPhone 17 Pro portrait / landscape.
      { width: 402, height: 874, topInset: 62, bottomInset: 34 },
      { width: 874, height: 402, topInset: 0, bottomInset: 21 },
      // iPhone Duo closed portrait / landscape, open landscape / portrait.
      { width: 466, height: 678, topInset: 0, bottomInset: 34 },
      { width: 678, height: 466, topInset: 0, bottomInset: 34 },
      { width: 951, height: 669, topInset: 0, bottomInset: 34 },
      { width: 669, height: 951, topInset: 82, bottomInset: 34 },
    ];
    for (const pose of poses) {
      const layout = getMobileAboutSheetLayout({
        ...pose,
        fontScale: 1,
        platform: "ios",
      });
      expect(layout.scroll).toBe(false);
      expect(layout.snapPoint).toBeUndefined();
    }
  });

  test("tightens the hero before it ever scrolls in a short window", () => {
    expect(
      getMobileAboutSheetLayout({
        bottomInset: 21,
        fontScale: 1,
        height: 402,
        platform: "ios",
        topInset: 0,
        width: 874,
      }),
    ).toEqual({ hero: "compact", scroll: false, snapPoint: undefined });
    expect(
      estimateMobileAboutSheetContentHeight({ fontScale: 1, hero: "compact" }),
    ).toBeLessThan(
      estimateMobileAboutSheetContentHeight({ fontScale: 1, hero: "regular" }),
    );
  });

  test("scrolls only as the last resort for large text in a short window", () => {
    expect(
      getMobileAboutSheetLayout({
        bottomInset: 21,
        fontScale: 1.6,
        height: 402,
        platform: "ios",
        topInset: 0,
        width: 874,
      }),
    ).toEqual({ hero: "compact", scroll: true, snapPoint: 392 });
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
    ).toEqual({ hero: "regular", scroll: true, snapPoint: "82%" });
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
    ).toEqual({ hero: "regular", scroll: false, snapPoint: undefined });
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
    ).toEqual({ hero: "regular", scroll: false, snapPoint: undefined });
  });
});
