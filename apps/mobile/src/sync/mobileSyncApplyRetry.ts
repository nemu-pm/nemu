// Backoff schedule for retrying a failed mobile snapshot apply.
//
// Ported from the web app's src/sync/retry-backoff.ts contract: the mobile
// bridge's apply effects only re-run when their cloud snapshot inputs change,
// so an exception (store failure, network failure inside a reconciliation
// mutation) would otherwise leave that domain unapplied until the cloud data
// changed again or the app restarted. A retry revision in the effect
// dependencies re-drives the apply after this exponential backoff with jitter.

export const MOBILE_SYNC_APPLY_RETRY_BASE_MS = 1_000;
export const MOBILE_SYNC_APPLY_RETRY_MAX_MS = 30_000;
/** Up to +25%, so the spread never delays a retry past the cap by much. */
const MOBILE_SYNC_APPLY_RETRY_JITTER_RATIO = 0.25;

/**
 * Exponential backoff with jitter for snapshot-apply retries.
 *
 * The apply domains fail together whenever the cause is shared (a dropped
 * socket, a storage error). Without jitter they also retry together,
 * re-creating lockstep retry storms across domains and devices.
 *
 * @param attempt 1-based attempt number.
 * @param random Injectable source of [0, 1) for tests.
 */
export function mobileSyncApplyRetryDelayMs(
  attempt: number,
  random: () => number = Math.random,
): number {
  const exponent = Math.min(Math.max(attempt, 1) - 1, 5);
  const base = Math.min(
    MOBILE_SYNC_APPLY_RETRY_MAX_MS,
    MOBILE_SYNC_APPLY_RETRY_BASE_MS * 2 ** exponent,
  );
  const jitter = base * MOBILE_SYNC_APPLY_RETRY_JITTER_RATIO * random();
  return Math.round(base + jitter);
}
