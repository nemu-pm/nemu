/**
 * One-run-per-key gate for screen effects that start a long async refresh.
 *
 * The manga detail screen starts a source refresh once per refresh key
 * (`registryId:sourceId:sourceMangaId:nonce`) but its effect also depends on
 * object identities such as the loaded library entry. Before this gate the
 * effect cleanup cancelled the in-flight run whenever any of those identities
 * changed, and the re-run then skipped because the key was unchanged, so the
 * refresh never reported a result. A signed-in device hits this on nearly
 * every open: the sync bridge applies snapshots and emits data events while
 * the source request is in flight, the entry reloads, and the chapter list
 * spins forever.
 *
 * A run started through the gate is cancelled only when a different key
 * starts, when the caller explicitly cancels (no source selected), or on
 * unmount. Re-running the effect with the same key is a no-op.
 */
export type MobileKeyedRefreshRun = {
  readonly key: string;
  isCancelled(): boolean;
};

export type MobileKeyedRefreshGate = {
  /** Starts a run for `key`, or returns null when that key already ran. */
  begin(key: string): MobileKeyedRefreshRun | null;
  /** Cancels the active run and forgets the last key so it can run again. */
  reset(): void;
  /** Cancels the active run but keeps the last key (unmount). */
  cancelActive(): void;
};

export function createMobileKeyedRefreshGate(): MobileKeyedRefreshGate {
  let lastKey: string | null = null;
  let active: { key: string; cancelled: boolean } | null = null;

  const cancelActive = () => {
    if (active) active.cancelled = true;
    active = null;
  };

  return {
    begin(key) {
      if (lastKey === key) return null;
      cancelActive();
      lastKey = key;
      const run = { key, cancelled: false };
      active = run;
      return {
        key,
        isCancelled: () => run.cancelled,
      };
    },
    reset() {
      cancelActive();
      lastKey = null;
    },
    cancelActive,
  };
}
