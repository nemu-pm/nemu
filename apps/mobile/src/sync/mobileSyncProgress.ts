// First-sync progress state shared between the sync bridge (producer) and the
// toast surface (consumer).
//
// The bridge applies three snapshot domains independently (library+
// collections, progress, settings). A first sync is complete only when all
// three have applied at least once for the active account. This module is a
// plain external store — the bridge lives above the toast provider in the
// React tree, so an event/store seam (like mobileDataEvents) is the only way
// to surface its progress without restructuring the root layout.
//
// "First sync" means the active profile store has never recorded a healthy
// snapshot state: a fresh install, a new account, or a first sync that was
// interrupted before completion. Routine incremental syncs stay idle/silent.

type MobileSyncProgressStatus = "idle" | "syncing" | "completed" | "paused";

export type MobileSyncProgressDomain = "library" | "progress" | "settings";

const MOBILE_SYNC_PROGRESS_DOMAINS: readonly MobileSyncProgressDomain[] = [
  "library",
  "progress",
  "settings",
];

type MobileSyncProgressState = {
  status: MobileSyncProgressStatus;
  accountUserId: string | null;
  /**
   * Monotonic id of the tracked run, bumped by every `begin`. Consumers key
   * per-run UI state on this: signing back into the *same* account starts a
   * new run that must not inherit the previous run's timers or dismissals.
   */
  runId: number;
  libraryCount: number | null;
  sourceCount: number | null;
  domainsCompleted: Record<MobileSyncProgressDomain, boolean>;
};

export function isMobileSyncProgressComplete(
  domains: Record<MobileSyncProgressDomain, boolean>,
): boolean {
  return MOBILE_SYNC_PROGRESS_DOMAINS.every((domain) => domains[domain]);
}

const listeners = new Set<() => void>();

let runIdSequence = 0;

function idleState(): MobileSyncProgressState {
  return {
    status: "idle",
    accountUserId: null,
    runId: 0,
    libraryCount: null,
    sourceCount: null,
    domainsCompleted: { library: false, progress: false, settings: false },
  };
}

let state: MobileSyncProgressState = idleState();

function publish(next: MobileSyncProgressState): void {
  state = next;
  for (const listener of listeners) listener();
}

export function subscribeMobileSyncProgress(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getMobileSyncProgress(): MobileSyncProgressState {
  return state;
}

/**
 * Begin tracking a first sync for an account.
 *
 * Idempotent, and deliberately only startable from `idle`. The snapshot-gate
 * effect that calls this re-runs on every sync-status revision, so anything
 * that restarted a live run would republish `syncing` over a `completed` or
 * `paused` run and make the toast flicker. A different account takes over
 * (sign-out and account switch reset the tracker explicitly).
 */
export function beginMobileSyncProgress(accountUserId: string): void {
  if (!accountUserId) return;
  if (state.status !== "idle" && state.accountUserId === accountUserId) {
    return;
  }
  publish({
    ...idleState(),
    status: "syncing",
    accountUserId,
    runId: ++runIdSequence,
  });
}

/**
 * Record that one snapshot domain applied successfully. Completes the run
 * once every domain has applied; counts are captured opportunistically.
 */
export function markMobileSyncProgressDomain(
  accountUserId: string,
  domain: MobileSyncProgressDomain,
  counts: { libraryCount?: number; sourceCount?: number } = {},
): void {
  if (
    state.status !== "syncing" ||
    state.accountUserId !== accountUserId ||
    state.domainsCompleted[domain]
  ) {
    return;
  }
  const domainsCompleted = {
    ...state.domainsCompleted,
    [domain]: true,
  };
  publish({
    ...state,
    domainsCompleted,
    libraryCount: counts.libraryCount ?? state.libraryCount,
    sourceCount: counts.sourceCount ?? state.sourceCount,
    status: isMobileSyncProgressComplete(domainsCompleted)
      ? "completed"
      : "syncing",
  });
}

/**
 * Park a first sync that cannot proceed (snapshot budget exceeded). The
 * Settings recovery surface owns the retry; the toast only reports.
 */
export function pauseMobileSyncProgress(accountUserId: string): void {
  if (state.status !== "syncing" || state.accountUserId !== accountUserId) {
    return;
  }
  publish({ ...state, status: "paused" });
}

/** Reset tracking on sign-out, account switch, or profile store swap. */
export function resetMobileSyncProgress(expectedAccountUserId?: string): void {
  if (
    expectedAccountUserId !== undefined &&
    state.accountUserId !== expectedAccountUserId
  ) {
    return;
  }
  if (state.status === "idle") return;
  publish(idleState());
}

/** Exposed for tests to isolate cases. */
export function resetMobileSyncProgressForTesting(): void {
  runIdSequence = 0;
  publish(idleState());
}
