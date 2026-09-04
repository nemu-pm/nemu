/**
 * Shared scheduling for the Aidoku registry catalog.
 *
 * `useAvailableSources` is mounted by Browse, the welcome wizard, and the
 * Settings sources section. Each mount used to run its own registry fetch plus
 * its own silent source auto-update pass, so opening two of those screens
 * downloaded every registry index twice and could install the same package
 * update twice. This module owns the cross-consumer scheduling so the hook
 * stays a thin React wrapper:
 *
 * - one in-flight fetch: simultaneous consumers await the same promise;
 * - one shared freshness window: a fetch that completed inside the TTL is
 *   reused instead of hitting the network again on the next mount/foreground;
 * - one auto-update pass per fetch: only the consumer that starts the pass (and
 *   anyone awaiting it while it runs) sees its result.
 *
 * Everything here is pure scheduling over injected callbacks — no React, no
 * network, no store — so it can be unit tested directly.
 */

type MobileRegistryCatalogFetchResult<TCatalog> = {
  /** Identity of the catalog snapshot; pass it back to `runUpdatePass`. */
  fetchId: number;
  value: TCatalog;
  /** False when the shared freshness window served this caller from memory. */
  loaded: boolean;
};

type MobileRegistryCatalogUpdatePassResult<TUpdate> = {
  /** True only when this caller's turn actually owns/awaits the live pass. */
  ran: boolean;
  value: TUpdate | null;
};

export type MobileRegistryCatalogUpdatePassOptions = {
  /**
   * The caller's lifetime. Aborting only detaches this caller; the pass's own
   * signal is aborted once every participant has detached, so the consumer
   * that happened to start the pass unmounting no longer cancels it for
   * everyone else.
   */
  signal?: AbortSignal;
};

type MobileRegistryCatalogFetchOptions = {
  /**
   * Reuse the last successful catalog when it completed less than `ttlMs` ago.
   * Pass 0 (the default) to always hit the loader — that is the explicit
   * "refresh" path behind pull-to-refresh and error retries.
   */
  ttlMs?: number;
  /**
   * The caller's lifetime. Aborting only detaches this caller; the shared
   * loader is aborted once every participant has detached.
   */
  signal?: AbortSignal;
};

export type MobileRegistryCatalogScheduler<TCatalog> = {
  fetch(
    loader: (signal: AbortSignal) => Promise<TCatalog>,
    options?: MobileRegistryCatalogFetchOptions,
  ): Promise<MobileRegistryCatalogFetchResult<TCatalog>>;
  runUpdatePass<TUpdate>(
    fetchId: number,
    task: (signal: AbortSignal) => Promise<TUpdate>,
    options?: MobileRegistryCatalogUpdatePassOptions,
  ): Promise<MobileRegistryCatalogUpdatePassResult<TUpdate>>;
  /** Timestamp of the last successful fetch, or null when none succeeded. */
  lastCompletedAt(): number | null;
  /** Drops the shared snapshot and pass bookkeeping (profile switch, tests). */
  reset(): void;
};

function createMobileRegistryCatalogAbortError(): Error {
  const error = new Error("The registry catalog fetch was aborted.");
  error.name = "AbortError";
  return error;
}

type PendingFetch<TCatalog> = {
  fetchId: number;
  controller: AbortController;
  promise: Promise<TCatalog>;
  participants: Set<object>;
};

type CompletedFetch<TCatalog> = {
  fetchId: number;
  value: TCatalog;
  completedAt: number;
};

type UpdatePass = {
  fetchId: number;
  /**
   * The pass's own lifetime. It used to borrow the initiating consumer's
   * signal, so that consumer unmounting aborted the pass for every joiner and
   * left the snapshot's `fetchId` permanently marked as "already passed".
   */
  controller: AbortController;
  promise: Promise<unknown>;
  settled: boolean;
  participants: Set<object>;
};

