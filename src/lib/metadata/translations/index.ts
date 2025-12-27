/**
 * Tag/Genre translation mappings for metadata localization
 */

// English base data
import genresEn from "./genres-en.json";
import anilistTagsEn from "./anilist-tags-en.json";

// Japanese translations
import genresJa from "./genres-ja.json";
import anilistTagsJa from "./anilist-tags-ja.json";

// Chinese translations
import genresZh from "./genres-zh.json";
import anilistTagsZh from "./anilist-tags-zh.json";

// Types
export interface AniListTagInfo {
  category: string;
  description: string;
}

export type AniListTagsMap = Record<string, AniListTagInfo>;
export type TranslationMap = Record<string, string>;
export type SupportedLanguage = "en" | "ja" | "zh";

// Export raw data
export {
  genresEn,
  anilistTagsEn,
  genresJa,
  anilistTagsJa,
  genresZh,
  anilistTagsZh,
};

// Type assertions
export const anilistTags = anilistTagsEn as AniListTagsMap;
export const genreTranslations = {
  en: genresEn as string[],
  ja: genresJa as TranslationMap,
  zh: genresZh as TranslationMap,
};
export const anilistTagTranslations = {
  en: anilistTagsEn as AniListTagsMap,
  ja: anilistTagsJa as TranslationMap,
  zh: anilistTagsZh as TranslationMap,
};

/**
 * Translate a genre to the target language
 */
export function translateGenre(genre: string, lang: SupportedLanguage): string {
  if (lang === "en") return genre;
  const map = genreTranslations[lang];
  return map[genre] ?? genre;
}

/**
 * Translate an AniList tag to the target language
 */
export function translateAniListTag(tag: string, lang: SupportedLanguage): string {
  if (lang === "en") return tag;
  const map = anilistTagTranslations[lang];
  return map[tag] ?? tag;
}

/**
 * Translate multiple genres
 */
export function translateGenres(genres: string[], lang: SupportedLanguage): string[] {
  return genres.map((g) => translateGenre(g, lang));
}

/**
 * Translate multiple AniList tags
 */
export function translateAniListTags(tags: string[], lang: SupportedLanguage): string[] {
  return tags.map((t) => translateAniListTag(t, lang));
}

/**
 * Translate a tag that could be either a genre or an AniList tag.
 * Tries genre first, then AniList tag.
 */
export function translateTag(tag: string, lang: SupportedLanguage): string {
  if (lang === "en") return tag;
  
  // Try genre translation first
  const genreMap = genreTranslations[lang];
  if (genreMap[tag]) return genreMap[tag];
  
  // Try AniList tag translation
  const anilistMap = anilistTagTranslations[lang];
  if (anilistMap[tag]) return anilistMap[tag];
  
  // Return original if no translation found
  return tag;
}

/**
 * Translate multiple tags (genres or AniList tags)
 */
export function translateTags(tags: string[], lang: SupportedLanguage): string[] {
  return tags.map((t) => translateTag(t, lang));
}

/**
 * Get all unique genre/tag names from AniList tags
 */
export function getAniListTagNames(): string[] {
  return Object.keys(anilistTags);
}

/**
 * Get AniList tags by category
 */
export function getAniListTagsByCategory(category: string): string[] {
  return Object.entries(anilistTags)
    .filter(([_, info]) => info.category === category)
    .map(([name]) => name);
}

/**
 * Get all AniList tag categories
 */
export function getAniListTagCategories(): string[] {
  const categories = new Set<string>();
  for (const info of Object.values(anilistTags)) {
    categories.add(info.category);
  }
  return Array.from(categories).sort();
}
