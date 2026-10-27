/**
 * `translateTags` from the web app's src/lib/metadata/translations, reading
 * only the ja / zh maps. The web module's index also imports the English
 * AniList tag table (anilist-tags-en.json, ~64 KB of descriptions) and the
 * English genre list, which translation never reads (English returns the tag
 * unchanged); importing it put that table in the mobile JS bundle that JSC
 * parses on every launch. Same lookup order: genre first, then AniList tag,
 * else the tag itself.
 */
import genresJa from "../../../../src/lib/metadata/translations/genres-ja.json";
import genresZh from "../../../../src/lib/metadata/translations/genres-zh.json";
import anilistTagsJa from "../../../../src/lib/metadata/translations/anilist-tags-ja.json";
import anilistTagsZh from "../../../../src/lib/metadata/translations/anilist-tags-zh.json";

export type MobileTagLanguage = "en" | "ja" | "zh";
type TranslationMap = Record<string, string>;

const genreTranslations: Record<"ja" | "zh", TranslationMap> = {
  ja: genresJa as TranslationMap,
  zh: genresZh as TranslationMap,
};
const anilistTagTranslations: Record<"ja" | "zh", TranslationMap> = {
  ja: anilistTagsJa as TranslationMap,
  zh: anilistTagsZh as TranslationMap,
};

export function translateMobileTag(tag: string, lang: MobileTagLanguage): string {
  if (lang === "en") return tag;
  const genre = genreTranslations[lang][tag];
  if (genre) return genre;
  const anilist = anilistTagTranslations[lang][tag];
  if (anilist) return anilist;
  return tag;
}

export function translateMobileTags(tags: string[], lang: MobileTagLanguage): string[] {
  return tags.map((tag) => translateMobileTag(tag, lang));
}
