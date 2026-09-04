// Resilient Convex auth wiring for React Native.
//
// Replaces @convex-dev/better-auth's `ConvexBetterAuthProvider`, whose token
// fetch has no retry: `AuthenticationManager.setConfig` (convex@1.31) grants a
// token fetch two chances — the initial fetch, then one forced refetch — and
// then calls `setAndReportAuthFailed`, which parks the client in `noAuth`.
// Because the library's `fetchAccessToken` identity is stable for the session
// (`useCallback([sessionId])`), the `useEffect` in `ConvexProviderWithAuth`
// never re-runs and nothing ever calls `client.setAuth()` again. A single
// flaky native HTTP window right after OAuth sign-in therefore leaves the app
// signed-in-but-never-syncing, with no error anywhere.
//
// Recovery uses ConvexProviderWithAuth's documented contract: `useAuth`'s
// returned `fetchAccessToken` is an effect dependency, so a new identity tears
// down the old auth wiring and calls `setAuth()` again. We change that
// identity on demand:
//   - reactively, when a settled Better Auth session is observed while Convex
//     reports the client unauthenticated (the stall watchdog below),
//   - on every AppState return to active, and
//   - manually, via `retryMobileConvexAuth()` from the Settings cloud-sync
//     card.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState } from "react-native";
import { ConvexProviderWithAuth, useConvexAuth } from "convex/react";
import { mobileAuthClient } from "./mobileAuthClient";
import { setMobileConvexAuthRetryHandler } from "./mobileConvexAuthRetry";
import {
  isMobileConvexAuthStalled,
  MOBILE_CONVEX_AUTH_REARM_POLL_INTERVAL_MS,
  shouldRearmMobileConvexAuth,
  type MobileConvexAuthStallObservation,
} from "./mobileConvexAuthState";

type MobileConvexAuthClient = Parameters<
  typeof ConvexProviderWithAuth
>[0]["client"];

function MobileConvexAuthStallWatchdog({ onRearm }: { onRearm: () => void }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { data: session, isPending } = mobileAuthClient.useSession();
  const sessionPresent = Boolean(session?.session);
  const stalled = isMobileConvexAuthStalled({
    sessionPresent,
    sessionPending: isPending,
    convexAuthLoading: isLoading,
    convexAuthenticated: isAuthenticated,
  });

  // The observation and the callback are read through refs so `attemptRearm`
  // can be identity-stable. It is a dependency of the AppState listener and
  // the poll timer below: rebuilding it on every render would re-subscribe the
  // listener constantly and restart the interval before it could ever fire.
  const observationRef = useRef<MobileConvexAuthStallObservation>({
    sessionPresent,
    sessionPending: isPending,
    convexAuthLoading: isLoading,
    convexAuthenticated: isAuthenticated,
  });
  const onRearmRef = useRef(onRearm);
  // Declared first so every effect below reads the current render's values.
  useEffect(() => {
    observationRef.current = {
      sessionPresent,
      sessionPending: isPending,
      convexAuthLoading: isLoading,
      convexAuthenticated: isAuthenticated,
    };
    onRearmRef.current = onRearm;
  });

  const lastAttemptAtRef = useRef(0);
  const consecutiveAttemptsRef = useRef(0);

  // A recovered (or signed-out) client ends the current stall, so the next one
  // starts from the shortest backoff step again.
  useEffect(() => {
    if (!stalled) {
      consecutiveAttemptsRef.current = 0;
      lastAttemptAtRef.current = 0;
    }
  }, [stalled]);

  const attemptRearm = useCallback(() => {
    if (
      !shouldRearmMobileConvexAuth(observationRef.current, {
        lastAttemptAt: lastAttemptAtRef.current,
        now: Date.now(),
        consecutiveAttempts: consecutiveAttemptsRef.current,
      })
    ) {
      return;
    }
    lastAttemptAtRef.current = Date.now();
    consecutiveAttemptsRef.current += 1;
    console.warn("[MobileSync] Convex auth stalled; re-arming token fetch.");
    onRearmRef.current();
  }, []);

  // React to the stall itself: both auth layers have settled to failure.
  useEffect(() => {
    if (stalled) attemptRearm();
  }, [attemptRearm, stalled]);

  // Returning to the foreground is the classic recovery moment (suspended
  // sockets, paused JS timers, captive portals completing).
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") attemptRearm();
    });
    return () => subscription.remove();
  }, [attemptRearm]);

  // Foreground fallback while the stall persists without any observable state
  // change; the backoff in shouldRearmMobileConvexAuth paces this, so most
  // ticks are no-ops.
  useEffect(() => {
    if (!stalled) return;
    const timer = setInterval(
      attemptRearm,
      MOBILE_CONVEX_AUTH_REARM_POLL_INTERVAL_MS,
    );
    return () => clearInterval(timer);
  }, [attemptRearm, stalled]);

  return null;
}

