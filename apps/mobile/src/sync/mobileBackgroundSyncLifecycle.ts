export type MobileBackgroundRegistrationAction = "register" | "none";

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
 * Unregisters OS background work only after Better Auth has explicitly
 * confirmed a successful sign-out response. A rejected request, a resolved
 * fetch error, or a malformed response leaves the persisted registration in
 * place so an offline auth probe cannot permanently disable future fetches.
 */
export async function signOutAndUnregisterMobileBackgroundSync({
  signOut,
  unregister,
}: {
  signOut: () => Promise<unknown>;
  unregister: () => Promise<void>;
}): Promise<void> {
  const result = await signOut();
  assertSuccessfulMobileAuthSignOut(result);
  await unregister();
}
