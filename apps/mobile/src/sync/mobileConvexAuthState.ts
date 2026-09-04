// Pure re-arm decision logic for the mobile Convex auth integration.
//
// convex@1.31's AuthenticationManager gives a token fetch exactly two chances
// (`setConfig` plus one forced refetch). Two transient failures — e.g. a flaky
// native HTTP window right after the OAuth browser redirects back into the
// app — permanently clear auth, and nothing in @convex-dev/better-auth re-arms
// it because its `fetchAccessToken` identity is stable for the session. The
// app then looks signed-in while every sync subscription stays skipped, with
// no user-visible error.
//
// This module holds the platform-free decision helpers the React provider in
// mobileConvexAuth.tsx consults; keeping it free of react-native imports lets
// bun's test runner cover the recovery contract directly.

export const MOBILE_CONVEX_AUTH_REARM_MIN_INTERVAL_MS = 10_000;
export const MOBILE_CONVEX_AUTH_REARM_POLL_INTERVAL_MS = 15_000;
/**
 * Ceiling for the re-arm backoff. Not every stall is transient: a revoked
 * signing key or a misconfigured deployment makes the server reject every
 * token the client can produce, and each re-arm stops and restarts the
 * websocket. Backing off to a few minutes keeps a genuine outage recoverable
 * without hammering a deployment that will never accept us.
 */
export const MOBILE_CONVEX_AUTH_REARM_MAX_INTERVAL_MS = 5 * 60_000;

/**
 * Delay owed before the next re-arm.
 *
 * @param consecutiveAttempts re-arms already made for the current stall; 0
 * means the stall was just observed and the first retry is due immediately
 * after the minimum interval.
 */
export function mobileConvexAuthRearmDelayMs(
  consecutiveAttempts: number,
): number {
  const exponent = Math.min(Math.max(consecutiveAttempts, 0), 6);
  return Math.min(
    MOBILE_CONVEX_AUTH_REARM_MAX_INTERVAL_MS,
    MOBILE_CONVEX_AUTH_REARM_MIN_INTERVAL_MS * 2 ** exponent,
  );
}

export type MobileConvexAuthStallObservation = {
  /** A Better Auth session record exists for the active account. */
  sessionPresent: boolean;
  /** The Better Auth session fetch itself has not settled yet. */
  sessionPending: boolean;
  /** Convex auth is still resolving (no verdict yet). */
  convexAuthLoading: boolean;
  /** Convex reports the client authenticated. */
  convexAuthenticated: boolean;
};

/** A stall is a settled Better Auth session that Convex reports signed out. */
export function isMobileConvexAuthStalled(
  observation: MobileConvexAuthStallObservation,
): boolean {
  return (
    observation.sessionPresent &&
    !observation.sessionPending &&
    !observation.convexAuthLoading &&
    !observation.convexAuthenticated
  );
}

export function shouldRearmMobileConvexAuth(
  observation: MobileConvexAuthStallObservation,
  timing: {
    lastAttemptAt: number;
    now: number;
    /** Re-arms already made for the current, uninterrupted stall. */
    consecutiveAttempts?: number;
  },
): boolean {
  // A signed-out account is never re-armed: without a session there is no
  // token to fetch, and retrying would fight the sign-out.
  if (!isMobileConvexAuthStalled(observation)) return false;
  const minIntervalMs = mobileConvexAuthRearmDelayMs(
    timing.consecutiveAttempts ?? 0,
  );
  return timing.now - timing.lastAttemptAt >= minIntervalMs;
}
