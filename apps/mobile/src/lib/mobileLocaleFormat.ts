import type { AppLanguage } from "@/data/schema";

/**
 * Locale-aware text helpers that behave the same on both mobile engines.
 *
 * iOS's system JavaScriptCore ships ICU and `Intl`. The Android build runs the
 * community JSC without ICU: there is no `Intl` global, `toLocaleTimeString`
 * ignores its locale and options ("13:05:09" for an en-US "1:05 PM"),
 * `Number#toLocaleString` does not group digits ("1234567"), and
 * `localeCompare` is a raw UTF-16 code-unit comparison (so "Zebra" sorts
 * before "apple", and accented letters after "z"). Where `Intl` exists these
 * helpers defer to the engine unchanged; elsewhere they reproduce what the
 * ICU formatting prints for the app's three languages.
 *
 * Pure: no `react-native` imports, so everything here is unit-testable.
 */

export function mobileEngineHasIntl(): boolean {
  try {
    return typeof (globalThis as { Intl?: unknown }).Intl === "object";
  } catch {
    return false;
  }
}

const COMBINING_MARKS = /[̀-ͯ]/g;
/** Anything outside printable ASCII takes the normalizing path. */
const NON_PRINTABLE_ASCII = /[^\x20-\x7e]/;
const FALLBACK_KEY_CACHE_LIMIT = 4096;

type FallbackKeys = {
  /** Case- and accent-insensitive (ICU primary strength, roughly). */
  base: string;
  /** Accent-sensitive, case-insensitive (secondary strength). */
  accents: string;
};

function createFallbackTextComparator(): (left: string, right: string) => number {
  // A sort calls the comparator O(n log n) times on the same strings, and the
  // non-ASCII path goes through the JS `normalize` polyfill; key each string once.
  const cache = new Map<string, FallbackKeys>();
  const keysFor = (value: string): FallbackKeys => {
    const cached = cache.get(value);
    if (cached) return cached;
    let keys: FallbackKeys;
    if (!NON_PRINTABLE_ASCII.test(value)) {
      const lower = value.toLowerCase();
      keys = { base: lower, accents: lower };
    } else {
      let decomposed = value;
      try {
        decomposed = value.normalize("NFD");
      } catch {
        // Keep the raw string; ordering stays deterministic either way.
      }
      const accents = decomposed.toLowerCase();
      keys = { base: accents.replace(COMBINING_MARKS, ""), accents };
    }
    if (cache.size >= FALLBACK_KEY_CACHE_LIMIT) cache.clear();
    cache.set(value, keys);
    return keys;
  };

  return (left, right) => {
    if (left === right) return 0;
    const a = keysFor(left);
    const b = keysFor(right);
    if (a.base !== b.base) return a.base < b.base ? -1 : 1;
    if (a.accents !== b.accents) return a.accents < b.accents ? -1 : 1;
    // ICU puts lowercase before uppercase at the tertiary level; in UTF-16
    // uppercase comes first, so the tie-break is the reverse code-unit order.
    return left < right ? 1 : -1;
  };
}

/**
 * `left.localeCompare(right)` where the engine has a real collator, and an
 * ICU-like case/accent-insensitive ordering where it does not.
 */
export function createMobileTextComparator(
  hasIntl: boolean = mobileEngineHasIntl(),
): (left: string, right: string) => number {
  return hasIntl
    ? (left, right) => left.localeCompare(right)
    : createFallbackTextComparator();
}

/** Shared comparator for user-visible text (titles, source names). */
export const compareMobileText = createMobileTextComparator();

/**
 * A whole count with digit grouping ("1,234,567"). en, zh and ja all group by
 * thousands with a comma, which is what the ICU engine prints.
 */
export function formatMobileInteger(
  value: number,
  hasIntl: boolean = mobileEngineHasIntl(),
): string {
  if (hasIntl) return value.toLocaleString();
  if (!Number.isFinite(value)) return String(value);
  const rounded = Math.round(value);
  const sign = rounded < 0 ? "-" : "";
  return sign + String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

const TIME_LOCALE_BY_LANGUAGE: Record<AppLanguage, string> = {
  en: "en-US",
  zh: "zh-CN",
  ja: "ja-JP",
};

/**
 * A wall-clock time the way `toLocaleTimeString(locale, { hour: "numeric",
 * minute: "2-digit" })` prints it: "1:05 PM" (en), "13:05" (zh / ja).
 */
export function formatMobileClockTime(
  timestamp: number,
  appLanguage: AppLanguage,
  hasIntl: boolean = mobileEngineHasIntl(),
): string {
  const date = new Date(timestamp);
  if (hasIntl) {
    try {
      return date.toLocaleTimeString(TIME_LOCALE_BY_LANGUAGE[appLanguage], {
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      // Fall through to the table below.
    }
  }
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  if (appLanguage === "en") {
    const hour12 = hours % 12 === 0 ? 12 : hours % 12;
    return `${hour12}:${minutes} ${hours < 12 ? "AM" : "PM"}`;
  }
  return `${hours}:${minutes}`;
}
