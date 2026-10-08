import { describe, expect, test } from "bun:test";
import { getMobileStrings } from "./mobileI18n";
import { isMobileSettingsHeadingEmpty, isMobileSettingsHeadingRepeat } from "./mobileSettingsHeading";

describe("settings card headings", () => {
  test("a heading repeating its page's title is a repeat; a bare 'settings' heading says nothing", () => {
    for (const language of ["en", "ja", "zh"] as const) {
      const strings = getMobileStrings(language);
      expect(isMobileSettingsHeadingRepeat(strings.reader.title, strings.reader.title)).toBe(true);
      expect(isMobileSettingsHeadingRepeat(strings.settings.plugins, strings.reader.title)).toBe(false);
    }
    expect(isMobileSettingsHeadingEmpty(" settings ")).toBe(true);
    expect(isMobileSettingsHeadingEmpty("Reader Settings")).toBe(false);
  });
});
