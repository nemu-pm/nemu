/** Backoff schedule for retrying a failed snapshot apply. */

export const SYNC_APPLY_RETRY_BASE_MS = 1_000;
export const SYNC_APPLY_RETRY_MAX_MS = 30_000;
/** Up to +25%, so the spread never delays a retry past the cap by much. */
export const SYNC_APPLY_RETRY_JITTER_RATIO = 0.25;

/**
 * Exponential backoff with jitter for snapshot-apply retries.
 *
 * The five apply domains fail together whenever the cause is shared (a dropped
 * socket, a storage error, a bad snapshot). Without jitter they also *retry*
 * together, re-creating the same thundering herd on every attempt, and every
 * client that reconnected in the same second stays in lockstep with all the
 * others. The jitter is additive so a retry is never scheduled earlier than
 * the deterministic backoff would have put it.
 *
 * @param attempt 1-based attempt number.
 * @param random Injectable source of [0, 1) for tests.
 */
export function syncApplyRetryDelayMs(
  attempt: number,
  random: () => number = Math.random,
): number {
  const exponent = Math.min(Math.max(attempt, 1) - 1, 5);
  const base = Math.min(
    SYNC_APPLY_RETRY_MAX_MS,
    SYNC_APPLY_RETRY_BASE_MS * 2 ** exponent,
  );
  const jitter = base * SYNC_APPLY_RETRY_JITTER_RATIO * random();
  return Math.round(base + jitter);
}
