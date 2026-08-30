/**
 * Client clocks are hints for deterministic offline ordering, not authority to
 * reserve the whole numeric timeline. Bound them to one week ahead of the
 * receiving wall clock so a corrupt or hostile client cannot make a record
 * unwritable for years or saturate JavaScript's safe-integer range.
 */
export const MAX_SYNC_CLOCK_FUTURE_SKEW_MS = 7 * 24 * 60 * 60 * 1_000;
export const SYNC_CLOCK_OUT_OF_RANGE = "SYNC_CLOCK_OUT_OF_RANGE";

type SyncServerClockAnchor = {
  serverNow: number;
  monotonicNow: number;
  lastEstimate: number;
  lastMonotonicNow: number;
};

let syncServerClockAnchor: SyncServerClockAnchor | null = null;

function monotonicNow(): number {
  const value = globalThis.performance?.now?.();
  return Number.isFinite(value) && value >= 0 ? value : Date.now();
}

function assertMonotonicClock(value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(SYNC_CLOCK_OUT_OF_RANGE);
  }
}

function estimateFromAnchor(
  anchor: SyncServerClockAnchor,
  currentMonotonicNow: number,
): number {
  const elapsed = Math.max(0, currentMonotonicNow - anchor.monotonicNow);
  const estimate = Math.floor(anchor.serverNow + elapsed);
  if (!Number.isSafeInteger(estimate) || estimate < 0) {
    throw new RangeError(SYNC_CLOCK_OUT_OF_RANGE);
  }
  return Math.max(anchor.lastEstimate, estimate);
}

/**
 * Anchor client logical clocks to an authenticated server observation. Using a
 * monotonic elapsed time afterwards makes writes resilient to a badly skewed
 * device clock and to wall-clock corrections while the app stays open.
 */
export function observeSyncServerTime(
  serverNow: number,
  observedMonotonicNow = monotonicNow(),
): void {
  assertMonotonicClock(observedMonotonicNow);
  if (
    !Number.isSafeInteger(serverNow) ||
    serverNow < 0 ||
    serverNow > Number.MAX_SAFE_INTEGER - MAX_SYNC_CLOCK_FUTURE_SKEW_MS
  ) {
    throw new RangeError(SYNC_CLOCK_OUT_OF_RANGE);
  }
  const previousEstimate = syncServerClockAnchor
    ? estimateFromAnchor(syncServerClockAnchor, observedMonotonicNow)
    : serverNow;
  const anchoredServerNow = Math.max(serverNow, previousEstimate);
  const anchoredMonotonicNow = syncServerClockAnchor
    ? Math.max(
        observedMonotonicNow,
        syncServerClockAnchor.lastMonotonicNow,
      )
    : observedMonotonicNow;
  syncServerClockAnchor = {
    serverNow: anchoredServerNow,
    monotonicNow: anchoredMonotonicNow,
    lastEstimate: anchoredServerNow,
    lastMonotonicNow: anchoredMonotonicNow,
  };
}

export function hasSyncServerTimeObservation(): boolean {
  return syncServerClockAnchor !== null;
}

/**
 * Observe an authenticated, uncached server round trip only if the account /
 * profile that started it is still current. A reactive query is not a fresh
 * clock source: Convex may reuse its dependency-cached result indefinitely.
 */
export async function refreshSyncServerTime<
  TObservation extends { serverNow: number },
>(
  loadFreshObservation: () => Promise<TObservation>,
  shouldAccept: () => boolean = () => true,
): Promise<TObservation | null> {
  const observation = await loadFreshObservation();
  if (!shouldAccept()) return null;
  observeSyncServerTime(observation.serverNow);
  return observation;
}

/** Current server-anchored time, falling back to the local clock pre-auth. */
export function estimatedSyncServerTime(
  currentMonotonicNow = monotonicNow(),
): number {
  assertMonotonicClock(currentMonotonicNow);
  if (syncServerClockAnchor) {
    const estimate = estimateFromAnchor(
      syncServerClockAnchor,
      currentMonotonicNow,
    );
    syncServerClockAnchor.lastEstimate = estimate;
    syncServerClockAnchor.lastMonotonicNow = Math.max(
      syncServerClockAnchor.lastMonotonicNow,
      currentMonotonicNow,
    );
    return estimate;
  }
  const localNow = Date.now();
  if (!Number.isSafeInteger(localNow) || localNow < 0) {
    throw new RangeError(SYNC_CLOCK_OUT_OF_RANGE);
  }
  return localNow;
}

/** Test/session cleanup; the next authenticated generation observation resets it. */
export function clearSyncServerTimeObservation(): void {
  syncServerClockAnchor = null;
}

export function maximumSyncClock(now: number): number {
  if (!Number.isSafeInteger(now) || now < 0) {
    throw new RangeError(SYNC_CLOCK_OUT_OF_RANGE);
  }
  const maximum = now + MAX_SYNC_CLOCK_FUTURE_SKEW_MS;
  if (!Number.isSafeInteger(maximum)) {
    throw new RangeError(SYNC_CLOCK_OUT_OF_RANGE);
  }
  return maximum;
}

export function isAcceptableSyncClock(clock: number, now: number): boolean {
  if (
    !Number.isSafeInteger(clock) ||
    clock < 0 ||
    !Number.isSafeInteger(now) ||
    now < 0
  ) {
    return false;
  }
  const maximum = now + MAX_SYNC_CLOCK_FUTURE_SKEW_MS;
  return Number.isSafeInteger(maximum) && clock <= maximum;
}

/**
 * Convert a persisted clock into a safe comparison value. Older releases did
 * not bound logical clocks, so a corrupt row may already contain an unsafe or
 * far-future value. Treating that value as authoritative would make the row
 * impossible to edit after the inbound validation rollout.
 */
export function normalizeSyncClock(
  clock: number | null | undefined,
  now = estimatedSyncServerTime(),
  fallback = 0,
): number {
  return clock !== null &&
    clock !== undefined &&
    isAcceptableSyncClock(clock, now)
    ? clock
    : fallback;
}

/**
 * Return a client-side sync clock strictly newer than every observed record.
 * Invalid observations are ignored so rows poisoned by older clients remain
 * editable. A valid observation at the current ceiling still fails closed:
 * there is no valid strictly-newer value until wall time advances.
 */
export function nextSyncTimestamp(
  ...observed: Array<number | null | undefined>
): number {
  const now = estimatedSyncServerTime();
  const maximum = maximumSyncClock(now);
  let next = now;
  for (const timestamp of observed) {
    if (timestamp == null || !isAcceptableSyncClock(timestamp, now)) continue;
    const candidate = timestamp + 1;
    if (!Number.isSafeInteger(candidate) || candidate > maximum) {
      throw new RangeError(SYNC_CLOCK_OUT_OF_RANGE);
    }
    next = Math.max(next, candidate);
  }
  return next;
}

/**
 * Convert an untrusted legacy event time into a deterministic logical clock
 * when it is plausible. A future/corrupt legacy event receives the oldest
 * valid logical clock instead of a value near the client-side ceiling. This
 * avoids a client/server `Date.now()` race at the ceiling and ensures the
 * import can be accepted even when the old device clock was poisoned.
 */
export function boundedLegacySyncTimestamp(
  observedAt: number,
  now = estimatedSyncServerTime(),
): number {
  maximumSyncClock(now);
  if (
    !Number.isFinite(observedAt) ||
    !Number.isSafeInteger(Math.floor(observedAt)) ||
    observedAt < 0 ||
    observedAt > now
  ) {
    return 1;
  }
  return Math.floor(observedAt) + 1;
}