export function MobileConvexAuthProvider({
  client,
  children,
}: {
  client: MobileConvexAuthClient;
  children: ReactNode;
}) {
  const { data: session, isPending } = mobileAuthClient.useSession();
  const sessionId = session?.session?.id;
  const sessionPresent = Boolean(session?.session);
  const [rearmEpoch, setRearmEpoch] = useState(0);
  const cachedTokenRef = useRef<string | null>(null);
  const pendingTokenRef = useRef<Promise<string | null> | null>(null);
  // Bumped whenever the cache is invalidated. An in-flight fetch captures it
  // and only writes the cache if it still matches, so a request started for a
  // previous session (or before a re-arm) can never install its token for the
  // account that replaced it.
  const tokenCacheEpochRef = useRef(0);

  // A stall can also come from a token the *server* rejects (an expired
  // signing key, a clock-skew window). `setConfig` re-fetches with
  // `forceRefreshToken: false`, which would replay exactly that rejected token
  // out of the cache and re-fail immediately. So every re-arm — and every
  // session change — starts from an empty cache.
  //
  // Both invalidations must land *before* Convex's own effect calls
  // `setAuth()`. Child effects run before parent effects, so an effect here
  // would clear the cache only after the fetch it was meant to guard.
  const invalidateTokenCache = useCallback(() => {
    tokenCacheEpochRef.current += 1;
    cachedTokenRef.current = null;
    pendingTokenRef.current = null;
  }, []);

  const rearm = useCallback(() => {
    invalidateTokenCache();
    setRearmEpoch((epoch) => epoch + 1);
  }, [invalidateTokenCache]);

  const lastSessionIdRef = useRef(sessionId);
  if (lastSessionIdRef.current !== sessionId) {
    lastSessionIdRef.current = sessionId;
    invalidateTokenCache();
  }

  useEffect(() => setMobileConvexAuthRetryHandler(rearm), [rearm]);

  const useAuth = useMemo(
    () =>
      function useMobileConvexAuth() {
        const fetchAccessToken = useCallback(
          async ({ forceRefreshToken = false } = {}) => {
            if (!forceRefreshToken && cachedTokenRef.current) {
              return cachedTokenRef.current;
            }
            if (!forceRefreshToken && pendingTokenRef.current) {
              return pendingTokenRef.current;
            }
            const epoch = tokenCacheEpochRef.current;
            const isCurrent = () => tokenCacheEpochRef.current === epoch;
            const pending = mobileAuthClient.convex
              .token({ fetchOptions: { throw: false } })
              .then(({ data }) => {
                const token = data?.token ?? null;
                if (isCurrent()) cachedTokenRef.current = token;
                return token;
              })
              .catch(() => {
                if (isCurrent()) cachedTokenRef.current = null;
                return null;
              })
              .finally(() => {
                if (pendingTokenRef.current === pending) {
                  pendingTokenRef.current = null;
                }
              });
            pendingTokenRef.current = pending;
            return pending;
          },
          // Identity changes of this callback (sessionId + rearmEpoch) are the
          // documented re-arm contract: a new fetchAccessToken makes
          // ConvexProviderWithAuth call setAuth() again after the
          // authentication manager had given up.
          // eslint-disable-next-line react-hooks/exhaustive-deps
          [sessionId, rearmEpoch],
        );
        // Derived from the Better Auth session only. The token cache lives in
        // a ref so `fetchAccessToken` can read it without re-rendering; reading
        // it here instead would make both flags non-reactive (a ref write
        // schedules no render) and read mutable state during render.
        return {
          isLoading: isPending,
          isAuthenticated: sessionPresent,
          fetchAccessToken,
        };
      },
    [isPending, rearmEpoch, sessionId, sessionPresent],
  );

  return (
    <ConvexProviderWithAuth client={client} useAuth={useAuth}>
      <MobileConvexAuthStallWatchdog onRearm={rearm} />
      {children}
    </ConvexProviderWithAuth>
  );
}
