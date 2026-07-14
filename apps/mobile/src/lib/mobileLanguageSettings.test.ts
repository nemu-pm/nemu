import { describe, expect, test } from "bun:test";
import {
  DEFAULT_APP_LANGUAGE,
  DEFAULT_METADATA_LANGUAGE_PREFERENCE,
  getEffectiveMetadataLanguage,
  normalizeAppLanguage,
  normalizeMetadataLanguagePreference,
  sortSourcesByLanguagePriority,
} from "./mobileLanguageSettings";

describe("mobile language settings helpers", () => {
  test("accepts supported app languages", () => {
    expect(normalizeAppLanguage("en")).toBe("en");
    expect(normalizeAppLanguage("zh")).toBe("zh");
    expect(normalizeAppLanguage("ja")).toBe("ja");
  });

  test("falls back to English for unsupported app languages", () => {
    expect(normalizeAppLanguage(undefined)).toBe(DEFAULT_APP_LANGUAGE);
    expect(normalizeAppLanguage("fr")).toBe(DEFAULT_APP_LANGUAGE);
  });

  test("accepts supported metadata language preferences", () => {
    expect(normalizeMetadataLanguagePreference("auto")).toBe("auto");
    expect(normalizeMetadataLanguagePreference("en")).toBe("en");
    expect(normalizeMetadataLanguagePreference("zh")).toBe("zh");
    expect(normalizeMetadataLanguagePreference("ja")).toBe("ja");
  });

  test("falls back to auto for unsupported metadata language preferences", () => {
    expect(normalizeMetadataLanguagePreference(undefined)).toBe(
      DEFAULT_METADATA_LANGUAGE_PREFERENCE
    );
    expect(normalizeMetadataLanguagePreference("fr")).toBe(
      DEFAULT_METADATA_LANGUAGE_PREFERENCE
    );
  });

  test("resolves auto metadata language from the app language", () => {
    expect(getEffectiveMetadataLanguage("auto", "zh")).toBe("zh");
    expect(getEffectiveMetadataLanguage("ja", "zh")).toBe("ja");
  });

  test("sorts sources with the web language priority order", () => {
    const sources = [
      { id: "fr", languages: ["fr"] },
      { id: "multi", languages: ["multi"] },
      { id: "zh", languages: ["zh"] },
      { id: "en", languages: ["en"] },
      { id: "ja", languages: ["ja"] },
    ];

    expect(sortSourcesByLanguagePriority(sources, "zh").map((source) => source.id)).toEqual([
      "ja",
      "en",
      "zh",
      "multi",
      "fr",
    ]);
  });
});
