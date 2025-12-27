/**
 * Localized metadata display logic
 *
 * Handles extracting and displaying metadata in the user's preferred language.
 * Provider tabs show localized values directly when available.
 * AI tab (Gemini) only used for descriptions and Chinese title fallback.
 */

import type { ExactMatch } from "./store";
import { getJapaneseTitle, type ProviderTitleData } from "./matching";

// =============================================================================
// Types
// =============================================================================

export type EffectiveLanguage = "en" | "ja" | "zh";

export interface GeminiFunctions {
  findChineseTitle: (args: { japaneseTitle: string; englishTitle?: string }) => Promise<{
    simplified: string | null;
    traditional: string | null;
  }>;
  findJapaneseDescription: (args: { japaneseTitle: string; romajiTitle?: string }) => Promise<string | null>;
  findChineseDescription: (args: { japaneseTitle: string; englishTitle?: string }) => Promise<string | null>;
}

// =============================================================================
// Language detection helpers
// =============================================================================

/** Check if text contains Japanese-specific characters (hiragana/katakana) */
function hasJapaneseChars(text: string): boolean {
  return /[\u3040-\u309F\u30A0-\u30FF]/.test(text);
}

/** Check if text contains CJK characters */
function hasCJKChars(text: string): boolean {
  return /[\u4E00-\u9FFF]/.test(text);
}

/** Check if text appears to be in the target language */
export function isTextInLanguage(text: string | undefined, lang: EffectiveLanguage): boolean {
  if (!text || lang === "en") return false;
  if (lang === "ja") return hasJapaneseChars(text);
  if (lang === "zh") return hasCJKChars(text) && !hasJapaneseChars(text);
  return false;
}

/** Check if any author is in target language */
export function areAuthorsInLanguage(authors: string[] | undefined, lang: EffectiveLanguage): boolean {
  if (!authors?.length || lang === "en") return false;
  return authors.some(a => isTextInLanguage(a, lang));
}

// =============================================================================
// Localized value extraction from provider data
// =============================================================================

/**
 * Get localized title from a single provider match.
 * Returns null if no localized title available for this provider.
 *
 * For zh: only returns actual Chinese titles, NOT Japanese fallback
 * For ja: returns Japanese titles
 */
export function getLocalizedTitle(match: ExactMatch, lang: EffectiveLanguage): string | null {
  if (lang === "en") return match.metadata.title;

  const loc = match.result.localizationData;

  // For Japanese language
  if (lang === "ja") {
    if (match.provider === "anilist" && loc?.alTitle?.native) {
      return loc.alTitle.native;
    }
    if (match.provider === "mal" && loc?.malTitleJapanese) {
      return loc.malTitleJapanese;
    }
    if (match.provider === "mangaupdates" && loc?.muAssociated) {
      const titles = loc.muAssociated.map(a => a.title);
      const jaTitle = titles.find(t => hasJapaneseChars(t));
      if (jaTitle) return jaTitle;
    }
  }

  // For Chinese language - only return actual Chinese titles
  if (lang === "zh") {
    // MangaUpdates associated titles may have Chinese
    if (match.provider === "mangaupdates" && loc?.muAssociated) {
      const titles = loc.muAssociated.map(a => a.title);
      const zhTitle = titles.find(t => hasCJKChars(t) && !hasJapaneseChars(t));
      if (zhTitle) return zhTitle;
    }
    // AniList synonyms may have Chinese
    if (match.provider === "anilist" && loc?.alSynonyms) {
      const zhTitle = loc.alSynonyms.find(t => hasCJKChars(t) && !hasJapaneseChars(t));
      if (zhTitle) return zhTitle;
    }
    // Note: We don't return Japanese as fallback for Chinese here
    // If no Chinese found, return null so AI tab can be used
  }

  return null;
}

/**
 * Get localized authors from a single provider match.
 * For ja/zh, returns Japanese author names from AniList staff.
 */
export function getLocalizedAuthors(match: ExactMatch, lang: EffectiveLanguage): string[] | null {
  if (lang === "en") return match.metadata.authors || null;

  // For ja/zh, get Japanese names from AniList staff
  if (match.provider === "anilist") {
    const loc = match.result.localizationData;
    if (loc?.alStaff?.length) {
      const storyArtRoles = ["Story & Art", "Story", "Art", "Original Creator"];
      const nativeNames: string[] = [];

      for (const staff of loc.alStaff) {
        if (storyArtRoles.some(r => staff.role?.includes(r))) {
          if (staff.native && !nativeNames.includes(staff.native)) {
            nativeNames.push(staff.native);
          }
        }
      }

      if (nativeNames.length > 0) return nativeNames;
    }
  }

  return null;
}

