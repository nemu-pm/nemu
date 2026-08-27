import { describe, expect, test } from "bun:test";
import {
  SYNC_APPLY_RETRY_BASE_MS,
  SYNC_APPLY_RETRY_JITTER_RATIO,
  SYNC_APPLY_RETRY_MAX_MS,
  syncApplyRetryDelayMs,
} from "./retry-backoff";

describe("snapshot apply retry backoff", () => {
  test("keeps the deterministic exponential schedule as the floor", () => {
    const noJitter = () => 0;
    expect(syncApplyRetryDelayMs(1, noJitter)).toBe(SYNC_APPLY_RETRY_BASE_MS);
    expect(syncApplyRetryDelayMs(2, noJitter)).toBe(
      SYNC_APPLY_RETRY_BASE_MS * 2,
    );
    expect(syncApplyRetryDelayMs(5, noJitter)).toBe(
      SYNC_APPLY_RETRY_BASE_MS * 16,
    );
    // Attempt 6 would be base * 32 = 32s, but the schedule caps at MAX.
    expect(syncApplyRetryDelayMs(6, noJitter)).toBe(SYNC_APPLY_RETRY_MAX_MS);
  });

  test("caps the schedule so a long outage still retries", () => {
    expect(syncApplyRetryDelayMs(50, () => 0)).toBe(SYNC_APPLY_RETRY_MAX_MS);
    expect(syncApplyRetryDelayMs(50, () => 0.999)).toBeLessThanOrEqual(
      Math.round(SYNC_APPLY_RETRY_MAX_MS * (1 + SYNC_APPLY_RETRY_JITTER_RATIO)),
    );
  });

  test("spreads simultaneous retries instead of stampeding together", () => {
    // Five apply domains fail on one dropped socket. Without jitter they all
    // retried in the same millisecond, on every attempt, forever.
    const base = SYNC_APPLY_RETRY_BASE_MS * 8;
    const low = syncApplyRetryDelayMs(4, () => 0);
    const high = syncApplyRetryDelayMs(4, () => 0.999);
    expect(low).toBe(base);
    expect(high).toBeGreaterThan(low);
    expect(high).toBeLessThanOrEqual(
      Math.round(base * (1 + SYNC_APPLY_RETRY_JITTER_RATIO)),
    );
  });

  test("never schedules a retry earlier than the deterministic delay", () => {
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      const floor = syncApplyRetryDelayMs(attempt, () => 0);
      for (let sample = 0; sample < 50; sample += 1) {
        expect(syncApplyRetryDelayMs(attempt)).toBeGreaterThanOrEqual(floor);
      }
    }
  });

  test("treats a non-positive attempt as the first attempt", () => {
    expect(syncApplyRetryDelayMs(0, () => 0)).toBe(SYNC_APPLY_RETRY_BASE_MS);
  });
});
