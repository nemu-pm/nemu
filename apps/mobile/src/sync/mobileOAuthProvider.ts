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
 * How long a session may stay open after the system's Sign in with Apple sheet
 * goes away. A completed sheet posts to the callback right away; the rest is
 * room for someone who moved on to Apple's own form, whose typing the app can't
 * see, to finish or at least to read it before it closes.
 */
export const MOBILE_APPLE_SYSTEM_SHEET_GRACE_MS = 20 * 1000;
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
 * leaving the app (say, for a code), which proves nothing. The session exposes
 * no URL, navigation or input, so time is all there is to go on.
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
