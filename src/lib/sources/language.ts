/**
 * Standardized language handling for manga sources.
 * 
 * All sources should normalize language codes at boundaries:
 * - Valid BCP-47 language code (e.g., "en", "ja", "zh")
 * - "multi" for multi-language sources
 * - undefined for unknown/invalid
 */

/**
 * Normalize a raw language code from source metadata.
 * 
 * @param raw - Raw language string from source (may be non-standard)
 * @returns Normalized BCP-47 language code, "multi", or undefined
 */
export function normalizeSourceLang(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  
  const lower = raw.toLowerCase().trim();
  
  // Empty string
  if (lower === "") return undefined;
  
  // Special cases from various sources
  if (lower === "multi" || lower === "all") return "multi";
  if (lower === "unknown") return undefined;
  
  // Validate as BCP-47 using native Intl.Locale
  try {
    const locale = new Intl.Locale(lower);
    // Return the base language tag (e.g., "en" from "en-US", "zh" from "zh-Hans")
    return locale.language;
  } catch {
    // Invalid locale code
    return undefined;
  }
}

/**
 * Normalize an array of language codes.
 * Filters out invalid codes and deduplicates.
 * 
 * @param langs - Array of raw language strings
 * @returns Array of normalized language codes (may be empty)
 */
export function normalizeSourceLangs(langs: string[] | undefined | null): string[] {
  if (!langs || langs.length === 0) return [];
  
  const normalized = new Set<string>();
  for (const lang of langs) {
    const norm = normalizeSourceLang(lang);
    if (norm) normalized.add(norm);
  }
  
  return Array.from(normalized);
}

/**
 * Check if a language code indicates multi-language content.
 */
export function isMultiLang(lang: string | undefined | null): boolean {
  return lang === "multi";
}

/**
 * Check if a language code is a specific language (not multi/unknown).
 */
export function isSpecificLang(lang: string | undefined | null): boolean {
  return !!lang && lang !== "multi";
}

/**
 * Check if a language matches a target (handles "multi" as wildcard).
 * 
 * @param lang - Language to check
 * @param target - Target language to match against
 * @returns true if lang matches target or either is "multi"
 */
export function langMatches(lang: string | undefined, target: string): boolean {
  if (!lang) return false;
  if (lang === "multi" || target === "multi") return true;
  return lang === target;
}

