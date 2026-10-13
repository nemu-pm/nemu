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
}: {
  deleteMyAccount: (args: { appleAuthorizationCode?: string }) => Promise<unknown>;
  /** Signs out and handles device data; resolves false if it could not finish. */
  signOutLocally: () => Promise<boolean>;
}): Promise<MobileAccountDeletionOutcome> {
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

export function mobileAccountDeletionFailureMessage(
  kind: AccountDeletionErrorKind,
  strings: MobileStrings,
): string {
  switch (kind) {
    case "apple-reauth-required":
      return strings.account.deleteReauth;
    case "apple-unavailable":
      return strings.account.deleteUnavailable;
    default:
      return strings.account.deleteFailed;
  }
}
