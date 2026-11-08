import { deleteAccount, type AccountDeletionErrorKind } from "@nemu/core";
import type { MobileStrings } from "@/lib/mobileI18n";

export type MobileAccountDeletionOutcome =
  | { status: "deleted"; localCleanup: "ok" | "failed" }
  | { status: "cancelled" }
  | { status: "failed"; kind: AccountDeletionErrorKind };

/**
 * Deletes the signed-in account on the server, then signs out locally at once
 * (the Convex JWT outlives the deletion by up to its expiry). Native Sign in
 * with Apple is not shipped, so no authorizationCode prompt is offered: if the
 * server asks for re-authentication it is reported as a failure.
 */
export async function runMobileAccountDeletion({
  deleteMyAccount,
  signOutLocally,
  backendOutdated = () => false,
}: {
  deleteMyAccount: (args: { appleAuthorizationCode?: string }) => Promise<unknown>;
  /** Signs out and handles device data; resolves false if it could not finish. */
  signOutLocally: () => Promise<boolean>;
  /**
   * The backend is known to predate account deletion (PR #34 not deployed):
   * nothing is sent and nothing is deleted. A missing function at call time
   * reads the same way (`server-unavailable`).
   */
  backendOutdated?: () => boolean;
}): Promise<MobileAccountDeletionOutcome> {
  if (backendOutdated()) return { status: "failed", kind: "server-unavailable" };
  const result = await deleteAccount({ deleteMyAccount });
  if (result.status !== "deleted") return result;
  let cleaned = false;
  try {
    cleaned = await signOutLocally();
  } catch {
    cleaned = false;
  }
  return { status: "deleted", localCleanup: cleaned ? "ok" : "failed" };
}

/** Only over a live connection: Convex holds an action sent offline and sends it on reconnect. */
export function canSendMobileAccountDeletion(connection: { isWebSocketConnected: boolean }): boolean {
  return connection.isWebSocketConnected;
}

export function mobileAccountDeletionFailureMessage(
  kind: AccountDeletionErrorKind,
  strings: MobileStrings,
): string {
  switch (kind) {
    case "apple-reauth-required":
      return strings.account.deleteReauth;
    case "apple-unavailable":
      return strings.account.deleteUnavailable;
    case "server-unavailable":
      return strings.account.deleteNotAvailableYet;
    default:
      return strings.account.deleteFailed;
  }
}
