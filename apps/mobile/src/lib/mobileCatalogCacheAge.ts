/**
 * "Updated 5 minutes ago" copy for the Add Sources catalog cache.
 *
 * The Android build runs the community `jsc-android` flavour without ICU, so
 * there is no `Intl` global at all there: calling `new Intl.RelativeTimeFormat`
 * directly threw `ReferenceError: Can't find variable: Intl` and took down the
 * Browse screen as soon as a cached catalog existed (every cold start after the
 * first install). iOS's system JavaScriptCore ships `Intl`, so it keeps the
 * platform formatter; everything else uses the small table below, which
 * reproduces `Intl.RelativeTimeFormat(locale, { numeric: "auto" })` for the
 * three app languages and the three units this copy needs.
 */

type CatalogCacheAgeUnit = "minute" | "hour" | "day";

export type MobileRelativeTimeFormatter = (value: number, unit: CatalogCacheAgeUnit) => string;

const LOCALE_BY_LANGUAGE: Record<string, string> = { zh: "zh-CN", ja: "ja-JP" };

function catalogCacheAgeLocale(appLanguage: string): string {
  return LOCALE_BY_LANGUAGE[appLanguage] ?? "en-US";
}

/** `Intl.RelativeTimeFormat` when this engine has one, otherwise `null`. */
function intlRelativeTimeFormatter(locale: string): MobileRelativeTimeFormatter | null {
  try {
    const intl = (globalThis as { Intl?: typeof Intl }).Intl;
    if (typeof intl?.RelativeTimeFormat !== "function") return null;
    const formatter = new intl.RelativeTimeFormat(locale, { numeric: "auto" });
    return (value, unit) => formatter.format(value, unit);
  } catch {
    return null;
  }
}

/**
 * Past-tense only (`value` <= -1), matching what `numeric: "auto"` prints for
 * the values [formatMobileCatalogCacheAge] produces.
 */
export function fallbackRelativeTimeFormatter(locale: string): MobileRelativeTimeFormatter {
  if (locale.startsWith("zh")) {
    return (value, unit) => {
      const n = Math.abs(value);
      if (unit === "day" && n === 1) return "昨天";
      if (unit === "day" && n === 2) return "前天";
      if (unit === "day") return `${n}天前`;
      if (unit === "hour") return `${n}小时前`;
      return `${n}分钟前`;
    };
  }
  if (locale.startsWith("ja")) {
    return (value, unit) => {
      const n = Math.abs(value);
      if (unit === "day" && n === 1) return "昨日";
      if (unit === "day" && n === 2) return "一昨日";
      if (unit === "day") return `${n} 日前`;
      if (unit === "hour") return `${n} 時間前`;
      return `${n} 分前`;
    };
  }
  return (value, unit) => {
    const n = Math.abs(value);
    if (unit === "day" && n === 1) return "yesterday";
    return `${n} ${unit}${n === 1 ? "" : "s"} ago`;
  };
}

export function formatMobileCatalogCacheAge(
  savedAt: number | null,
  appLanguage: string,
  now: number = Date.now(),
  resolveFormatter: (locale: string) => MobileRelativeTimeFormatter | null = intlRelativeTimeFormatter,
): string | null {
  if (!savedAt || savedAt > now) return null;
  const elapsedMinutes = Math.max(1, Math.round((now - savedAt) / 60_000));
  const locale = catalogCacheAgeLocale(appLanguage);
  const format = resolveFormatter(locale) ?? fallbackRelativeTimeFormatter(locale);
  if (elapsedMinutes < 60) return format(-elapsedMinutes, "minute");
  const hours = Math.round(elapsedMinutes / 60);
  if (hours < 24) return format(-hours, "hour");
  return format(-Math.round(hours / 24), "day");
}
