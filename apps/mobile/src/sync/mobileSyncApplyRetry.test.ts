import { describe, expect, test } from "bun:test";
import {
  mobileSyncApplyRetryDelayMs,
  MOBILE_SYNC_APPLY_RETRY_BASE_MS,
  MOBILE_SYNC_APPLY_RETRY_MAX_MS,
} from "./mobileSyncApplyRetry";

describe("mobileSyncApplyRetryDelayMs", () => {
  test("first attempt starts at the base delay", () => {
    expect(mobileSyncApplyRetryDelayMs(1, () => 0)).toBe(
      MOBILE_SYNC_APPLY_RETRY_BASE_MS,
    );
  });

  test("doubles exponentially with attempt number", () => {
    expect(mobileSyncApplyRetryDelayMs(2, () => 0)).toBe(2_000);
    expect(mobileSyncApplyRetryDelayMs(3, () => 0)).toBe(4_000);
  });

  test("caps at the maximum delay", () => {
    expect(mobileSyncApplyRetryDelayMs(9, () => 0)).toBe(
      MOBILE_SYNC_APPLY_RETRY_MAX_MS,
    );
  });

  test("jitter is additive and never reduces the base delay", () => {
    expect(mobileSyncApplyRetryDelayMs(1, () => 1)).toBe(1_250);
    expect(mobileSyncApplyRetryDelayMs(1, () => 0.5)).toBe(1_125);
  });

  test("clamps non-positive attempts to the first backoff step", () => {
    expect(mobileSyncApplyRetryDelayMs(0, () => 0)).toBe(
      MOBILE_SYNC_APPLY_RETRY_BASE_MS,
    );
  });
});
