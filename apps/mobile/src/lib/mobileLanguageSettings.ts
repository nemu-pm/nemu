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

export function getLanguageCategory(languages: string[] | undefined): string {
  if (!languages?.length) return "other";
  if (languages.length > 1 || languages[0] === "multi") return "multi";
  return languages[0];
}

export function getLanguagePriorityOrder(appLanguage: AppLanguage): string[] {
  return [...new Set(["ja", "en", appLanguage, "multi"])];
}

export function sortSourcesByLanguagePriority<T extends MobileLanguageSource>(
  sources: T[],
  appLanguage: AppLanguage
): T[] {
  const priorityOrder = getLanguagePriorityOrder(appLanguage);

  return [...sources].sort((a, b) => {
    const categoryA = getLanguageCategory(a.languages);
    const categoryB = getLanguageCategory(b.languages);

    if (categoryA === categoryB) return 0;

    const priorityA = priorityOrder.indexOf(categoryA);
    const priorityB = priorityOrder.indexOf(categoryB);

    if (priorityA !== -1 && priorityB !== -1) return priorityA - priorityB;
    if (priorityA !== -1) return -1;
    if (priorityB !== -1) return 1;

    return categoryA.localeCompare(categoryB);
  });
}
