/**
 * Title matching utilities for metadata validation
 */

// =============================================================================
// Language Detection
// =============================================================================

export type TitleLanguage = "ja" | "zh" | "en" | "unknown";

/**
 * Detect the likely language of a title based on character analysis.
 * - Japanese: has hiragana OR katakana (unique to Japanese)
 * - Chinese: has kanji but NO hiragana/katakana
 * - English: Latin characters only
 */
export function detectTitleLanguage(title: string): TitleLanguage {
  const hasHiragana = /[\u3040-\u309F]/.test(title);
  const hasKatakana = /[\u30A0-\u30FF]/.test(title);
  const hasKanji = /[\u4E00-\u9FAF]/.test(title);
  const hasLatin = /[a-zA-Z]/.test(title);

  // Japanese: has hiragana OR katakana (unique to Japanese writing)
  if (hasHiragana || hasKatakana) return "ja";

  // Chinese: has kanji but NO hiragana/katakana
  // Note: Kanji-only Japanese titles will be detected as Chinese, but that's
  // acceptable because AniList/MAL provide dedicated Japanese title fields
  if (hasKanji) return "zh";

  // Latin only
  if (hasLatin) return "en";

  return "unknown";
}

/**
 * Find first item in array matching the target language
 */
function findByLanguage(items: string[], lang: TitleLanguage): string | null {
  for (const item of items) {
    if (detectTitleLanguage(item) === lang) return item;
  }
  return null;
}

// =============================================================================
// Title Extraction Types
// =============================================================================

export interface MUTitleData {
  title: string;
  associated?: Array<{ title: string }>;
}

export interface ALTitleData {
  title: { romaji?: string; english?: string; native?: string };
  synonyms?: string[];
}

export interface MALTitleData {
  title: string;
  title_english?: string;
  title_japanese?: string;
  title_synonyms?: string[];
}

export interface ProviderTitleData {
  mu?: MUTitleData;
  al?: ALTitleData;
  mal?: MALTitleData;
}

// =============================================================================
// Title Extraction
// =============================================================================

/**
 * Get Japanese title from provider data.
 * Priority: AniList native > MAL title_japanese > MU associated (detected)
 *
 * Note: AniList `native` and MAL `title_japanese` are ALWAYS Japanese by definition,
 * so no language detection needed for those fields.
 */
export function getJapaneseTitle(providers: ProviderTitleData): string | null {
  // AniList native is always Japanese
  if (providers.al?.title.native) return providers.al.title.native;

  // MAL title_japanese is always Japanese
  if (providers.mal?.title_japanese) return providers.mal.title_japanese;

  // MU associated needs detection
  if (providers.mu?.associated) {
    const titles = providers.mu.associated.map((a) => a.title);
    return findByLanguage(titles, "ja");
  }

  return null;
}

/**
 * Get Chinese title from provider data.
 * Priority: MU associated (detected) > AniList synonyms (detected) > null
 *
 * Returns null if no Chinese title found (triggers Gemini fallback).
 */
export function getChineseTitle(providers: ProviderTitleData): string | null {
  // MU associated
  if (providers.mu?.associated) {
    const titles = providers.mu.associated.map((a) => a.title);
    const found = findByLanguage(titles, "zh");
    if (found) return found;
  }

  // AniList synonyms
  if (providers.al?.synonyms) {
    const found = findByLanguage(providers.al.synonyms, "zh");
    if (found) return found;
  }

  return null;
}

/**
 * Get English title from provider data.
 * Priority: AniList english > AniList romaji > MAL title_english > MU title
 */
export function getEnglishTitle(providers: ProviderTitleData): string | null {
  return (
    providers.al?.title.english ||
    providers.al?.title.romaji ||
    providers.mal?.title_english ||
    providers.mu?.title ||
    null
  );
}

/**
 * Get title in the preferred language.
 */
export function getTitleByLanguage(
  providers: ProviderTitleData,
  lang: "en" | "ja" | "zh"
): string | null {
  switch (lang) {
    case "ja":
      return getJapaneseTitle(providers);
    case "zh":
      return getChineseTitle(providers);
    case "en":
    default:
      return getEnglishTitle(providers);
  }
}

// =============================================================================
// Author Name Extraction Types
// =============================================================================

