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

/**
 * The sign-out sheet's error detail. A fetch failure reaches it as the auth
 * transport's bare code (`MOBILE_AUTH_NETWORK_UNAVAILABLE`), which must not be
 * shown; the signing-out itself is retryable once back online.
 */
export function classifyMobileCloudSignOutError(error: unknown): "network" | "storage" | "other" {
  const message = error instanceof Error ? error.message : "";
  if (message === "MOBILE_AUTH_NETWORK_UNAVAILABLE") return "network";
  if (message === "MOBILE_AUTH_STORAGE_UNAVAILABLE") return "storage";
  return "other";
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

/**
 * Better Auth keeps an OAuth attempt's state for 10 minutes; past that even a
 * completed provider page ends in a state mismatch, so the session is over.
 */
export const MOBILE_OAUTH_SESSION_MAX_MS = 10 * 60 * 1000;
/**
 * How long a page gets to reach the callback after the system's Sign in with
 * Apple sheet goes away. A completed sheet posts to the callback right away.
 */
export const MOBILE_APPLE_SYSTEM_SHEET_GRACE_MS = 12 * 1000;
/** An unreachable session lookup must not keep the sign-in buttons busy. */
export const MOBILE_OAUTH_SESSION_LOOKUP_MAX_MS = 15 * 1000;

/**
 * Closes an auth session nothing will ever complete; the browser promise then
 * resolves as a dismissal and the sign-in unwinds as usual.
 *
 * ASWebAuthenticationSession reports nothing while it is open, and closing the
 * system's Sign in with Apple sheet does not end it: the session stays on
 * Apple's web form. The only outward sign is the app's active state. The
 * session's own consent alert is the first non-background inactive spell, the
 * system sheet the second; once it has gone and no redirect followed, the
 * attempt was abandoned. A spell that reached the background is the user
 * leaving the app (say, for a code), which proves nothing.
 *
 * Returns the function that stops watching.
 */
export function watchMobileOAuthSession({
  provider,
  subscribeToAppState,
  dismiss,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}: {
  provider: MobileOAuthProvider;
  subscribeToAppState: (listener: (state: string) => void) => () => void;
  dismiss: () => void;
  setTimer?: (run: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
}): () => void {
  let spells = 0;
  let spell: "none" | "inactive" | "left-app" = "none";
  let grace: ReturnType<typeof setTimeout> | null = null;

  const clearGrace = () => {
    if (grace !== null) clearTimer(grace);
    grace = null;
  };
  const hardStop = setTimer(dismiss, MOBILE_OAUTH_SESSION_MAX_MS);
  const unsubscribe =
    provider === "apple"
      ? subscribeToAppState((state) => {
          if (state === "active") {
            if (spell === "inactive") spells += 1;
            const returnedFromSheet = spell === "inactive";
            spell = "none";
            if (returnedFromSheet && spells >= 2 && grace === null) {
              grace = setTimer(() => {
                grace = null;
                dismiss();
              }, MOBILE_APPLE_SYSTEM_SHEET_GRACE_MS);
            }
            return;
          }
          clearGrace();
          if (state === "background") spell = "left-app";
          else if (spell === "none") spell = "inactive";
        })
      : () => undefined;

  return () => {
    unsubscribe();
    clearGrace();
    clearTimer(hardStop);
  };
}

/** Resolves with `fallback` if `work` has not settled in time. */
export function withMobileAuthDeadline<T>(
  work: Promise<T>,
  ms: number,
  fallback: T,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export type MobileAppleCredential = {
  identityToken: string | null;
  authorizationCode: string | null;
  email: string | null;
  fullName: { givenName: string | null; familyName: string | null } | null;
};

export type MobileAppleIdTokenPayload = {
  token: string;
  nonce: string;
  user?: {
    email?: string;
    name?: { firstName?: string; lastName?: string };
  };
};

type MobileAuthResult = {
  error?: { code?: string; message?: string; status?: number } | null;
};

export type MobileNativeAppleSignInOutcome<R extends MobileAuthResult> =
  /** The user closed the system sheet: back in the app, nothing to report. */
  | { kind: "cancelled" }
  /** Native sign-in cannot finish this attempt; the web flow still can. */
  | { kind: "use-web" }
  | { kind: "completed"; result: R };

/** The system sheet reports a user's cancel with this code. */
export function isMobileAppleSignInCancel(error: unknown): boolean {
  return (error as { code?: unknown } | null | undefined)?.code === "ERR_REQUEST_CANCELED";
}

/**
 * The backend answers with the bundle id it verifies identity tokens against
 * once native sign-in and its account-deletion revoke are both configured.
 * Anything else, including a backend without the query, keeps the web flow.
 */
export function isMobileNativeAppleReady(
  backendBundleId: string | null | undefined,
  appBundleId: string | null | undefined,
): boolean {
  return Boolean(backendBundleId && backendBundleId === appBundleId);
}

/**
 * Only a transport or storage failure stays an error: the web flow would fail
 * the same way. A rejected token (no email claim, a misconfigured audience) is
 * a reason to use the flow every account already works with, not a dead end.
 */
function shouldFallBackToWebAfterRejection(
  error: MobileAuthResult["error"],
): boolean {
  if (!error) return false;
  if (error.status === 499 || error.status === 503) return false;
  return ![error.code, error.message].some(
    (value) =>
      value === "MOBILE_AUTH_NETWORK_UNAVAILABLE" ||
      value === "MOBILE_AUTH_STORAGE_UNAVAILABLE",
  );
}

/**
 * Sign in with Apple through the system sheet. Better Auth accepts the raw
 * nonce when the token carries its SHA-256 hex digest. Apple sends the name
 * and email only at the first authorization, so they are passed when present.
 */
export async function runMobileNativeAppleSignIn<R extends MobileAuthResult>({
  isAvailable,
  isBackendReady,
  createNonce,
  hashNonce,
  requestCredential,
  signInWithIdToken,
}: {
  isAvailable: () => Promise<boolean>;
  isBackendReady: () => Promise<boolean>;
  createNonce: () => string;
  hashNonce: (nonce: string) => Promise<string>;
  requestCredential: (hashedNonce: string) => Promise<MobileAppleCredential>;
  signInWithIdToken: (idToken: MobileAppleIdTokenPayload) => Promise<R>;
}): Promise<MobileNativeAppleSignInOutcome<R>> {
  let nonce: string;
  let credential: MobileAppleCredential;
  try {
    if (!(await isBackendReady()) || !(await isAvailable())) return { kind: "use-web" };
    nonce = createNonce();
    credential = await requestCredential(await hashNonce(nonce));
  } catch (error) {
    return isMobileAppleSignInCancel(error) ? { kind: "cancelled" } : { kind: "use-web" };
  }
  if (!credential.identityToken) return { kind: "use-web" };

  const firstName = credential.fullName?.givenName ?? undefined;
  const lastName = credential.fullName?.familyName ?? undefined;
  const email = credential.email ?? undefined;
  const result = await signInWithIdToken({
    token: credential.identityToken,
    nonce,
    ...(firstName || lastName || email
      ? {
          user: {
            ...(email ? { email } : {}),
            ...(firstName || lastName ? { name: { firstName, lastName } } : {}),
          },
        }
      : {}),
  });
  return shouldFallBackToWebAfterRejection(result.error)
    ? { kind: "use-web" }
    : { kind: "completed", result };
}
