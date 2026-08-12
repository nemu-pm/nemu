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
  strings: { signInFailed: string; networkUnavailable: string },
): string {
  if (
    error?.status === 499 ||
    error?.status === 503 ||
    error?.code === "MOBILE_AUTH_NETWORK_UNAVAILABLE" ||
    error?.message === "MOBILE_AUTH_NETWORK_UNAVAILABLE"
  ) {
    return strings.networkUnavailable;
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
  signOutAndUnregister: () => Promise<void>;
  retainLocalData: () => Promise<void>;
  clearLocalData: () => Promise<void>;
}): Promise<void> {
  await signOutAndUnregister();
  if (keepData) await retainLocalData();
  else await clearLocalData();
}
