import { describe, expect, test } from "bun:test";
import {
  isMobileConvexAuthStalled,
  MOBILE_CONVEX_AUTH_REARM_MAX_INTERVAL_MS,
  MOBILE_CONVEX_AUTH_REARM_MIN_INTERVAL_MS,
  mobileConvexAuthRearmDelayMs,
  shouldRearmMobileConvexAuth,
} from "./mobileConvexAuthState";

const healthy = {
  sessionPresent: true,
  sessionPending: false,
  convexAuthLoading: false,
  convexAuthenticated: true,
};

const stalled = {
  sessionPresent: true,
  sessionPending: false,
  convexAuthLoading: false,
  convexAuthenticated: false,
};

describe("isMobileConvexAuthStalled", () => {
  test("a settled session that Convex reports signed out is stalled", () => {
    expect(isMobileConvexAuthStalled(stalled)).toBe(true);
  });

  test("healthy Convex auth is not stalled", () => {
    expect(isMobileConvexAuthStalled(healthy)).toBe(false);
  });

  test("unsettled states are not stalls", () => {
    expect(
      isMobileConvexAuthStalled({ ...stalled, convexAuthLoading: true }),
    ).toBe(false);
    expect(
      isMobileConvexAuthStalled({ ...stalled, sessionPending: true }),
    ).toBe(false);
    expect(
      isMobileConvexAuthStalled({ ...stalled, sessionPresent: false }),
    ).toBe(false);
  });
});

describe("mobileConvexAuthRearmDelayMs", () => {
  test("the first re-arm of a stall waits the minimum interval", () => {
    expect(mobileConvexAuthRearmDelayMs(0)).toBe(
      MOBILE_CONVEX_AUTH_REARM_MIN_INTERVAL_MS,
    );
  });

  test("doubles per consecutive re-arm", () => {
    expect(mobileConvexAuthRearmDelayMs(1)).toBe(
      MOBILE_CONVEX_AUTH_REARM_MIN_INTERVAL_MS * 2,
    );
    expect(mobileConvexAuthRearmDelayMs(2)).toBe(
      MOBILE_CONVEX_AUTH_REARM_MIN_INTERVAL_MS * 4,
    );
  });

  test("caps so a permanent failure never stops retrying entirely", () => {
    expect(mobileConvexAuthRearmDelayMs(50)).toBe(
      MOBILE_CONVEX_AUTH_REARM_MAX_INTERVAL_MS,
    );
    expect(mobileConvexAuthRearmDelayMs(-3)).toBe(
      MOBILE_CONVEX_AUTH_REARM_MIN_INTERVAL_MS,
    );
  });
});

describe("shouldRearmMobileConvexAuth", () => {
  test("never re-arms a non-stalled client", () => {
    expect(
      shouldRearmMobileConvexAuth(healthy, { lastAttemptAt: 0, now: 60_000 }),
    ).toBe(false);
    expect(
      shouldRearmMobileConvexAuth(
        { ...stalled, convexAuthLoading: true },
        { lastAttemptAt: 0, now: 60_000 },
      ),
    ).toBe(false);
  });

  test("re-arms a stall once the minimum interval has elapsed", () => {
    expect(
      shouldRearmMobileConvexAuth(stalled, {
        lastAttemptAt: 0,
        now: MOBILE_CONVEX_AUTH_REARM_MIN_INTERVAL_MS,
      }),
    ).toBe(true);
  });

  test("throttles retries inside the minimum interval", () => {
    expect(
      shouldRearmMobileConvexAuth(stalled, {
        lastAttemptAt: 50_000,
        now: 50_000 + MOBILE_CONVEX_AUTH_REARM_MIN_INTERVAL_MS - 1,
      }),
    ).toBe(false);
  });

  test("backs off as re-arms for one stall accumulate", () => {
    // A stall that never clears (revoked signing key, misconfigured
    // deployment) must not restart the websocket every 10s forever.
    const stillTooSoon = shouldRearmMobileConvexAuth(stalled, {
      lastAttemptAt: 0,
      consecutiveAttempts: 3,
      now: MOBILE_CONVEX_AUTH_REARM_MIN_INTERVAL_MS,
    });
    expect(stillTooSoon).toBe(false);
    expect(
      shouldRearmMobileConvexAuth(stalled, {
        lastAttemptAt: 0,
        consecutiveAttempts: 3,
        now: mobileConvexAuthRearmDelayMs(3),
      }),
    ).toBe(true);
  });
});
