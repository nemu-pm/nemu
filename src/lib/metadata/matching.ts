/**
 * Title matching utilities for metadata validation
 */

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
