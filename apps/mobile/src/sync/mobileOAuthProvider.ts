import { normalizeOAuthProvider, type OAuthProvider } from "@nemu/core";

// OAuth provider type + normalization are shared via @nemu/core. Mobile keeps
// its `Mobile*` naming so existing importers are unaffected.
export type MobileOAuthProvider = OAuthProvider;

export type MobileCloudSignOutResultAction =
  | "close-confirmation"
  | "keep-confirmation-open";

export const normalizeMobileOAuthProvider = normalizeOAuthProvider;

export function resolveMobileCloudSignInErrorDetail(
  error: { code?: string; message?: string; status?: number } | null | undefined,
  strings: {
    signInFailed: string;
    networkUnavailable: string;
    storageUnavailable: string;
  },
): string {
  if (
    error?.status === 499 ||
    error?.status === 503 ||
    error?.code === "MOBILE_AUTH_NETWORK_UNAVAILABLE" ||
    error?.message === "MOBILE_AUTH_NETWORK_UNAVAILABLE"
  ) {
    return strings.networkUnavailable;
  }
  if (
    error?.code === "MOBILE_AUTH_STORAGE_UNAVAILABLE" ||
    error?.message === "MOBILE_AUTH_STORAGE_UNAVAILABLE"
  ) {
    return strings.storageUnavailable;
  }
  return strings.signInFailed;
}

export function canStartMobileOAuthSignIn(
  busyProvider: MobileOAuthProvider | null,
  signingOut: boolean,
): boolean {
  return !signingOut && busyProvider === null;
}

export function canStartMobileCloudSignOut(
  busyProvider: MobileOAuthProvider | null,
  signingOut: boolean,
): boolean {
  return busyProvider === null && !signingOut;
}

export function canSelectMobileCloudSignOutChoice({
  active,
  loading,
}: {
  active: boolean;
  loading: boolean;
}): boolean {
  return !loading && !active;
}

export function getMobileCloudSignOutResultAction({
  succeeded,
}: {
  succeeded: boolean;
}): MobileCloudSignOutResultAction {
  return succeeded ? "close-confirmation" : "keep-confirmation-open";
}

/**
 * Never mutate local account data until the remote sign-out is positively
 * confirmed. An offline or rejected sign-out must leave the user's only local
 * copy intact and retryable.
 */
export async function completeMobileCloudSignOut({
  keepData,
  signOutAndUnregister,
  retainLocalData,
  clearLocalData,
}: {
  keepData: boolean;
  signOutAndUnregister: (
    onSignOutConfirmed: () => Promise<void>,
  ) => Promise<unknown>;
  retainLocalData: () => Promise<void>;
  clearLocalData: () => Promise<void>;
}): Promise<void> {
  await signOutAndUnregister(
    keepData ? retainLocalData : clearLocalData,
  );
}

export type MobileOAuthSignInOutcome = "signed-in" | "dismissed" | "failed";

/**
 * `signIn.social` resolves with the original redirect response even when the
 * user closes the OAuth browser, so it cannot distinguish a completed sign-in
 * from a dismissed one. A persisted session is the only proof of success:
 * treat a readable session as signed in, a session lookup error as a failure
 * worth surfacing, and an empty session as a user-dismissed attempt that needs
 * no error UI.
 */
export function resolveMobileOAuthSignInOutcome(
  session:
    | {
        data?: { user?: unknown } | null;
        error?: unknown;
      }
    | null
    | undefined,
): MobileOAuthSignInOutcome {
  if (session?.data?.user) return "signed-in";
  if (session?.error) return "failed";
  return "dismissed";
}