/**
 * Check if any provider has localized title for the given language.
 */
export function hasLocalizedTitle(matches: ExactMatch[], lang: EffectiveLanguage): boolean {
  if (lang === "en") return true;
  return matches.some(m => getLocalizedTitle(m, lang) !== null);
}

/**
 * Check if any provider has localized authors for the given language.
 */
export function hasLocalizedAuthors(matches: ExactMatch[], lang: EffectiveLanguage): boolean {
  if (lang === "en") return true;
  return matches.some(m => getLocalizedAuthors(m, lang) !== null);
}

// =============================================================================
// AI (Gemini) fallback for descriptions and Chinese title
// =============================================================================

/**
 * Build provider title data for Gemini lookups
 */
function buildProviderTitleData(matches: ExactMatch[]): ProviderTitleData {
  const data: ProviderTitleData = {};

  for (const match of matches) {
    const loc = match.result.localizationData;

    switch (match.provider) {
      case "mangaupdates":
        data.mu = {
          title: match.metadata.title,
          associated: loc?.muAssociated,
        };
        break;
      case "anilist":
        if (loc?.alTitle) {
          data.al = {
            title: loc.alTitle,
            synonyms: loc.alSynonyms,
          };
        }
        break;
      case "mal":
        data.mal = {
          title: match.metadata.title,
          title_english: loc?.malTitleEnglish,
          title_japanese: loc?.malTitleJapanese,
        };
        break;
    }
  }

  return data;
}

/**
 * Fetch Chinese title via Gemini (fallback when providers don't have it).
 * Only called when no provider has Chinese title in synonyms/associated.
 */
export async function fetchChineseTitleFromGemini(
  matches: ExactMatch[],
  gemini: GeminiFunctions
): Promise<string | null> {
  const providerData = buildProviderTitleData(matches);
  const jpTitle = getJapaneseTitle(providerData);
  const enTitle = providerData.al?.title.english || providerData.mal?.title_english || matches[0]?.metadata.title;

  if (!jpTitle && !enTitle) return null;

  try {
    const result = await gemini.findChineseTitle({
      japaneseTitle: jpTitle || enTitle!,
      englishTitle: enTitle,
    });
    return result.simplified || result.traditional || null;
  } catch (e) {
    console.error("[localize] findChineseTitle error:", e);
    return null;
  }
}

/**
 * Fetch localized description via Gemini.
 * Descriptions always come from Gemini (providers only have English).
 */
export async function fetchLocalizedDescription(
  matches: ExactMatch[],
  lang: EffectiveLanguage,
  gemini: GeminiFunctions
): Promise<string | null> {
  if (lang === "en") return matches[0]?.metadata.description || null;

  const providerData = buildProviderTitleData(matches);
  const jpTitle = getJapaneseTitle(providerData);
  const enTitle = providerData.al?.title.english || providerData.mal?.title_english || matches[0]?.metadata.title;

  if (!jpTitle && !enTitle) return null;

  try {
    if (lang === "ja") {
      return await gemini.findJapaneseDescription({
        japaneseTitle: jpTitle || enTitle!,
        romajiTitle: providerData.al?.title.romaji,
      });
    }

    if (lang === "zh") {
      return await gemini.findChineseDescription({
        japaneseTitle: jpTitle || enTitle!,
        englishTitle: enTitle,
      });
    }
  } catch (e) {
    console.error("[localize] fetchLocalizedDescription error:", e);
  }

  return null;
}

// =============================================================================
// Check what AI tabs are needed
// =============================================================================

export interface AITabsNeeded {
  /** Chinese title fallback (when no provider has it) */
  chineseTitle: boolean;
  /** Description (always for non-English) */
  description: boolean;
}

/**
 * Determine which AI tabs are needed based on language and provider data.
 */
export function getAITabsNeeded(
  matches: ExactMatch[],
  lang: EffectiveLanguage
): AITabsNeeded {
  if (lang === "en") {
    return { chineseTitle: false, description: false };
  }

  // Chinese title: need AI if no provider has Chinese title
  const chineseTitle = lang === "zh" && !hasLocalizedTitle(matches, "zh");

  // Description: always need AI for non-English
  const description = true;

  return { chineseTitle, description };
}
