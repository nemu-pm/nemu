import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  clearSyncServerTimeObservation,
  estimatedSyncServerTime,
  hasSyncServerTimeObservation,
  MAX_SYNC_CLOCK_FUTURE_SKEW_MS,
  maximumSyncClock,
  nextSyncTimestamp,
  observeSyncServerTime,
  refreshSyncServerTime,
  SYNC_CLOCK_OUT_OF_RANGE,
} from "./sync-clock";

const originalDateNow = Date.now;

describe("server-anchored sync clock", () => {
  beforeEach(() => {
    clearSyncServerTimeObservation();
    Date.now = originalDateNow;
  });

  afterEach(() => {
    clearSyncServerTimeObservation();
    Date.now = originalDateNow;
  });

  test("ignores a device wall clock skewed more than seven days after a fresh observation", () => {
    const serverNow = 1_700_000_000_000;
    Date.now = () => serverNow + MAX_SYNC_CLOCK_FUTURE_SKEW_MS + 86_400_000;
    observeSyncServerTime(serverNow);

    const timestamp = nextSyncTimestamp();
    expect(timestamp).toBeGreaterThanOrEqual(serverNow);
    expect(timestamp).toBeLessThan(serverNow + 1_000);
  });

  test("never rolls back across wall-clock corrections or stale observations", () => {
    observeSyncServerTime(1_000, 100);
    expect(estimatedSyncServerTime(150)).toBe(1_050);

    Date.now = () => 1;
    expect(estimatedSyncServerTime(160)).toBe(1_060);
    Date.now = () => 9_000_000;
    expect(estimatedSyncServerTime(170)).toBe(1_070);

    observeSyncServerTime(900, 180);
    expect(estimatedSyncServerTime(180)).toBe(1_080);
    expect(estimatedSyncServerTime(170)).toBe(1_080);
  });

  test("uses an uncached refresh instead of a stale reactive generation sample", async () => {
    const cachedGeneration = { generation: 4, serverNow: 1_000 };
    Date.now = () => 1_000 + MAX_SYNC_CLOCK_FUTURE_SKEW_MS * 2;

    const fresh = await refreshSyncServerTime(async () => ({
      generation: cachedGeneration.generation,
      serverNow: 2_000,
    }));

    expect(fresh).toEqual({ generation: 4, serverNow: 2_000 });
    expect(hasSyncServerTimeObservation()).toBe(true);
    expect(estimatedSyncServerTime()).toBeLessThan(3_000);
  });

  test("does not accept a completed refresh after its identity became stale", async () => {
    const result = await refreshSyncServerTime(
      async () => ({ serverNow: 1_000 }),
      () => false,
    );
    expect(result).toBeNull();
    expect(hasSyncServerTimeObservation()).toBe(false);
  });

  test("clears the previous profile anchor before using another clock scope", () => {
    observeSyncServerTime(1_000, 100);
    expect(estimatedSyncServerTime(110)).toBe(1_010);
    clearSyncServerTimeObservation();

    Date.now = () => 5_000;
    expect(hasSyncServerTimeObservation()).toBe(false);
    expect(estimatedSyncServerTime(0)).toBe(5_000);
  });

  test("reserves enough safe-integer headroom for the future-skew window", () => {
    const largestAnchor =
      Number.MAX_SAFE_INTEGER - MAX_SYNC_CLOCK_FUTURE_SKEW_MS;
    observeSyncServerTime(largestAnchor, 0);
    expect(maximumSyncClock(estimatedSyncServerTime(0))).toBe(
      Number.MAX_SAFE_INTEGER,
    );
    clearSyncServerTimeObservation();

    expect(() => observeSyncServerTime(largestAnchor + 1, 0)).toThrow(
      SYNC_CLOCK_OUT_OF_RANGE,
    );
    expect(() => observeSyncServerTime(1_000, -1)).toThrow(
      SYNC_CLOCK_OUT_OF_RANGE,
    );
  });
});