export interface ALStaffData {
  staff?: {
    edges: Array<{
      role: string;
      node: { name: { full?: string; native?: string } };
    }>;
  };
}

/**
 * Extract Japanese author/artist names from AniList staff data.
 * Returns map of role -> Japanese names array
 */
export function getALJapaneseStaffNames(media: ALStaffData): {
  authors: string[];
  artists: string[];
} {
  const authors: string[] = [];
  const artists: string[] = [];

  for (const edge of media.staff?.edges || []) {
    const native = edge.node.name.native;
    if (!native) continue;

    if (edge.role.includes("Story") || edge.role.includes("Original")) {
      if (!authors.includes(native)) authors.push(native);
    }
    if (edge.role.includes("Art")) {
      if (!artists.includes(native)) artists.push(native);
    }
  }

  return { authors, artists };
}

/**
 * Map of romanized name -> Japanese name
 */
export type AuthorNameMap = Map<string, string>;

/**
 * Convert author names to Japanese using a name mapping.
 * Returns original names if no Japanese equivalent found.
 */
export function convertAuthorsToJapanese(
  authors: string[] | undefined,
  nameMap: AuthorNameMap
): string[] | undefined {
  if (!authors?.length) return undefined;
  return authors.map((name) => nameMap.get(name) ?? name);
}

// =============================================================================
// Fuzzy Matching
// =============================================================================

/**
 * Normalize string for fuzzy comparison: NFKC, lowercase, remove punctuation
 */
export function normalize(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, ""); // Keep only letters and numbers
}

/**
 * Check if query matches any candidate using fuzzy matching.
 */
export function hasExactMatch(query: string, candidates: string[]): boolean {
  return findMatchingTitle(query, candidates) !== null;
}

/**
 * Longest common subsequence length
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
 * LCS ratio - how much of the shorter string is preserved in the longer
 */
function lcsRatio(a: string, b: string): number {
  const minLen = Math.min(a.length, b.length);
  if (minLen === 0) return 0;
  return lcsLength(a, b) / minLen;
}

/**
 * Check if query matches any of the candidate titles (fuzzy).
 * Uses exact match, contains match, and LCS ratio.
 *
 * @param query - The search query
 * @param candidates - List of candidate titles to match against
 * @param lcsThreshold - Minimum LCS ratio for fuzzy match (default 0.85)
 * @returns The matched candidate title, or null if no match
 */
export function findMatchingTitle(
  query: string,
  candidates: string[],
  lcsThreshold = 0.85
): string | null {
  const nQuery = normalize(query);

  for (const c of candidates) {
    const nCand = normalize(c);

    // Exact match (normalized)
    if (nQuery === nCand) return c;

    const minLen = Math.min(nQuery.length, nCand.length);
    const maxLen = Math.max(nQuery.length, nCand.length);
    const lenRatio = minLen / maxLen;

    // Skip if lengths are too different
    if (lenRatio < 0.4) continue;

    // Contains match
    if (minLen >= 3 && (nCand.includes(nQuery) || nQuery.includes(nCand))) {
      return c;
    }

    // LCS ratio match
    const ratio = lcsRatio(nQuery, nCand);
    if (ratio >= lcsThreshold) return c;
  }

  return null;
}

/**
 * Get all candidate titles from a MangaUpdates result
 */
export function getMUCandidates(detail: {
  title: string;
  associated?: Array<{ title: string }>;
}): string[] {
  return [detail.title, ...(detail.associated?.map((a) => a.title) || [])];
}

/**
 * Get all candidate titles from an AniList result
 */
export function getALCandidates(media: {
  title: { romaji?: string; english?: string; native?: string };
  synonyms?: string[];
}): string[] {
  return [
    media.title.romaji,
    media.title.english,
    media.title.native,
    ...(media.synonyms || []),
  ].filter((n): n is string => Boolean(n));
}

/**
 * Get all candidate titles from a MAL/Jikan result
 */
export function getMALCandidates(manga: {
  title: string;
  title_english?: string;
  title_japanese?: string;
  title_synonyms?: string[];
}): string[] {
  return [
    manga.title,
    manga.title_english,
    manga.title_japanese,
    ...(manga.title_synonyms || []),
  ].filter((n): n is string => Boolean(n));
}
