import {
  BETTER_AUTH_USER_TABLES,
  USER_OWNED_TABLES,
  type UserOwnedTable,
} from "./accountDeletionPlan";
import type { AppleAccountTokens, AppleRevokeOutcome } from "./appleRevoke";

/** Codes surfaced to the client (as ConvexError data) so it can react. */
export const ACCOUNT_DELETION_APPLE_UNAVAILABLE =
  "ACCOUNT_DELETION_APPLE_UNAVAILABLE";
/** The client must run Sign in with Apple again and pass `appleAuthorizationCode`. */
export const ACCOUNT_DELETION_APPLE_REAUTH_REQUIRED =
  "ACCOUNT_DELETION_APPLE_REAUTH_REQUIRED";
/** Apple refused the revoke (client mismatch/expired secret/misconfiguration). */
export const ACCOUNT_DELETION_APPLE_REVOKE_FAILED =
  "ACCOUNT_DELETION_APPLE_REVOKE_FAILED";

export type R2KeySource = "r2_uploads" | "library_items";

export type AccountDeletionDeps = {
  appleTokens(userId: string): Promise<AppleAccountTokens[]>;
  revokeApple(
    tokens: AppleAccountTokens,
    authorizationCode: string | undefined,
  ): Promise<AppleRevokeOutcome>;
  /** One page of R2 keys referenced by the user's rows; cursor null = done. */
  r2KeysPage(
    userId: string,
    source: R2KeySource,
    cursor: string | null,
  ): Promise<{ keys: string[]; cursor: string | null }>;
  deleteR2Object(key: string): Promise<void>;
  /** Deletes up to one page of the user's rows in `table`. */
  purgePage(
    userId: string,
    table: UserOwnedTable,
  ): Promise<{ deleted: number; done: boolean }>;
  userEmail(userId: string): Promise<string | null>;
  /** Deletes every Better Auth row of `model` whose `field` equals `value`. */
  deleteAuthRows(
    model: string,
    field: string,
    value: string,
  ): Promise<void>;
  deleteAuthUser(userId: string): Promise<void>;
};

export type AccountDeletionResult = {
  appleRevoke: "revoked" | "already-revoked" | "none";
  r2ObjectsDeleted: number;
};

const MAX_PAGES = 100_000;

async function purgeAll(deps: AccountDeletionDeps, userId: string) {
  for (const table of USER_OWNED_TABLES) {
    for (let page = 0; page < MAX_PAGES; page++) {
      const result = await deps.purgePage(userId, table);
      if (result.done) break;
    }
  }
}

/**
 * Deletes an account and everything it owns. Idempotent and resumable: the
 * caller stays authenticated until the final Better Auth step, so a failure
 * anywhere earlier is repaired by calling it again (pages already deleted are
 * simply empty). Order matters:
 *  1. Revoke Sign in with Apple (the token lives in the account row that step
 *     4 deletes). Every Apple account must end "revoked" or "already-revoked"
 *     (invalid_grant); otherwise nothing is deleted and the error code tells
 *     the client to retry, re-authenticate (pass `appleAuthorizationCode`), or
 *     report a server misconfiguration.
 *  2. Delete R2 objects (their keys live in rows step 3 deletes).
 *  3. Purge every user-owned app table.
 *  4. Delete Better Auth sessions first, then the remaining auth rows.
 *  5. Sweep the app tables once more for writes that raced the deletion.
 */
export async function runAccountDeletion(
  deps: AccountDeletionDeps,
  userId: string,
  options: { appleAuthorizationCode?: string } = {},
): Promise<AccountDeletionResult> {
  let appleRevoke: AccountDeletionResult["appleRevoke"] = "none";
  const code = options.appleAuthorizationCode;
  for (const tokens of await deps.appleTokens(userId)) {
    const outcome = await deps.revokeApple(tokens, code);
    switch (outcome) {
      case "revoked":
        appleRevoke = "revoked";
        break;
      case "already-revoked":
        if (appleRevoke === "none") appleRevoke = "already-revoked";
        break;
      case "unavailable":
        throw new Error(ACCOUNT_DELETION_APPLE_UNAVAILABLE);
      case "no-token":
        throw new Error(ACCOUNT_DELETION_APPLE_REAUTH_REQUIRED);
      case "invalid-client":
        // A stored token issued to another client: a fresh code can fix it.
        throw new Error(
          code
            ? ACCOUNT_DELETION_APPLE_REVOKE_FAILED
            : ACCOUNT_DELETION_APPLE_REAUTH_REQUIRED,
        );
      default:
        // rejected / not-configured: never delete without revoking.
        throw new Error(ACCOUNT_DELETION_APPLE_REVOKE_FAILED);
    }
  }

  let r2ObjectsDeleted = 0;
  const seen = new Set<string>();
  for (const source of ["r2_uploads", "library_items"] as const) {
    let cursor: string | null = null;
    for (let page = 0; page < MAX_PAGES; page++) {
      const result = await deps.r2KeysPage(userId, source, cursor);
      for (const key of result.keys) {
        if (seen.has(key)) continue;
        seen.add(key);
        await deps.deleteR2Object(key);
        r2ObjectsDeleted++;
      }
      cursor = result.cursor;
      if (cursor === null) break;
    }
  }

  await purgeAll(deps, userId);

  const email = await deps.userEmail(userId);
  // Sessions first so no other device keeps a live session while the rest goes.
  await deps.deleteAuthRows("session", BETTER_AUTH_USER_TABLES.session.field, userId);
  for (const [model, { field }] of Object.entries(BETTER_AUTH_USER_TABLES)) {
    if (model === "session") continue;
    await deps.deleteAuthRows(model, field, userId);
  }
  if (email) await deps.deleteAuthRows("verification", "identifier", email);
  await deps.deleteAuthUser(userId);

  await purgeAll(deps, userId);
  return { appleRevoke, r2ObjectsDeleted };
}
