import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  DEFAULT_READER_PAGE_TURN_HAPTICS,
  mobileReaderPageTurnHapticsEnabled,
  normalizeReaderPageTurnHaptics,
  setMobileReaderPageTurnHapticsEnabled,
} from "./mobileReaderPageTurnHaptics";

const read = (file: string) => readFileSync(path.join(import.meta.dir, "..", file), "utf8");

afterEach(() => setMobileReaderPageTurnHapticsEnabled(DEFAULT_READER_PAGE_TURN_HAPTICS));

describe("Page Turn Haptics", () => {
  test("off by default, and when nothing is saved", () => {
    expect(DEFAULT_READER_PAGE_TURN_HAPTICS).toBe(false);
    expect(mobileReaderPageTurnHapticsEnabled()).toBe(false);
    expect(normalizeReaderPageTurnHaptics(undefined)).toBe(false);
    expect(normalizeReaderPageTurnHaptics("yes")).toBe(false);
  });

  test("the saved choice turns the gate on and off", () => {
    expect(normalizeReaderPageTurnHaptics(true)).toBe(true);
    setMobileReaderPageTurnHapticsEnabled(true);
    expect(mobileReaderPageTurnHapticsEnabled()).toBe(true);
    setMobileReaderPageTurnHapticsEnabled(false);
    expect(mobileReaderPageTurnHapticsEnabled()).toBe(false);
  });
});

describe("every page-turn haptic asks the gate", () => {
  test("a turn, a swipe, a slide or curl turn and a chapter crossing (notifyReaderPageTurn)", () => {
    const reader = read("screens/ReaderScreen.tsx");
    expect(reader).toContain('if (arrival === "initial" || !mobileReaderPageTurnHapticsEnabled()) return;');
    expect(reader).toContain("setMobileReaderPageTurnHapticsEnabled(readerPageTurnHaptics);");
  });

  test("the slider's page ticks and the strip's pull", () => {
    const scrubber = read("components/MobileReaderScrubber.tsx");
    expect(scrubber).toContain("if (mobileReaderPageTurnHapticsEnabled()) void hapticPress();");
    expect(scrubber).toMatch(/lastPreviewPageHapticRef\.current !== nextPageIndex &&\s*mobileReaderPageTurnHapticsEnabled\(\)/);
    expect(read("components/reader/MobileReaderGallery.tsx")).toContain(
      "if (pulled.haptic && mobileReaderPageTurnHapticsEnabled()) void hapticSelection();",
    );
  });

  test("a row under More in both settings surfaces, in every language", () => {
    expect(read("components/reader/ReaderSettingsNativePopover.ios.tsx")).toContain("strings.feedback.displayPageTurnHaptics");
    expect(read("components/reader/ReaderDisplaySettingsPopover.tsx")).toContain("strings.feedback.displayPageTurnHaptics");
    for (const language of ["en", "zh", "ja"]) {
      expect(read(`lib/mobileI18n.${language}.ts`)).toMatch(/displayPageTurnHaptics: "[^"]+"/);
    }
  });
});
