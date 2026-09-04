import { describe, expect, test } from "bun:test";
import {
  NEMU_TEXT_COMPACT_MAX_FONT_SIZE_MULTIPLIER,
  resolveNemuTextMaxFontSizeMultiplier,
} from "./nemuTextStyle";

// The app-wide cap lives in `@/design/typography`, which imports react-native's
// Flow-typed entry point and cannot be loaded by bun's test runner. Mirror the
// value here; `nemuTextStyle.ts` never hardcodes it.
const APP_MAX_FONT_SIZE_MULTIPLIER = 1.6;

describe("resolveNemuTextMaxFontSizeMultiplier", () => {
  test("defaults to the app-wide cap", () => {
    expect(
      resolveNemuTextMaxFontSizeMultiplier({
        defaultMultiplier: APP_MAX_FONT_SIZE_MULTIPLIER,
      }),
    ).toBe(APP_MAX_FONT_SIZE_MULTIPLIER);
  });

  test("tightens the cap on compact surfaces", () => {
    expect(
      resolveNemuTextMaxFontSizeMultiplier({
        density: "compact",
        defaultMultiplier: APP_MAX_FONT_SIZE_MULTIPLIER,
      }),
    ).toBe(NEMU_TEXT_COMPACT_MAX_FONT_SIZE_MULTIPLIER);
    expect(NEMU_TEXT_COMPACT_MAX_FONT_SIZE_MULTIPLIER).toBeLessThan(
      APP_MAX_FONT_SIZE_MULTIPLIER,
    );
  });

  test("an explicit prop overrides both defaults", () => {
    expect(
      resolveNemuTextMaxFontSizeMultiplier({
        defaultMultiplier: APP_MAX_FONT_SIZE_MULTIPLIER,
        override: 1.2,
      }),
    ).toBe(1.2);
    expect(
      resolveNemuTextMaxFontSizeMultiplier({
        density: "compact",
        defaultMultiplier: APP_MAX_FONT_SIZE_MULTIPLIER,
        override: 3,
      }),
    ).toBe(3);
  });

  test("ignores a missing or non-finite override", () => {
    expect(
      resolveNemuTextMaxFontSizeMultiplier({
        defaultMultiplier: APP_MAX_FONT_SIZE_MULTIPLIER,
        override: undefined,
      }),
    ).toBe(APP_MAX_FONT_SIZE_MULTIPLIER);
    expect(
      resolveNemuTextMaxFontSizeMultiplier({
        density: "compact",
        defaultMultiplier: APP_MAX_FONT_SIZE_MULTIPLIER,
        override: Number.NaN,
      }),
    ).toBe(NEMU_TEXT_COMPACT_MAX_FONT_SIZE_MULTIPLIER);
  });
});
