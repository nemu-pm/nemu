import { describe, expect, test } from "bun:test";
import {
  MOBILE_BACKGROUND_SYNC_DEBOUNCE_MS,
  MOBILE_BACKGROUND_SYNC_MINIMUM_INTERVAL_MINUTES,
  MOBILE_BACKGROUND_SYNC_TASK_NAME,
  MOBILE_BACKGROUND_SYNC_TIMEOUT_MS,
  getMobileBackgroundSyncRemainingMs,
  shouldRunMobileBackgroundSync,
} from "./mobileBackgroundSyncConfig";

describe("mobileBackgroundSyncConfig", () => {
  test("exposes a stable, non-empty task name", () => {
    expect(MOBILE_BACKGROUND_SYNC_TASK_NAME.length).toBeGreaterThan(0);
  });

  test("uses an advisory interval iOS will not reject as sub-minimum", () => {
    // iOS requires >= 15 minutes; we deliberately stay well above that so the
    // system doesn't clamp or ignore the request.
    expect(MOBILE_BACKGROUND_SYNC_MINIMUM_INTERVAL_MINUTES).toBeGreaterThanOrEqual(15);
  });

  test("keeps the self-imposed timeout under the BGProcessingTask ceiling", () => {
    expect(MOBILE_BACKGROUND_SYNC_TIMEOUT_MS).toBeLessThan(60_000);
    expect(MOBILE_BACKGROUND_SYNC_TIMEOUT_MS).toBeGreaterThan(0);
  });

  test("charges headless bootstrap time against the execution deadline", () => {
    expect(getMobileBackgroundSyncRemainingMs({
      startedAt: 1_000,
      now: 6_000,
      timeoutMs: 25_000,
    })).toBe(20_000);
    expect(getMobileBackgroundSyncRemainingMs({
      startedAt: 1_000,
      now: 30_000,
      timeoutMs: 25_000,
    })).toBe(0);
  });

  test("never extends the deadline when the wall clock moves backwards", () => {
    expect(getMobileBackgroundSyncRemainingMs({
      startedAt: 5_000,
      now: 4_000,
      timeoutMs: 25_000,
    })).toBe(25_000);
    expect(getMobileBackgroundSyncRemainingMs({
      startedAt: Number.NaN,
      now: 4_000,
    })).toBe(0);
  });

  test("keeps the debounce window short relative to the OS minimum scheduling interval", () => {
    // iOS/Android won't schedule background work more often than ~15 minutes, so
    // the debounce must stay well under that to never block a legitimate
    // OS-triggered run — while still being long enough to suppress rapid
    // re-entrancy within a single execution window.
    expect(MOBILE_BACKGROUND_SYNC_DEBOUNCE_MS).toBeLessThan(15 * 60 * 1000);
    expect(MOBILE_BACKGROUND_SYNC_DEBOUNCE_MS).toBeGreaterThan(0);
  });

  test("is eligible when configured, authenticated, idle, and outside the debounce window", () => {
    const result = shouldRunMobileBackgroundSync({
      configured: true,
      authenticated: true,
      lastRunAt: 1_000,
      now: 1_000 + MOBILE_BACKGROUND_SYNC_DEBOUNCE_MS + 1,
      alreadyRunning: false,
    });
    expect(result).toEqual({ eligible: true, reason: "ok" });
  });

  test("is eligible on the very first run (lastRunAt zero) when otherwise ready", () => {
    const result = shouldRunMobileBackgroundSync({
      configured: true,
      authenticated: true,
      lastRunAt: 0,
      now: 50,
      alreadyRunning: false,
    });
    expect(result).toEqual({ eligible: true, reason: "ok" });
  });

  test("is not eligible when sync is not configured", () => {
    const result = shouldRunMobileBackgroundSync({
      configured: false,
      authenticated: true,
      lastRunAt: 0,
      now: 1_000_000,
      alreadyRunning: false,
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("sync-not-configured");
  });

  test("is not eligible when the user is not authenticated", () => {
    const result = shouldRunMobileBackgroundSync({
      configured: true,
      authenticated: false,
      lastRunAt: 0,
      now: 1_000_000,
      alreadyRunning: false,
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("not-authenticated");
  });

  test("is not eligible when a previous run is still in flight", () => {
    const result = shouldRunMobileBackgroundSync({
      configured: true,
      authenticated: true,
      lastRunAt: 0,
      now: 1_000_000,
      alreadyRunning: true,
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("already-running");
  });

  test("is not eligible inside the debounce window after a recent run", () => {
    const lastRunAt = 5_000;
    const result = shouldRunMobileBackgroundSync({
      configured: true,
      authenticated: true,
      lastRunAt,
      now: lastRunAt + MOBILE_BACKGROUND_SYNC_DEBOUNCE_MS - 1,
      alreadyRunning: false,
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("debounced");
  });

  test("becomes eligible exactly at the debounce boundary", () => {
    const lastRunAt = 5_000;
    const result = shouldRunMobileBackgroundSync({
      configured: true,
      authenticated: true,
      lastRunAt,
      now: lastRunAt + MOBILE_BACKGROUND_SYNC_DEBOUNCE_MS,
      alreadyRunning: false,
    });
    expect(result).toEqual({ eligible: true, reason: "ok" });
  });

  test("checks gates in priority order: config before auth before running before debounce", () => {
    // Everything wrong at once — config wins.
    expect(
      shouldRunMobileBackgroundSync({
        configured: false,
        authenticated: false,
        lastRunAt: 1,
        now: 1,
        alreadyRunning: true,
      }).reason,
    ).toBe("sync-not-configured");

    // Auth before running/debounce.
    expect(
      shouldRunMobileBackgroundSync({
        configured: true,
        authenticated: false,
        lastRunAt: 1,
        now: 1,
        alreadyRunning: true,
      }).reason,
    ).toBe("not-authenticated");

    // Running before debounce.
    expect(
      shouldRunMobileBackgroundSync({
        configured: true,
        authenticated: true,
        lastRunAt: 1,
        now: 1,
        alreadyRunning: true,
      }).reason,
    ).toBe("already-running");
  });
});
