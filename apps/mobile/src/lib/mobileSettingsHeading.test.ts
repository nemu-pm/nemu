import { describe, expect, test } from "bun:test";
import { getMobileStrings } from "./mobileI18n";
import { isMobileSettingsHeadingEmpty, isMobileSettingsHeadingRepeat } from "./mobileSettingsHeading";

describe("settings card headings", () => {
  test("a heading that repeats its page's title is a repeat; another heading is not", () => {
    for (const language of ["en", "ja", "zh"] as const) {
      const strings = getMobileStrings(language);
      expect(isMobileSettingsHeadingRepeat(strings.reader.title, strings.reader.title)).toBe(true);
      expect(isMobileSettingsHeadingRepeat(strings.settings.appearance, strings.settings.appearance)).toBe(true);
      expect(isMobileSettingsHeadingRepeat(strings.settings.plugins, strings.reader.title)).toBe(false);
      expect(isMobileSettingsHeadingRepeat(strings.settings.feedbackSection, undefined)).toBe(false);
    }
    expect(isMobileSettingsHeadingRepeat("Reader Settings", "Reader")).toBe(true);
  });

  test("a group heading that is only the word settings says nothing", () => {
    for (const title of ["Settings", "SETTINGS", " settings ", "設定", "设置"]) {
      expect(isMobileSettingsHeadingEmpty(title)).toBe(true);
    }
    for (const title of ["Account", "Reader Settings", "", undefined]) {
      expect(isMobileSettingsHeadingEmpty(title)).toBe(false);
    }
  });
});
