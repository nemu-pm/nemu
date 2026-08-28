export type MobileBackgroundRegistrationAction = "register" | "none";

export type MobileBackgroundSignOutResult = {
  backgroundSyncUnregisterScheduled: boolean;
};

type MobileAuthSignOutResponse = {
  data?: {
    success?: unknown;
  } | null;
  error?: unknown;
};

export function getMobileBackgroundRegistrationAction({
  isAuthenticated,
  isLoading,
}: {
  isAuthenticated: boolean;
  isLoading: boolean;
}): MobileBackgroundRegistrationAction {
  return !isLoading && isAuthenticated ? "register" : "none";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getSignOutFailureMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (isRecord(error) && typeof error.message === "string" && error.message) {
    return error.message;
  }
  return "Failed to sign out";
}

function assertSuccessfulMobileAuthSignOut(result: unknown): void {
  if (!isRecord(result)) {
    throw new Error("Failed to confirm sign out");
  }

  const response = result as MobileAuthSignOutResponse;
  if (response.error != null) {
    throw new Error(getSignOutFailureMessage(response.error));
  }

  if (!isRecord(response.data) || response.data.success !== true) {
    throw new Error("Failed to confirm sign out");
  }
}

/**
 * Attempts to unregister OS background work only after Better Auth has
 * explicitly confirmed a successful sign-out response. A rejected request, a
 * resolved fetch error, or a malformed response leaves the persisted
 * registration in place. Once sign-out is confirmed, unregister is best
 * effort and detached: the user's selected local-data disposition runs first,
 * and neither an OS scheduler failure nor a stalled OS promise can block it.
 */
export async function signOutAndUnregisterMobileBackgroundSync({
  onSignOutConfirmed,
  signOut,
  unregister,
}: {
  onSignOutConfirmed: () => Promise<void>;
  signOut: () => Promise<unknown>;
  unregister: () => Promise<void>;
}): Promise<MobileBackgroundSignOutResult> {
  const result = await signOut();
  assertSuccessfulMobileAuthSignOut(result);

  let dispositionError: unknown = null;
  try {
    await onSignOutConfirmed();
  } catch (error) {
    dispositionError = error;
  }

  // Invoke after the disposition so "Remove Data" can durably fence the old
  // profile before any scheduler API wait. Swallow synchronous and asynchronous
  // scheduler failures; a revoked auth session makes a retained task a no-op.
  try {
    void unregister().catch(() => undefined);
  } catch {
    // Best effort by contract.
  }
  if (dispositionError) throw dispositionError;
  return { backgroundSyncUnregisterScheduled: true };
}
