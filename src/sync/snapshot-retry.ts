/**
 * Retry channel for a sync round that stopped on a hard limit.
 *
 * The snapshot subscriptions accumulate pages inside `usePaginatedQuery`, so
 * once the shared row/byte budget is exhausted there is no way to re-drive
 * them from page one without a fresh mount. Bumping this attempt counter
 * remounts the snapshot runner, which is what turns "sync is disabled for the
 * rest of this session" into "sync retries on the next app start or when the
 * user asks for it".
 */

let attempt = 0;
const listeners = new Set<() => void>();

export function getSyncSnapshotRetryAttempt(): number {
  return attempt;
}

export function subscribeSyncSnapshotRetry(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Restart the snapshot subscriptions from page one. */
export function requestSyncSnapshotRetry(): void {
  attempt += 1;
  for (const listener of [...listeners]) listener();
}

export function resetSyncSnapshotRetry(): void {
  attempt = 0;
  for (const listener of [...listeners]) listener();
}
