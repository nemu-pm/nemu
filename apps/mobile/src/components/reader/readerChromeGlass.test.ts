import { describe, expect, test } from "bun:test";
import {
  IOS_LIQUID_GLASS_MIN_VERSION,
  READER_CHROME_GLASS_BORDER,
  READER_CHROME_GLASS_TINT,
  readerChromeGlassBorderColor,
  readerChromeGlassTint,
  shouldUseIosReaderLiquidGlass,
  supportsIosLiquidGlass,
} from "./readerChromeGlass";

describe("supportsIosLiquidGlass", () => {
  test("requires iOS 26 or newer", () => {
    expect(IOS_LIQUID_GLASS_MIN_VERSION).toBe(26);
    expect(supportsIosLiquidGlass("ios", "25.0")).toBe(false);
    expect(supportsIosLiquidGlass("ios", "26.0")).toBe(true);
    expect(supportsIosLiquidGlass("ios", 26)).toBe(true);
  });

  test("is false on non-iOS platforms", () => {
    expect(supportsIosLiquidGlass("android", 36)).toBe(false);
    expect(supportsIosLiquidGlass("web", "26.0")).toBe(false);
  });
});

describe("readerChromeGlassTint", () => {
  test("matches web reader-ui-panel opacity so chrome stays legible on black", () => {
    expect(readerChromeGlassTint("dark")).toBe(READER_CHROME_GLASS_TINT.dark);
    expect(readerChromeGlassTint("light")).toBe(READER_CHROME_GLASS_TINT.light);
    expect(READER_CHROME_GLASS_TINT.light).toContain("0.88");
    expect(READER_CHROME_GLASS_TINT.dark).toContain("0.84");
  });
});

describe("shouldUseIosReaderLiquidGlass", () => {
  test("keeps liquid glass in supported portrait layouts", () => {
    expect(
      shouldUseIosReaderLiquidGlass({
        platformOS: "ios",
        platformVersion: 26,
        width: 402,
        height: 874,
      }),
    ).toBe(true);
  });

  test("uses one React Native surface in landscape", () => {
    expect(
      shouldUseIosReaderLiquidGlass({
        platformOS: "ios",
        platformVersion: 26,
        width: 874,
        height: 402,
      }),
    ).toBe(false);
  });

  test("fails closed for invalid dimensions or unsupported platforms", () => {
    expect(
      shouldUseIosReaderLiquidGlass({
        platformOS: "ios",
        platformVersion: 26,
        width: 0,
        height: 0,
      }),
    ).toBe(false);
    expect(
      shouldUseIosReaderLiquidGlass({
        platformOS: "android",
        platformVersion: 36,
        width: 402,
        height: 874,
      }),
    ).toBe(false);
  });
});

describe("readerChromeGlassBorderColor", () => {
  test("lifts the dark-mode border for separation without an opaque fill", () => {
    expect(readerChromeGlassBorderColor("dark", "rgba(255,255,255,0.12)")).toBe(
      READER_CHROME_GLASS_BORDER.dark,
    );
    expect(readerChromeGlassBorderColor("light", "rgba(0,0,0,0.12)")).toBe(
      "rgba(0,0,0,0.12)",
    );
  });
});
