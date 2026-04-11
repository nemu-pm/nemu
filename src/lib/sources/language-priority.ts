/**
 * Language priority utilities for source sorting and search query selection
 *
 * Shared between browse page (grouping) and source search (query selection).
 */

// =============================================================================
// Language Category
// =============================================================================

/**
 * Get the language category for a source based on its languages array
 */
export function getLanguageCategory(languages: string[] | undefined): string {
  if (!languages || languages.length === 0) return "other";
  if (languages.length > 1 || languages[0] === "multi") return "multi";
  return languages[0];
}

/**
 * Get the primary language code from a languages array
 * Returns the first language, or "en" if none specified
 */
export function getPrimaryLanguage(languages: string[] | undefined): string {
  if (!languages || languages.length === 0) return "en";
  if (languages[0] === "multi") return "en"; // Multi-language sources default to English search
  return languages[0];
}

// =============================================================================
// Language Priority Order
// =============================================================================

/**
 * Get the priority order for language categories based on user's app language
 *
 * ja, en, user's language, multi, then others alphabetically
 */
export function getLanguagePriorityOrder(appLanguage: string | undefined): string[] {
  const userLang = appLanguage || "en";
  return [...new Set(["ja", "en", userLang, "multi"])];
}

// =============================================================================
// Source Sorting
// =============================================================================

export interface SourceWithLanguage {
  languages?: string[];
}

/**
 * Sort sources by language priority
 *
 * Returns a new array sorted by:
 * 1. Priority languages (based on app language)
 * 2. Remaining languages alphabetically
 */
export function sortSourcesByLanguagePriority<T extends SourceWithLanguage>(
  sources: T[],
  appLanguage: string | undefined
): T[] {
  const priorityOrder = getLanguagePriorityOrder(appLanguage);

  return [...sources].sort((a, b) => {
    const catA = getLanguageCategory(a.languages);
    const catB = getLanguageCategory(b.languages);

    const indexA = priorityOrder.indexOf(catA);
    const indexB = priorityOrder.indexOf(catB);

    // Both in priority list - sort by priority
    if (indexA !== -1 && indexB !== -1) {
      return indexA - indexB;
    }

    // Only A in priority list - A comes first
    if (indexA !== -1) return -1;

    // Only B in priority list - B comes first
    if (indexB !== -1) return 1;

    // Neither in priority list - sort alphabetically
    return catA.localeCompare(catB);
  });
}

// =============================================================================
// Grouping (for Browse page)
// =============================================================================

export interface LanguageGroup<T> {
  label: string;
  sources: T[];
}

/**
 * Group sources by language category and sort groups by priority
 */
export function groupSourcesByLanguage<T extends SourceWithLanguage>(
  sources: T[],
  appLanguage: string | undefined
): LanguageGroup<T>[] {
  const priorityOrder = getLanguagePriorityOrder(appLanguage);

  // Group sources by language category
  const groups: Record<string, T[]> = {};
  for (const source of sources) {
    const category = getLanguageCategory(source.languages);
    if (!groups[category]) groups[category] = [];
    groups[category].push(source);
  }

  // Build ordered sections
  const sections: LanguageGroup<T>[] = [];
  const usedCategories = new Set<string>();

  // Add priority categories first
  for (const category of priorityOrder) {
    if (groups[category] && groups[category].length > 0) {
      sections.push({
        label: category,
        sources: groups[category],
      });
      usedCategories.add(category);
    }
  }

  // Add remaining categories alphabetically
  const remainingCategories = Object.keys(groups)
    .filter((cat) => !usedCategories.has(cat))
    .sort();

  for (const category of remainingCategories) {
    if (groups[category].length > 0) {
      sections.push({
        label: category,
        sources: groups[category],
      });
    }
  }

  return sections;
}

