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
