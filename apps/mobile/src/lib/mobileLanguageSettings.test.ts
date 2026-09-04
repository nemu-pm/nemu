import { describe, expect, test } from "bun:test";
import {
  compareMobileLanguageCodes,
  DEFAULT_APP_LANGUAGE,
  DEFAULT_METADATA_LANGUAGE_PREFERENCE,
  formatMobileLanguageDisplayName,
  getEffectiveMetadataLanguage,
  getLanguageCategory,
  getLanguagePriorityOrder,
  normalizeAppLanguage,
  normalizeMobileLanguageCode,
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

  test("reads each source's language category exactly once per sort", () => {
    // The comparator used to derive both categories inside every comparison,
    // which is 2 * O(n log n) reads (and normalize passes) for an n-element
    // list. Decorating up front makes it exactly n.
    let reads = 0;
    const codes = [
      "fr",
      "multi",
      "zh-Hant",
      "en",
      "ja",
      "pt-BR",
      "es",
      "de",
      "ko",
      "it",
      "ru",
      "vi",
    ];
    const sources = codes.map((code, index) => ({
      id: `${code}:${index}`,
      get languages() {
        reads += 1;
        return [code];
      },
    }));

    const sorted = sortSourcesByLanguagePriority(sources, "en");

    expect(reads).toBe(sources.length);
    expect(sorted.map((source) => source.id.split(":")[0])).toEqual([
      "ja",
      "zh-Hant",
      "en",
      "multi",
      "de",
      "es",
      "fr",
      "it",
      "ko",
      "pt-BR",
      "ru",
      "vi",
    ]);
  });

  test("an explicit priority order matches the derived one", () => {
    const pairs: [string, string][] = [
      ["zh-hant", "en"],
      ["fr", "de"],
      ["multi", "ja"],
      ["zh", "zh-hans"],
    ];
    for (const [left, right] of pairs) {
      expect(
        compareMobileLanguageCodes(
          left,
          right,
          "en",
          getLanguagePriorityOrder("en"),
        ),
      ).toBe(compareMobileLanguageCodes(left, right, "en"));
    }
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

describe("mobile language display names", () => {
  test("writes every mapped language in its own script", () => {
    expect(formatMobileLanguageDisplayName("ja", "en")).toBe("日本語");
    expect(formatMobileLanguageDisplayName("zh", "en")).toBe("中文");
    expect(formatMobileLanguageDisplayName("zh-Hant", "en")).toBe("繁體中文");
    expect(formatMobileLanguageDisplayName("zh_hans", "en")).toBe("简体中文");
    expect(formatMobileLanguageDisplayName("en", "ja")).toBe("English");
    expect(formatMobileLanguageDisplayName("es-419", "en")).toBe("Español (LatAm)");
    expect(formatMobileLanguageDisplayName("ko", "en")).toBe("한국어");
  });

  test("uses the passed multi and other labels for the shared buckets", () => {
    expect(
      formatMobileLanguageDisplayName("All", "zh", { multi: "多语言" }),
    ).toBe("多语言");
    expect(
      formatMobileLanguageDisplayName("multi", "zh", { multi: "多语言" }),
    ).toBe("多语言");
    expect(
      formatMobileLanguageDisplayName("other", "zh", { other: "其他" }),
    ).toBe("其他");
  });

  test("never renders a raw code in lowercase and falls back upper-cased", () => {
    expect(formatMobileLanguageDisplayName("zz", "en")).toBe("ZZ");
  });

  test("collapses the registry All bucket onto multi", () => {
    expect(normalizeMobileLanguageCode("All")).toBe("multi");
    expect(normalizeMobileLanguageCode("zh_Hant")).toBe("zh-hant");
    expect(getLanguageCategory(["All"])).toBe("multi");
  });

  test("orders languages ja, zh, en, multi for every app language", () => {
    expect(getLanguagePriorityOrder("en")).toEqual(["ja", "zh", "en", "multi"]);
    expect(getLanguagePriorityOrder("zh")).toEqual(["ja", "zh", "en", "multi"]);
    expect(getLanguagePriorityOrder("ja")).toEqual(["ja", "zh", "en", "multi"]);
  });

  test("keeps every script and region variant beside its base language", () => {
    const codes = [
      "vi",
      "zh-Hant",
      "es-419",
      "pt-BR",
      "en",
      "zh-hans",
      "multi",
      "pt",
      "zh-TW",
      "es",
      "zh",
      "ja",
    ];

    expect(
      [...codes].sort((left, right) =>
        compareMobileLanguageCodes(left, right, "zh"),
      ),
    ).toEqual([
      "ja",
      "zh",
      "zh-hans",
      "zh-Hant",
      "zh-TW",
      "en",
      "multi",
      "es",
      "es-419",
      "pt",
      "pt-BR",
      "vi",
    ]);
  });

  test("compares variants case-insensitively and through the All alias", () => {
    expect(compareMobileLanguageCodes("zh_Hant", "zh-hant", "en")).toBe(0);
    expect(compareMobileLanguageCodes("All", "multi", "en")).toBe(0);
    // A variant never outranks its own base language.
    expect(compareMobileLanguageCodes("zh-hans", "zh", "en")).toBeGreaterThan(0);
    // The base language keeps its priority rank for the whole family.
    expect(compareMobileLanguageCodes("zh-hant", "en", "en")).toBeLessThan(0);
  });
});
