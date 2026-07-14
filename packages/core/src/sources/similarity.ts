/**
 * Shared title-similarity primitives.
 *
 * `lcsLength` (longest-common-subsequence length) was duplicated identically
 * across three sites — web `src/lib/sources/title-pool.ts` and
 * `src/lib/metadata/matching.ts`, and mobile
 * `apps/mobile/src/sources/mobileSourceSearch.ts`. All three implementations
 * produce byte-identical results; this is the single source.
 *
 * NOTE (behavior-preservation contract): the higher-level
 * `calculateTitleSimilarity` / `calculateMobileTitleSimilarity` functions are
 * intentionally NOT hoisted here. Although their scoring math is the same
 * (LCS / max-length), they diverge on edge-case control flow — web returns 1
 * for two empty normalized titles (equality check first), mobile returns 0
 * (empty check first). A single shared function could not produce
 * byte-identical output for both without an option for that ordering, so each
 * app keeps its own `calculate*TitleSimilarity` and simply calls this shared
 * `lcsLength`. The genuine normalization drift (web opencc-js t2s vs mobile
 * NFKC + separator collapse) also stays per-app — resolving it is a flagged,
 * separately-decided product change, not part of this refactor.
 */

/**
 * Longest common subsequence length between two strings.
 *
 * Pure DP; identical output to every prior per-app copy.
 */
export function lcsLength(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0),
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