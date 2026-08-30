/**
 * Shared source-author helpers.
 *
 * `mergeAuthors` was duplicated verbatim across the web app
 * (`src/lib/sources/types.ts`) and the mobile app
 * (`apps/mobile/src/sources/mobileSourceSearch.ts` and
 * `mobileSourceDetails.ts`). This is the single source; both apps re-export it.
 */

/**
 * Merge authors + artists into a single deduplicated array.
 *
 * Returns `undefined` when the merged set is empty so callers can treat
 * "no authors" uniformly (the existing behavior on both apps).
 */
export function mergeAuthors(
  authors?: string[],
  artists?: string[],
): string[] | undefined {
  const combined = [...(authors ?? []), ...(artists ?? [])];
  const unique = [...new Set(combined)];
  return unique.length ? unique : undefined;
}