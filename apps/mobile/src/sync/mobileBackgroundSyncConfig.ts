// Pure, platform-agnostic background-sync configuration and decision logic.
//
// No `expo-*` or `react-native` imports live here, so this module loads under
// bun's test runner and Expo web. The native background-task runtime
// (`mobileBackgroundSync.native.ts`) consumes these values; the base stub
// (`mobileBackgroundSync.ts`) re-exports them for type compatibility. See
// `CONTRIBUTING.md` for the platform-seam convention.
//
// On iOS, `expo-background-task` schedules a `BGProcessingTask` via
// `BGTaskScheduler`. The OS chooses when to run it (heuristic-based: battery,
// network, usage patterns) and may never run it. `minimumInterval` is a lower
// bound in minutes; iOS often ignores short intervals and runs overnight. The
// task can run for minutes (vs the deprecated `expo-background-fetch` 30s
// window), but the system can interrupt at any time — see
// `addExpirationListener` in the native module.

export const MOBILE_BACKGROUND_SYNC_TASK_NAME = "nemu-mobile-background-sync";

// Minimum interval (minutes) between background sync runs. iOS treats this as
// advisory; the system typically runs background tasks during specific windows
// (e.g. overnight) and ignores short intervals. 4 hours balances freshness
// against battery — the foreground subscription path keeps data live while the
// app is open; background sync is a fallback for when it isn't.
export const MOBILE_BACKGROUND_SYNC_MINIMUM_INTERVAL_MINUTES = 240;

// Background sync is best-effort and never user-blocking. These gates keep it
// off when it would only churn or conflict with the foreground sync path.

// Skip a background sync run if the last attempt finished fewer than this many
// milliseconds ago, to avoid re-entrancy when iOS fires the worker in rapid
// succession during testing or after a reboot.
export const MOBILE_BACKGROUND_SYNC_DEBOUNCE_MS = 60_000;

// Hard cap on how long a single background sync run may hold the JS thread
// before yielding back to the OS. iOS `BGProcessingTask` can run for minutes,
// but we self-limit so a stuck network call can't exhaust the window and get
// the app killed (which delays future runs).
export const MOBILE_BACKGROUND_SYNC_TIMEOUT_MS = 25_000;

/**
 * Compute the budget left for the sync runner after the headless auth/profile/
 * database bootstrap has completed. The OS execution window covers that
 * bootstrap too, so starting a fresh timeout afterwards would let one task
 * exceed our own safety ceiling.
 */
export function getMobileBackgroundSyncRemainingMs(options: {
  startedAt: number;
  now: number;
  timeoutMs?: number;
}): number {
  const timeoutMs = options.timeoutMs ?? MOBILE_BACKGROUND_SYNC_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return 0;
  if (!Number.isFinite(options.startedAt) || !Number.isFinite(options.now)) return 0;
  return Math.max(0, Math.floor(timeoutMs - Math.max(0, options.now - options.startedAt)));
}

export type MobileBackgroundSyncEligibility = {
  eligible: boolean;
  reason:
    | "ok"
    | "sync-not-configured"
    | "not-authenticated"
    | "debounced"
    | "already-running";
};

export function shouldRunMobileBackgroundSync(options: {
  configured: boolean;
  authenticated: boolean;
  lastRunAt: number;
  now: number;
  alreadyRunning: boolean;
}): MobileBackgroundSyncEligibility {
  if (!options.configured) return { eligible: false, reason: "sync-not-configured" };
  if (!options.authenticated) return { eligible: false, reason: "not-authenticated" };
  if (options.alreadyRunning) return { eligible: false, reason: "already-running" };
  if (
    options.lastRunAt > 0 &&
    options.now - options.lastRunAt < MOBILE_BACKGROUND_SYNC_DEBOUNCE_MS
  ) {
    return { eligible: false, reason: "debounced" };
  }
  return { eligible: true, reason: "ok" };
}
