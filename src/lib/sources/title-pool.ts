/**
 * Title Pool - Build a pool of titles from Smart Match results for source searching
 *
 * Used to search manga sources with the best query per source language.
 */

import { type ExactMatch } from "@/lib/metadata/store";
import { hasJapaneseChars, hasCJKChars } from "@/lib/metadata/matching";
import * as OpenCC from "opencc-js";

// Create Traditional -> Simplified Chinese converter
const t2sConverter = OpenCC.Converter({ from: "tw", to: "cn" });

export interface TitlePool {
  /** English/romaji titles */
  en: string[];
  /** Japanese titles (has hiragana/katakana) */
  ja: string[];
  /** Chinese titles (has CJK, no kana) */
  zh: string[];
  /** All titles for fuzzy matching */
  all: string[];
}

/**
 * Detect language of a title based on character content
 */
function detectTitleLanguage(title: string): "ja" | "zh" | "en" {
  if (hasJapaneseChars(title)) return "ja";
  if (hasCJKChars(title)) return "zh";
  return "en";
}

/**
 * Add a title to the pool, classified by language
 */
function addToPool(title: string | undefined, pool: TitlePool): void {
  if (!title?.trim()) return;
  const lang = detectTitleLanguage(title);
  if (!pool[lang].includes(title)) {
    pool[lang].push(title);
  }
  if (!pool.all.includes(title)) {
    pool.all.push(title);
  }
}

/**
 * Build a title pool from Smart Match exact matches
 *
 * Extracts all titles from provider data (MU, AL, MAL) and classifies by language.
 */
export function buildTitlePool(matches: ExactMatch[]): TitlePool {
  const pool: TitlePool = { en: [], ja: [], zh: [], all: [] };

  for (const match of matches) {
    const loc = match.result.localizationData;

    // Add main title
    addToPool(match.metadata.title, pool);

    // Add alternative titles from search result
    for (const alt of match.result.alternativeTitles || []) {
      addToPool(alt, pool);
    }

    // AniList data
    if (loc?.alTitle) {
      if (loc.alTitle.english) addToPool(loc.alTitle.english, pool);
      if (loc.alTitle.romaji) addToPool(loc.alTitle.romaji, pool);
      if (loc.alTitle.native) addToPool(loc.alTitle.native, pool);
    }
    if (loc?.alSynonyms) {
      for (const syn of loc.alSynonyms) {
        addToPool(syn, pool);
      }
    }

    // MAL data
    if (loc?.malTitleEnglish) addToPool(loc.malTitleEnglish, pool);
    if (loc?.malTitleJapanese) addToPool(loc.malTitleJapanese, pool);
    if (loc?.malTitleSynonyms) {
      for (const syn of loc.malTitleSynonyms) {
        addToPool(syn, pool);
      }
    }

    // MangaUpdates associated titles
    if (loc?.muAssociated) {
      for (const assoc of loc.muAssociated) {
        addToPool(assoc.title, pool);
      }
    }
  }

  return pool;
}

/**
 * Get the best search query for a source based on its language
 *
 * @param pool - Title pool from buildTitlePool()
 * @param sourceLang - Source language code (en, ja, zh, ko, multi, etc.)
 * @returns Best search query string, or null if no titles available
 */
export function getSearchQueryForSource(
  pool: TitlePool,
  sourceLang: string
): string | null {
  // Normalize language code (e.g., "zh-Hans" -> "zh")
  const lang = sourceLang.split("-")[0].toLowerCase();

  switch (lang) {
    case "ja":
      return pool.ja[0] ?? pool.en[0] ?? pool.all[0] ?? null;

    case "zh":
      return pool.zh[0] ?? pool.ja[0] ?? pool.en[0] ?? pool.all[0] ?? null;

    case "ko":
      // Korean sources often have Japanese titles
      return pool.ja[0] ?? pool.en[0] ?? pool.all[0] ?? null;

    case "en":
    default:
      // English or multi-language sources
      return pool.en[0] ?? pool.all[0] ?? null;
  }
}

/**
 * Check if title pool is empty (no matches found)
 */
export function isTitlePoolEmpty(pool: TitlePool): boolean {
  return pool.all.length === 0;
}

// =============================================================================
// Title Matching & Similarity Utilities
// =============================================================================

/**
 * Normalize a title for similarity comparison:
 * - Convert Traditional Chinese to Simplified Chinese
 * - Lowercase
 * - Remove extra whitespace
 */
export function normalizeTitleForMatching(title: string): string {
  // Convert Traditional Chinese to Simplified
  const simplified = t2sConverter(title);
  // Lowercase and trim
  return simplified.toLowerCase().trim().replace(/\s+/g, " ");
}

/**
 * Longest Common Subsequence length - for similarity scoring
 */
function lcsLength(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0)
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}

/**
 * Calculate similarity score between two titles (0.0 to 1.0)
 * Uses LCS ratio after normalizing both strings (including Chinese simplification)
 */
export function calculateTitleSimilarity(a: string, b: string): number {
  const normA = normalizeTitleForMatching(a);
  const normB = normalizeTitleForMatching(b);

  // Exact match
  if (normA === normB) return 1.0;

  const maxLen = Math.max(normA.length, normB.length);
  if (maxLen === 0) return 0;

  const lcs = lcsLength(normA, normB);
  return lcs / maxLen;
}

/**
 * Calculate best similarity score between a candidate title and all titles in pool
 */
export function getBestSimilarityScore(
  candidateTitle: string,
  poolTitles: string[]
): number {
  if (poolTitles.length === 0) return 0;

  let bestScore = 0;
  for (const poolTitle of poolTitles) {
    const score = calculateTitleSimilarity(candidateTitle, poolTitle);
    if (score > bestScore) {
      bestScore = score;
    }
    // Early exit on perfect match
    if (score === 1.0) return 1.0;
  }
  return bestScore;
}

