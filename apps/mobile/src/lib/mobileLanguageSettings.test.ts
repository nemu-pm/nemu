import { describe, expect, test } from "bun:test";
import {
  DEFAULT_APP_LANGUAGE,
  DEFAULT_METADATA_LANGUAGE_PREFERENCE,
  getEffectiveMetadataLanguage,
  normalizeAppLanguage,
  normalizeMetadataLanguagePreference,
  resolveDeviceAppLanguage,
  resolveInitialAppLanguage,
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

  test("maps device locales onto shipped app languages", () => {
    expect(
      resolveDeviceAppLanguage([{ languageTag: "ja-JP", languageCode: "ja" }]),
    ).toBe("ja");
    expect(
      resolveDeviceAppLanguage([
        { languageTag: "zh-Hans-CN", languageCode: "zh", languageScriptCode: "Hans" },
      ]),
    ).toBe("zh");
    expect(
      resolveDeviceAppLanguage([
        { languageTag: "zh-CN", languageCode: "zh", regionCode: "CN" },
      ]),
    ).toBe("zh");
    expect(
      resolveDeviceAppLanguage([{ languageTag: "en-US", languageCode: "en" }]),
    ).toBe("en");
  });

  test("leaves Traditional Chinese devices on the default until zh-Hant exists", () => {
    expect(
      resolveDeviceAppLanguage([
        { languageTag: "zh-Hant-TW", languageCode: "zh", languageScriptCode: "Hant" },
      ]),
    ).toBeNull();
    expect(
      resolveDeviceAppLanguage([
        { languageTag: "zh-HK", languageCode: "zh", regionCode: "HK" },
      ]),
    ).toBeNull();
  });

  test("falls through the ordered locale list and ignores unshipped languages", () => {
    expect(
      resolveDeviceAppLanguage([
        { languageTag: "fr-FR", languageCode: "fr" },
        { languageTag: "ja-JP", languageCode: "ja" },
      ]),
    ).toBe("ja");
    expect(resolveDeviceAppLanguage([{ languageTag: "ko-KR", languageCode: "ko" }])).toBeNull();
    expect(resolveDeviceAppLanguage([])).toBeNull();
    expect(resolveDeviceAppLanguage(undefined)).toBeNull();
  });

  test("prefers a persisted app language over the device locale", () => {
    expect(resolveInitialAppLanguage("en", "ja")).toBe("en");
    expect(resolveInitialAppLanguage(undefined, "ja")).toBe("ja");
    expect(resolveInitialAppLanguage(null, null)).toBe(DEFAULT_APP_LANGUAGE);
    expect(resolveInitialAppLanguage("fr", "zh")).toBe("zh");
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
      "zh",
      "en",
      "multi",
      "fr",
    ]);
  });

  test("keeps chinese ahead of english regardless of the app language", () => {
    const sources = [
      { id: "en", languages: ["en"] },
      { id: "zh", languages: ["zh"] },
      { id: "ja", languages: ["ja"] },
    ];

    expect(sortSourcesByLanguagePriority(sources, "en").map((source) => source.id)).toEqual([
      "ja",
      "zh",
      "en",
    ]);
  });

  test("ranks the app language after multi but before alphabetical order", () => {
    const sources = [
      { id: "pt", languages: ["pt"] },
      { id: "multi", languages: ["multi"] },
      { id: "ja", languages: ["ja"] },
    ];

    expect(sortSourcesByLanguagePriority(sources, "ja").map((source) => source.id)).toEqual([
      "ja",
      "multi",
      "pt",
    ]);
  });
});
