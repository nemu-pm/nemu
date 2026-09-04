import type { AppLanguage, MetadataLanguagePreference } from "@/data/schema";

export const DEFAULT_APP_LANGUAGE: AppLanguage = "en";
export const DEFAULT_METADATA_LANGUAGE_PREFERENCE: MetadataLanguagePreference = "auto";

export type MobileLanguageSource = {
  languages?: string[];
};

export function normalizeAppLanguage(value: unknown): AppLanguage {
  if (value === "en" || value === "zh" || value === "ja") return value;
  return DEFAULT_APP_LANGUAGE;
}

/** Shape of a single `expo-localization` locale entry that we care about. */
export type MobileDeviceLocale = {
  languageCode?: string | null;
  languageTag?: string | null;
  languageScriptCode?: string | null;
  regionCode?: string | null;
};

function matchDeviceLocale(locale: MobileDeviceLocale): AppLanguage | null {
  const tag = (locale.languageTag ?? "").toLowerCase();
  const code = (locale.languageCode ?? tag.split("-")[0] ?? "").toLowerCase();

  if (code === "ja") return "ja";
  if (code === "en") return "en";
  if (code !== "zh") return null;

  const script = (locale.languageScriptCode ?? "").toLowerCase();
  const region = (locale.regionCode ?? "").toLowerCase();
  // Traditional Chinese is not modelled yet, so zh-Hant devices (TW/HK/MO)
  // fall back to English rather than being served Simplified copy.
  // TODO: add a `zh-Hant` app language and route these here.
  if (script === "hant" || ["tw", "hk", "mo"].includes(region)) return null;
  if (script === "hans" || script === "") return "zh";
  return null;
}

/**
 * Best app language for a fresh install, derived from the device's ordered
 * preferred-locale list. Returns `null` when nothing in the list maps to a
 * language this app ships, so callers can keep the built-in default.
 */
export function resolveDeviceAppLanguage(
  locales: ReadonlyArray<MobileDeviceLocale> | null | undefined,
): AppLanguage | null {
  for (const locale of locales ?? []) {
    const match = matchDeviceLocale(locale);
    if (match) return match;
  }
  return null;
}

/**
 * A persisted choice always wins; the device locale is only a default for
 * installs that have never stored one.
 */
export function resolveInitialAppLanguage(
  persisted: unknown,
  deviceLanguage: AppLanguage | null,
): AppLanguage {
  if (persisted === "en" || persisted === "zh" || persisted === "ja") {
    return persisted;
  }
  return deviceLanguage ?? DEFAULT_APP_LANGUAGE;
}

export function normalizeMetadataLanguagePreference(
  value: unknown
): MetadataLanguagePreference {
  if (value === "auto" || value === "en" || value === "zh" || value === "ja") {
    return value;
  }
  return DEFAULT_METADATA_LANGUAGE_PREFERENCE;
}

export function getEffectiveMetadataLanguage(
  preference: MetadataLanguagePreference,
  appLanguage: AppLanguage
): AppLanguage {
  return preference === "auto" ? appLanguage : preference;
}

/**
 * Registry packages spell the "every language" bucket either as `multi` or as
 * Aidoku's `All`. Both mean the same thing to the user, so they collapse onto a
 * single `multi` code before anything sorts, groups, or labels them.
 */
export function normalizeMobileLanguageCode(code: string): string {
  const normalized = code.trim().toLowerCase().replace(/_/g, "-");
  return normalized === "all" ? "multi" : normalized;
}

export function getLanguageCategory(languages: string[] | undefined): string {
  if (!languages?.length) return "other";
  if (languages.length > 1) return "multi";
  return normalizeMobileLanguageCode(languages[0] ?? "");
}

/**
 * Display names are always written in their own language (日本語 / 中文 /
 * English …) rather than as raw ISO codes, so the chip rows read the same way
 * on every device and never surface `JA` to a reader.
 */
const MOBILE_LANGUAGE_DISPLAY_NAMES: Record<string, string> = {
  ja: "日本語",
  zh: "中文",
  "zh-hans": "简体中文",
  "zh-cn": "简体中文",
  "zh-hant": "繁體中文",
  "zh-tw": "繁體中文",
  "zh-hk": "繁體中文",
  en: "English",
  es: "Español",
  "es-419": "Español (LatAm)",
  pt: "Português",
  "pt-br": "Português",
  fr: "Français",
  de: "Deutsch",
  it: "Italiano",
  ru: "Русский",
  ko: "한국어",
  vi: "Tiếng Việt",
  id: "Bahasa Indonesia",
  th: "ไทย",
  ar: "العربية",
  tr: "Türkçe",
  pl: "Polski",
  uk: "Українська",
};

