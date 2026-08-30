/**
 * Shared auth helpers used by both the web and mobile apps.
 *
 * Behavior-preserving: this is the single source for the OAuth provider type
 * and its normalization, which were previously duplicated verbatim across
 * `src/sync/oauth-provider.ts` (web) and `apps/mobile/src/sync/mobileOAuthProvider.ts`
 * (mobile). Each app re-exports these under its own naming convention.
 */

export type OAuthProvider = "google" | "apple";

/**
 * Normalize an arbitrary provider value into a known {@link OAuthProvider},
 * or `null` if it is not one of the supported providers.
 */
export function normalizeOAuthProvider(
  provider: string | null | undefined,
): OAuthProvider | null {
  return provider === "google" || provider === "apple" ? provider : null;
}