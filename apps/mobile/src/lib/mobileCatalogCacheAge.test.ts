import { describe, expect, test } from "bun:test";
import {
  fallbackRelativeTimeFormatter,
  formatMobileCatalogCacheAge,
} from "./mobileCatalogCacheAge";

const NOW = 1_800_000_000_000;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const noIntl = () => null;

describe("formatMobileCatalogCacheAge", () => {
  test("returns null without a timestamp or for a future one", () => {
    expect(formatMobileCatalogCacheAge(null, "en", NOW)).toBeNull();
    expect(formatMobileCatalogCacheAge(NOW + 1, "en", NOW)).toBeNull();
  });

  test("does not need an Intl global (Android jsc-android has none)", () => {
    const saved = (globalThis as { Intl?: unknown }).Intl;
    try {
      (globalThis as { Intl?: unknown }).Intl = undefined;
      expect(formatMobileCatalogCacheAge(NOW - 5 * MINUTE, "zh", NOW)).toBe("5分钟前");
      expect(formatMobileCatalogCacheAge(NOW - 3 * HOUR, "en", NOW)).toBe("3 hours ago");
    } finally {
      (globalThis as { Intl?: unknown }).Intl = saved;
    }
  });

  test("fallback matches Intl.RelativeTimeFormat numeric:auto for every app language", () => {
    const cases = [
      NOW - 10_000,
      NOW - 1 * MINUTE,
      NOW - 42 * MINUTE,
      NOW - 1 * HOUR,
      NOW - 5 * HOUR,
      NOW - 1 * DAY,
      NOW - 2 * DAY,
      NOW - 9 * DAY,
    ];
    for (const language of ["zh", "ja", "en"]) {
      for (const savedAt of cases) {
        expect(formatMobileCatalogCacheAge(savedAt, language, NOW, noIntl)).toBe(
          formatMobileCatalogCacheAge(savedAt, language, NOW) as string,
        );
      }
    }
  });

  test("fallback formatter spells the short-range phrases", () => {
    expect(fallbackRelativeTimeFormatter("zh-CN")(-1, "day")).toBe("昨天");
    expect(fallbackRelativeTimeFormatter("ja-JP")(-2, "day")).toBe("一昨日");
    expect(fallbackRelativeTimeFormatter("en-US")(-1, "minute")).toBe("1 minute ago");
  });
});
