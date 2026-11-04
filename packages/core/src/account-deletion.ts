/**
 * Client side of account deletion (App Review 5.1.1(v)). Platform-free: the
 * app passes in the Convex call and, on iOS, a function that runs Sign in with
 * Apple and returns its authorizationCode.
 */

export const APPLE_REAUTH_REQUIRED = "ACCOUNT_DELETION_APPLE_REAUTH_REQUIRED";
export const APPLE_UNAVAILABLE = "ACCOUNT_DELETION_APPLE_UNAVAILABLE";
export const APPLE_REVOKE_FAILED = "ACCOUNT_DELETION_APPLE_REVOKE_FAILED";

export type AccountDeletionErrorKind =
  | "apple-reauth-required"
  | "apple-unavailable"
  | "apple-revoke-failed"
  | "unknown";

/** Reads the code the server puts in `ConvexError({ code })`, or in the message. */
export function classifyAccountDeletionError(error: unknown): AccountDeletionErrorKind {
  const data = (error as { data?: unknown } | null)?.data;
  const code =
    typeof data === "object" && data !== null && "code" in data
      ? String((data as { code: unknown }).code)
      : error instanceof Error
        ? error.message
        : "";
  if (code.includes(APPLE_REAUTH_REQUIRED)) return "apple-reauth-required";
  if (code.includes(APPLE_UNAVAILABLE)) return "apple-unavailable";
  if (code.includes(APPLE_REVOKE_FAILED)) return "apple-revoke-failed";
  return "unknown";
}

export type DeleteAccountDeps = {
  /** Calls `api.accountDeletion.deleteMyAccount`. */
  deleteMyAccount(args: { appleAuthorizationCode?: string }): Promise<unknown>;
  /**
   * Runs Sign in with Apple and resolves with its authorizationCode, or null if
   * the user cancels. Only called when the server asks for it.
   */
  requestAppleAuthorizationCode?: () => Promise<string | null>;
};

export type DeleteAccountResult =
  | { status: "deleted" }
  /** The user cancelled the Apple prompt; nothing was deleted. */
  | { status: "cancelled" }
  | { status: "failed"; kind: AccountDeletionErrorKind };

/**
 * Deletes the account. If the server needs a fresh Apple authorizationCode it
 * prompts once (the prompt also confirms the user's identity) and retries.
 * The caller must sign out locally when the result is "deleted".
 */
export async function deleteAccount(deps: DeleteAccountDeps): Promise<DeleteAccountResult> {
  try {
    await deps.deleteMyAccount({});
    return { status: "deleted" };
  } catch (error) {
    const kind = classifyAccountDeletionError(error);
    if (kind !== "apple-reauth-required") return { status: "failed", kind };
    if (!deps.requestAppleAuthorizationCode) return { status: "failed", kind };
  }
  let code: string | null;
  try {
    code = await deps.requestAppleAuthorizationCode!();
  } catch {
    return { status: "cancelled" };
  }
  if (!code) return { status: "cancelled" };
  try {
    await deps.deleteMyAccount({ appleAuthorizationCode: code });
    return { status: "deleted" };
  } catch (error) {
    return { status: "failed", kind: classifyAccountDeletionError(error) };
  }
}
