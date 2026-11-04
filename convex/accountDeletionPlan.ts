/**
 * Pure description of what "delete my account" must remove. Keeping it free of
 * Convex runtime imports lets tests assert that it covers every table.
 */

/**
 * Every table in convex/schema.ts holds rows owned by a user (`userId`, with a
 * `by_user` index) and is purged by account deletion. A table added to the
 * schema must be added here (or to NON_USER_OWNED_TABLES with a reason); the
 * account-deletion test fails otherwise.
 */
export const USER_OWNED_TABLES = [
  "collection_items",
  "collections",
  "chapter_progress",
  "library_source_links",
  "library_items",
  "manga_progress",
  "r2_uploads",
  "settings",
  "sync_generations",
] as const;

export type UserOwnedTable = (typeof USER_OWNED_TABLES)[number];

/** Schema tables that deliberately hold no per-user data. Empty today. */
export const NON_USER_OWNED_TABLES: Record<string, string> = {};

/**
 * Better Auth component tables (components.betterAuth) and how a user's rows
 * are found. Every table the installed component declares must appear here or
 * in NON_USER_BETTER_AUTH_TABLES; the test fails when a component upgrade
 * adds one.
 */
export const BETTER_AUTH_USER_TABLES = {
  session: { field: "userId" },
  account: { field: "userId" },
  twoFactor: { field: "userId" },
  oauthApplication: { field: "userId" },
  oauthAccessToken: { field: "userId" },
  oauthConsent: { field: "userId" },
} as const;

/** `verification` rows are keyed by the user's email, `user` by its id. */
export const BETTER_AUTH_SPECIAL_TABLES = ["user", "verification"] as const;

export const NON_USER_BETTER_AUTH_TABLES: Record<string, string> = {
  jwks: "Server signing keys, shared by all users.",
  rateLimit: "Counters keyed by request key, not by user.",
};

/** Public base URL that R2 cover objects are served from. */
export const R2_PUBLIC_BASE = "https://r2.nemu.pm/";

/** Extracts the R2 object key from a nemu cover URL, or null for other URLs. */
export function r2KeyFromUrl(url: unknown): string | null {
  if (typeof url !== "string" || !url.startsWith(R2_PUBLIC_BASE)) return null;
  const rest = url.slice(R2_PUBLIC_BASE.length).split(/[?#]/, 1)[0];
  if (!rest || rest.includes("/") || rest.includes("..")) return null;
  return decodeURIComponent(rest);
}

type CoverBearingItem = {
  metadata?: { cover?: string };
  overrides?: { coverUrl?: string | null } | null;
};

/** R2 keys referenced by a library item's covers. */
export function r2KeysOfLibraryItem(item: CoverBearingItem): string[] {
  const keys = [
    r2KeyFromUrl(item.metadata?.cover),
    r2KeyFromUrl(item.overrides?.coverUrl),
  ].filter((key): key is string => key !== null);
  return [...new Set(keys)];
}

export const PURGE_PAGE_SIZE = 100;