export function createMobileRegistryCatalogScheduler<TCatalog>(
  options: { now?: () => number } = {},
): MobileRegistryCatalogScheduler<TCatalog> {
  const now = options.now ?? (() => Date.now());
  let nextFetchId = 0;
  let pending: PendingFetch<TCatalog> | null = null;
  let completed: CompletedFetch<TCatalog> | null = null;
  let updatePass: UpdatePass | null = null;

  function join(
    entry: PendingFetch<TCatalog>,
    signal: AbortSignal | undefined,
  ): Promise<MobileRegistryCatalogFetchResult<TCatalog>> {
    const participant = {};
    entry.participants.add(participant);
    return new Promise<MobileRegistryCatalogFetchResult<TCatalog>>(
      (resolve, reject) => {
        let settled = false;
        const detach = () => {
          if (!entry.participants.delete(participant)) return;
          // The last consumer walking away is the only safe moment to cancel
          // the shared network work.
          if (entry.participants.size === 0) entry.controller.abort();
        };
        const onAbort = () => {
          if (settled) return;
          settled = true;
          detach();
          reject(createMobileRegistryCatalogAbortError());
        };
        signal?.addEventListener("abort", onAbort);
        void entry.promise.then(
          (value) => {
            signal?.removeEventListener("abort", onAbort);
            if (settled) return;
            settled = true;
            entry.participants.delete(participant);
            resolve({ fetchId: entry.fetchId, value, loaded: true });
          },
          (error: unknown) => {
            signal?.removeEventListener("abort", onAbort);
            if (settled) return;
            settled = true;
            entry.participants.delete(participant);
            reject(error);
          },
        );
      },
    );
  }

  async function fetch(
    loader: (signal: AbortSignal) => Promise<TCatalog>,
    fetchOptions: MobileRegistryCatalogFetchOptions = {},
  ): Promise<MobileRegistryCatalogFetchResult<TCatalog>> {
    const signal = fetchOptions.signal;
    if (signal?.aborted) throw createMobileRegistryCatalogAbortError();

    if (pending) {
      // A caller that aborts its own previous reload can leave the shared
      // fetch cancelled but not yet settled. Joining it would hand the retry
      // the abort it just caused, so start fresh instead.
      if (!pending.controller.signal.aborted) return join(pending, signal);
      pending = null;
    }

    const ttlMs = fetchOptions.ttlMs ?? 0;
    if (completed && ttlMs > 0 && now() - completed.completedAt < ttlMs) {
      return {
        fetchId: completed.fetchId,
        value: completed.value,
        loaded: false,
      };
    }

    nextFetchId += 1;
    const controller = new AbortController();
    const entry: PendingFetch<TCatalog> = {
      fetchId: nextFetchId,
      controller,
      participants: new Set<object>(),
      promise: undefined as unknown as Promise<TCatalog>,
    };
    entry.promise = Promise.resolve()
      .then(() => loader(controller.signal))
      .then(
        (value) => {
          if (pending === entry) pending = null;
          // An abandoned fetch that still resolves must never overwrite a
          // newer snapshot with older data.
          if (!completed || completed.fetchId < entry.fetchId) {
            completed = { fetchId: entry.fetchId, value, completedAt: now() };
          }
          return value;
        },
        (error: unknown) => {
          if (pending === entry) pending = null;
          throw error;
        },
      );
    pending = entry;
    return join(entry, signal);
  }

  function joinUpdatePass(
    pass: UpdatePass,
    signal: AbortSignal | undefined,
  ): Promise<unknown> {
    const participant = {};
    pass.participants.add(participant);
    return new Promise<unknown>((resolve, reject) => {
      let settled = false;
      const detach = () => {
        if (!pass.participants.delete(participant)) return;
        // Only the last consumer walking away may cancel the shared pass.
        if (pass.participants.size === 0 && !pass.settled) {
          pass.controller.abort();
        }
      };
      const onAbort = () => {
        if (settled) return;
        settled = true;
        detach();
        reject(createMobileRegistryCatalogAbortError());
      };
      signal?.addEventListener("abort", onAbort);
      void pass.promise.then(
        (value) => {
          signal?.removeEventListener("abort", onAbort);
          if (settled) return;
          settled = true;
          pass.participants.delete(participant);
          resolve(value);
        },
        (error: unknown) => {
          signal?.removeEventListener("abort", onAbort);
          if (settled) return;
          settled = true;
          pass.participants.delete(participant);
          reject(error);
        },
      );
    });
  }

  async function runUpdatePass<TUpdate>(
    fetchId: number,
    task: (signal: AbortSignal) => Promise<TUpdate>,
    passOptions: MobileRegistryCatalogUpdatePassOptions = {},
  ): Promise<MobileRegistryCatalogUpdatePassResult<TUpdate>> {
    if (updatePass && updatePass.fetchId >= fetchId) {
      // Already settled for this snapshot (or a newer one exists): a late
      // joiner must not replay an install pass or re-announce its notice.
      if (updatePass.fetchId !== fetchId || updatePass.settled) {
        return { ran: false, value: null };
      }
      const value = (await joinUpdatePass(
        updatePass,
        passOptions.signal,
      )) as TUpdate;
      return { ran: true, value };
    }

    const pass: UpdatePass = {
      fetchId,
      controller: new AbortController(),
      promise: undefined as unknown as Promise<unknown>,
      settled: false,
      participants: new Set<object>(),
    };
    pass.promise = Promise.resolve()
      .then(() => task(pass.controller.signal))
      .then(
        (value) => {
          pass.settled = true;
          return value;
        },
        (error: unknown) => {
          pass.settled = true;
          throw error;
        },
      );
    updatePass = pass;
    const value = (await joinUpdatePass(pass, passOptions.signal)) as TUpdate;
    return { ran: true, value };
  }

  return {
    fetch,
    runUpdatePass,
    lastCompletedAt: () => completed?.completedAt ?? null,
    reset: () => {
      pending = null;
      completed = null;
      updatePass = null;
    },
  };
}

/**
 * Foreground freshness window. Returning to the app (or mounting another
 * consumer) inside this window reuses the shared snapshot instead of
 * re-downloading every registry index.
 */
export const MOBILE_REGISTRY_CATALOG_FRESHNESS_MS = 5 * 60_000;