export type MobileLanguageDisplayLabels = {
  /** Localized "Multi-Language" copy for the `multi` / `All` bucket. */
  multi?: string;
  /** Localized "Other" copy for sources that declare no language. */
  other?: string;
};

export function formatMobileLanguageDisplayName(
  code: string,
  appLanguage: AppLanguage,
  labels: MobileLanguageDisplayLabels = {},
): string {
  const normalized = normalizeMobileLanguageCode(code);
  if (normalized === "multi" && labels.multi) return labels.multi;
  if (normalized === "other" && labels.other) return labels.other;

  const mapped = MOBILE_LANGUAGE_DISPLAY_NAMES[normalized];
  if (mapped) return mapped;

  try {
    const displayNamesCtor = (
      Intl as unknown as {
        DisplayNames?: new (
          locales: string[],
          options: { type: "language" },
        ) => { of: (value: string) => string | undefined };
      }
    ).DisplayNames;
    const label = displayNamesCtor
      ? new displayNamesCtor([appLanguage], { type: "language" }).of(normalized)
      : undefined;
    if (label && label !== normalized) {
      return label.charAt(0).toUpperCase() + label.slice(1);
    }
  } catch {
    // Some native runtimes ship a smaller Intl surface.
  }

  return code.toUpperCase();
}

export function getLanguagePriorityOrder(appLanguage: AppLanguage): string[] {
  return [...new Set(["ja", "zh", "en", "multi", appLanguage])];
}

/** The subtag a code is a variant of: `zh-Hant` → `zh`, `pt-BR` → `pt`. */
function getMobileLanguageBaseCode(normalizedCode: string): string {
  const [base] = normalizedCode.split("-");
  return base || normalizedCode;
}

/**
 * The single ordering rule for every language list in the app.
 *
 * A region or script variant is a flavour of its base language, not a separate
 * entry filed under its own letter, so ranking happens on the base subtag:
 * `zh-Hans` and `zh-Hant` sit directly under 中文 wherever 中文 lands in the
 * priority order, instead of being stranded at the end of the alphabetical
 * tail. Within one language the bare code leads and its variants follow
 * alphabetically, which also keeps `zh-hans`/`zh-cn` ahead of
 * `zh-hant`/`zh-hk`/`zh-tw`.
 */
export function compareMobileLanguageCodes(
  left: string,
  right: string,
  appLanguage: AppLanguage,
  // A sort calls this O(n log n) times, and the priority order is the same for
  // every one of those calls. Callers that sort pass it in once; the default
  // keeps the three-argument call sites honest.
  priorityOrder: readonly string[] = getLanguagePriorityOrder(appLanguage),
): number {
  return compareNormalizedMobileLanguageCodes(
    normalizeMobileLanguageCode(left),
    normalizeMobileLanguageCode(right),
    priorityOrder,
  );
}

/** The ordering itself, on codes a caller has already normalized. */
function compareNormalizedMobileLanguageCodes(
  a: string,
  b: string,
  priorityOrder: readonly string[],
): number {
  if (a === b) return 0;

  const baseA = getMobileLanguageBaseCode(a);
  const baseB = getMobileLanguageBaseCode(b);

  if (baseA !== baseB) {
    const priorityA = priorityOrder.indexOf(baseA);
    const priorityB = priorityOrder.indexOf(baseB);

    if (priorityA !== -1 && priorityB !== -1) return priorityA - priorityB;
    if (priorityA !== -1) return -1;
    if (priorityB !== -1) return 1;

    return baseA.localeCompare(baseB);
  }

  if (a === baseA) return -1;
  if (b === baseB) return 1;
  return a.localeCompare(b);
}

export function sortSourcesByLanguagePriority<T extends MobileLanguageSource>(
  sources: T[],
  appLanguage: AppLanguage
): T[] {
  const priorityOrder = getLanguagePriorityOrder(appLanguage);
  // `getLanguageCategory` already returns a normalized code, so decorating the
  // list up front pays it once per source instead of twice per comparison.
  // `Array.prototype.sort` is stable, so equal categories keep input order.
  const decorated = sources.map((source) => ({
    source,
    category: getLanguageCategory(source.languages),
  }));
  decorated.sort((a, b) =>
    compareNormalizedMobileLanguageCodes(a.category, b.category, priorityOrder),
  );
  return decorated.map((entry) => entry.source);
}
