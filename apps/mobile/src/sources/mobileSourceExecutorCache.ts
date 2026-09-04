import { markMobilePerformance } from "@/lib/mobilePerformance";
import {
  createMobileSourceExecutorSession,
  type MobileSourceExecutorOptions,
  type MobileSourceExecutorSession,
} from "./mobileSourceExecutor";
import {
  makeMobileRuntimeSourceKey,
  type MobileRuntimeSource,
} from "./mobileSourceRuntime";
import { isMobileSourceOperationTimeoutError } from "./mobileSourceOperationTimeout";
import {
  getActiveMobileSourceProfileScope,
  makeMobileSourceExecutionKey,
  registerMobileSourceProfileTransitionHandler,
} from "./mobileSourceProfileScope";

/**
 * Mobile source executor session cache.
 *
 * The Aidoku WASM runtime parses the `.aix` package and runs
 * `WebAssembly.compile` + `WebAssembly.instantiate` on the React Native JS
 * thread every time `createMobileSourceExecutorSession` builds a session. Doing
 * that per button tap is the dominant cause of multi-second freezes on mobile
 * source screens. This cache keeps *ready* sessions alive keyed by sourceKey so
 * a repeated tap reuses the already-compiled source.
 *
 * Concurrency invariant: `aidokuRuntimeQueue` (mobileAidokuExecutorBridge)
 * already serializes every runtime operation, so two runtime calls for the same
 * session can never interleave. **But eviction / cacheBust / sweep are NOT
 * runtime calls** — they run on the JS thread between a `withSession` callback's
 * awaits. Without pinning, an LRU eviction (e.g. when "Add Sources" fans out
 * `Promise.allSettled` across >`maxEntries` sources concurrently) can dispose a
 * session whose `withSession` callback is still mid-await; the next runtime
 * call then returns an `ArrayBuffer` backed by already-freed WASM memory → a
 * native `EXC_BREAKPOINT` in `NativeArrayBuffer.asJavaScriptArrayBuffer`.
 *
 * So `withSession` **pins** the entry it hands out (refcount) and **defers**
 * disposal of any pinned entry: eviction/sweep/cacheBust/settings-mismatch move
 * it to a tombstone set instead of disposing, and the deferred dispose runs
 * when `withSession`'s `finally` unpins (after the callback — and thus all its
 * awaited runtime calls — have completed). Raw `acquire` does NOT pin (it has
 * no matching release guarantee), so existing acquire-only callers stay
 * evictable as before.
 */

export type MobileSourceSessionCacheConfig = {
  maxEntries?: number;
  idleTtlMs?: number;
  sweepIntervalMs?: number;
  now?: () => number;
  factory?: (
    source: MobileRuntimeSource,
    options: MobileSourceExecutorOptions
  ) => Promise<MobileSourceExecutorSession>;
  dispose?: (session: MobileSourceExecutorSession) => Promise<void> | void;
};

export type AcquireOptions = MobileSourceExecutorOptions & {
  cacheBust?: boolean;
  /**
   * The caller's lifetime. `withSession` serializes per source key, so a
   * cancelled request can still be sitting in the queue long after the screen
   * that issued it is gone; checking the signal when its turn arrives skips the
   * WASM session entirely instead of running work nobody will read.
   */
  signal?: AbortSignal;
};

export class MobileSourceSessionAbortedError extends Error {
  constructor() {
    super("The source session request was aborted.");
    this.name = "AbortError";
  }
}

type ReadySession = Extract<MobileSourceExecutorSession, { status: "ready" }>;

export class MobileSourceSessionInvalidatedError extends Error {
  readonly sourceKey: string;

  constructor(sourceKey: string) {
    super(`Source session was invalidated while loading: ${sourceKey}`);
    this.name = "MobileSourceSessionInvalidatedError";
    this.sourceKey = sourceKey;
  }
}

type CacheEntry = {
  session: ReadySession;
  lastUsed: number;
  settingsSignature: string;
  /** The one settings mutation currently being applied to this stateful
   * runtime. Concurrent callers must await it and then re-check the signature
   * instead of treating the previous signature as a cache hit. */
  settingsTransition: Promise<void> | null;
  /** Number of `withSession` callbacks currently checked out on this entry. */
  useCount: number;
  /** Set when the entry was removed from `entries` while still pinned; dispose
   * it once `useCount` reaches 0. */
  disposeWhenUnused: boolean;
};

export interface MobileSourceSessionCache {
  acquire(source: MobileRuntimeSource, options: AcquireOptions): Promise<MobileSourceExecutorSession>;
  release(sourceKey: string, session: MobileSourceExecutorSession): void;
  withSession<T>(
    source: MobileRuntimeSource,
    options: AcquireOptions,
    fn: (session: MobileSourceExecutorSession) => Promise<T>
  ): Promise<T>;
  /** Evict one sourceKey (dispose deferred while pinned). Install/update/
   * uninstall/clear-cache flows MUST call this — a cache hit skips the package
   * loader entirely, so a stale session would keep running old-version WASM. */
  remove(sourceKey: string, executionScope?: string): void;
  clear(): Promise<void>;
  peek(sourceKey: string): ReadySession | undefined;
  size(): number;
}

/**
 * Warm sessions kept alive at once.
 *
 * Two covers Dual Reader's primary + secondary source, but two is also exactly
 * the multi-source live-search fan-out, so every search used to evict both
 * pinned reader sessions and recompile their WASM on the next page turn. Three
 * lets a search (which runs at `poolSize - 1`, see
 * `MOBILE_LIVE_SEARCH_SOURCE_CONCURRENCY`) proceed while one reader session
 * survives. Above four, keeping compiled third-party runtimes alive for five
 * minutes costs more low-memory pressure than it saves on navigation.
 *
 * Deliberately one constant rather than a per-device derivation: the search
 * fan-out (`MOBILE_LIVE_SEARCH_SOURCE_CONCURRENCY`) is a module constant
 * derived from this one, so a pool size that varied at runtime would desync it.
 */
export const MOBILE_SOURCE_SESSION_POOL_SIZE = 3;

const DEFAULT_MAX_ENTRIES = MOBILE_SOURCE_SESSION_POOL_SIZE;
const DEFAULT_IDLE_TTL_MS = 5 * 60_000;
const DEFAULT_SWEEP_INTERVAL_MS = 60_000;

/** Stable signature for a resolved-settings object, used to decide whether a
 * cached session needs `updateSettings` before reuse. A false mismatch only
 * costs one cheap `updateSettings` call; a false match would skip a real
 * settings change, so the input must be built deterministically by the caller. */
export function hashSettings(settings: Record<string, unknown>): string {
  const json = JSON.stringify(settings);
  let hash = 5381;
  for (let i = 0; i < json.length; i += 1) {
    hash = ((hash << 5) + hash + json.charCodeAt(i)) | 0;
  }
  return `${json.length}:${hash >>> 0}`;
}

async function defaultDispose(session: MobileSourceExecutorSession): Promise<void> {
  if (session.status === "ready") {
    await session.source.dispose();
  }
}

export function createMobileSourceSessionCache(
  config: MobileSourceSessionCacheConfig = {}
): MobileSourceSessionCache {
  const maxEntries = config.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const idleTtlMs = config.idleTtlMs ?? DEFAULT_IDLE_TTL_MS;
  const sweepIntervalMs = config.sweepIntervalMs ?? DEFAULT_SWEEP_INTERVAL_MS;
  const now = config.now ?? (() => Date.now());
  const factory =
    config.factory ?? ((source, options) => createMobileSourceExecutorSession(source, options));
  const dispose = config.dispose ?? defaultDispose;

  /** Insertion-ordered map; most-recently-used is the last entry. */
  const entries = new Map<string, CacheEntry>();
  /** Entries removed from `entries` while still pinned (in-use). Disposed when
   * their `useCount` reaches 0. */
  const tombstones = new Set<CacheEntry>();
  /** Single-flight guard: concurrent misses for the same key await the first
   * factory run instead of each compiling their own WASM session (the extras
   * used to overwrite each other in `entries` and leak undisposed). */
  const inFlight = new Map<string, Promise<unknown>>();
  /** A source runtime owns one mutable settings bag. Keep each `withSession`
   * callback in the same per-key critical section as its settings transition;
   * otherwise a caller requesting the old settings can queue its first runtime
   * operation behind a newer update and execute with the wrong credentials or
   * preferences. Different sources still run concurrently. */
  const withSessionTails = new Map<string, Promise<void>>();
  /** A key generation invalidates factories that started before remove or a
   * cache-busting rebuild. The global generation invalidates every pending
   * factory on clear without retaining an entry for every historical key. */
  const keyInvalidationGenerations = new Map<string, number>();
  let globalInvalidationGeneration = 0;
  /** Disposal is fire-and-forget, so guard by session identity to ensure a
   * displaced/tombstoned/late session can never be disposed twice. */
  const disposedSessions = new WeakSet<ReadySession>();
  let sweepTimer: ReturnType<typeof setInterval> | null = null;

  type InvalidationGeneration = {
    global: number;
    key: number;
  };

  function currentInvalidationGeneration(key: string): InvalidationGeneration {
    return {
      global: globalInvalidationGeneration,
      key: keyInvalidationGenerations.get(key) ?? 0,
    };
  }

  function invalidationGenerationIsCurrent(
    key: string,
    generation: InvalidationGeneration,
  ): boolean {
    return (
      generation.global === globalInvalidationGeneration &&
      generation.key === (keyInvalidationGenerations.get(key) ?? 0)
    );
  }

  function invalidateKey(key: string): void {
    keyInvalidationGenerations.set(
      key,
      (keyInvalidationGenerations.get(key) ?? 0) + 1,
    );
  }

  function disposeReadySessionOnce(session: ReadySession): void {
    if (disposedSessions.has(session)) return;
    disposedSessions.add(session);
    // Defer the call itself into the promise chain. A custom disposer is
    // allowed to throw synchronously; evaluating `dispose(session)` inside
    // `Promise.resolve(...)` would let that exception escape remove/clear and
    // turn best-effort cache cleanup into a user-visible source failure.
    void Promise.resolve()
      .then(() => dispose(session))
      .catch(() => undefined);
  }

  function invalidatedError(key: string): MobileSourceSessionInvalidatedError {
    return new MobileSourceSessionInvalidatedError(key);
  }

  function ensureSweep(): void {
    if (sweepTimer || entries.size === 0) return;
    sweepTimer = setInterval(() => {
      void sweepIdle().catch(() => undefined);
    }, sweepIntervalMs);
    if (sweepTimer && typeof (sweepTimer as { unref?: () => void }).unref === "function") {
      (sweepTimer as { unref: () => void }).unref();
    }
  }

  function stopSweep(): void {
    if (sweepTimer) {
      clearInterval(sweepTimer);
      sweepTimer = null;
    }
  }

  /**
   * Dispose an entry, or defer if it is still checked out by a `withSession`
   * callback. The entry must already have been removed from `entries` by the
   * caller. Deferral prevents use-after-free of the underlying WASM runtime.
   */
  function disposeEntry(entry: CacheEntry): void {
    if (entry.useCount > 0) {
      entry.disposeWhenUnused = true;
      tombstones.add(entry);
      return;
    }
    disposeReadySessionOnce(entry.session);
  }

  /** Decrement a pinned entry's use count, disposing it if it was deferred. */
  function unpin(entry: CacheEntry): void {
    if (entry.useCount > 0) entry.useCount -= 1;
    if (entry.disposeWhenUnused && entry.useCount <= 0) {
      tombstones.delete(entry);
      disposeReadySessionOnce(entry.session);
    }
  }

  async function sweepIdle(): Promise<void> {
    const cutoff = now();
    for (const [key, entry] of entries) {
      if (cutoff - entry.lastUsed > idleTtlMs) {
        entries.delete(key);
        disposeEntry(entry);
      }
    }
    if (entries.size === 0) stopSweep();
  }

  function touch(key: string): void {
    const entry = entries.get(key);
    if (!entry) return;
    entries.delete(key);
    entries.set(key, entry);
  }

  function removeEntry(key: string, entry: CacheEntry): void {
    if (entries.get(key) === entry) {
      entries.delete(key);
      disposeEntry(entry);
    }
  }

  function evictIfNeeded(): void {
    while (entries.size > maxEntries) {
      const oldestKey = entries.keys().next().value;
      if (oldestKey === undefined) break;
      const entry = entries.get(oldestKey);
      entries.delete(oldestKey);
      if (entry) disposeEntry(entry);
    }
  }

  /**
   * Core acquire. Returns the session plus the cache entry it lives in (so
   * `withSession` can pin that exact entry). `entry` is null for blocked
   * sessions (never cached).
   */
  async function acquireEntry(
    source: MobileRuntimeSource,
    options: AcquireOptions
  ): Promise<{ session: MobileSourceExecutorSession; entry: CacheEntry | null }> {
    // Freeze the profile before any await. A queued A request must never build
    // a B native session after the account boundary has transitioned.
    const resolvedOptions: AcquireOptions = options.executionScope
      ? options
      : {
          ...options,
          executionScope: getActiveMobileSourceProfileScope(),
        };
    const key = makeMobileSourceExecutionKey(
      makeMobileRuntimeSourceKey(source),
      resolvedOptions.executionScope,
    );
    const settings = resolvedOptions.settings ?? {};
    const signature = hashSettings(settings);
    let invalidationGeneration = currentInvalidationGeneration(key);
    const existing = entries.get(key);

    if (options.cacheBust) {
      // Supersede settled and pending builds. Only the factory started by the
      // latest cacheBust may publish a session for this key.
      invalidateKey(key);
      invalidationGeneration = currentInvalidationGeneration(key);
      if (existing) {
        entries.delete(key);
        disposeEntry(existing);
      }
    } else if (existing) {
      if (existing.settingsTransition) {
        // The transition may have applied either our desired settings or a
        // different caller's. Re-enter after it settles so the signature and
        // entry identity are evaluated from the resulting state.
        await existing.settingsTransition.catch(() => undefined);
        if (!invalidationGenerationIsCurrent(key, invalidationGeneration)) {
          throw invalidatedError(key);
        }
        return acquireEntry(source, resolvedOptions);
      }

      if (existing.settingsSignature !== signature) {
        // Updating settings is itself a native runtime operation. Temporarily
        // pin the entry so an LRU eviction cannot dispose the WASM/JSC session
        // while that asynchronous update is still in flight.
        existing.useCount += 1;
        const transition = Promise.resolve().then(async () => {
          await existing.session.source.updateSettings(settings);
          if (
            !invalidationGenerationIsCurrent(key, invalidationGeneration) ||
            entries.get(key) !== existing
          ) {
            throw invalidatedError(key);
          }
          existing.settingsSignature = signature;
        });
        existing.settingsTransition = transition;
        try {
          await transition;
        } catch (error) {
          if (
            error instanceof MobileSourceSessionInvalidatedError ||
            !invalidationGenerationIsCurrent(key, invalidationGeneration) ||
            entries.get(key) !== existing
          ) {
            throw invalidatedError(key);
          }
          entries.delete(key);
          disposeEntry(existing);
          return acquireEntry(source, resolvedOptions);
        } finally {
          if (existing.settingsTransition === transition) {
            existing.settingsTransition = null;
          }
          unpin(existing);
        }
      }

      if (
        !invalidationGenerationIsCurrent(key, invalidationGeneration) ||
        entries.get(key) !== existing
      ) {
        throw invalidatedError(key);
      }
      existing.lastUsed = now();
      touch(key);
      markMobilePerformance("mobile.source.session.cache-hit", { sourceKey: key });
      return { session: existing.session, entry: existing };
    }

    // Single-flight: if another caller is already building this key, wait for
    // it and re-check the cache instead of compiling a duplicate session.
    const pending = inFlight.get(key);
    if (pending && !options.cacheBust) {
      await pending.catch(() => undefined);
      // A caller that began before remove/clear/cacheBust must not silently
      // retry and repopulate the invalidated key. Calls begun after the
      // invalidation capture the new generation and may rebuild normally.
      if (!invalidationGenerationIsCurrent(key, invalidationGeneration)) {
        throw invalidatedError(key);
      }
      return acquireEntry(source, resolvedOptions);
    }

    const create = (async () => {
      const session = await factory(source, resolvedOptions);
      if (!invalidationGenerationIsCurrent(key, invalidationGeneration)) {
        if (session.status === "ready") disposeReadySessionOnce(session);
        throw invalidatedError(key);
      }
      if (session.status === "ready") {
        const entry: CacheEntry = {
          session,
          lastUsed: now(),
          settingsSignature: signature,
          settingsTransition: null,
          useCount: 0,
          disposeWhenUnused: false,
        };
        // A concurrent writer (e.g. a cacheBust build) may have inserted while
        // the factory ran; displace it via disposeEntry rather than leaking it.
        const displaced = entries.get(key);
        if (displaced) {
          entries.delete(key);
          disposeEntry(displaced);
        }
        entries.set(key, entry);
        touch(key);
        evictIfNeeded();
        ensureSweep();
        markMobilePerformance("mobile.source.session.cache-miss", { sourceKey: key });
        return { session, entry };
      }
      return { session, entry: null };
    })();
    inFlight.set(key, create);
    try {
      return await create;
    } finally {
      if (inFlight.get(key) === create) inFlight.delete(key);
    }
  }

  async function acquire(
    source: MobileRuntimeSource,
    options: AcquireOptions
  ): Promise<MobileSourceExecutorSession> {
    const { session } = await acquireEntry(source, options);
    return session;
  }

  function release(sourceKey: string, session: MobileSourceExecutorSession): void {
    if (session.status !== "ready") return;
    const executionSourceKey = makeMobileSourceExecutionKey(sourceKey);
    const entry = entries.get(executionSourceKey);
    if (entry && entry.session === session) {
      entry.lastUsed = now();
      touch(executionSourceKey);
    }
  }

  async function withSession<T>(
    source: MobileRuntimeSource,
    options: AcquireOptions,
    fn: (session: MobileSourceExecutorSession) => Promise<T>
  ): Promise<T> {
    const resolvedOptions: AcquireOptions = options.executionScope
      ? options
      : {
          ...options,
          executionScope: getActiveMobileSourceProfileScope(),
        };
    const key = makeMobileSourceExecutionKey(
      makeMobileRuntimeSourceKey(source),
      resolvedOptions.executionScope,
    );
    const queuedGeneration = currentInvalidationGeneration(key);
    const predecessor = withSessionTails.get(key) ?? Promise.resolve();
    let releaseTurn!: () => void;
    const holdTurn = new Promise<void>((resolve) => {
      releaseTurn = resolve;
    });
    const tail = predecessor.then(() => holdTurn);
    withSessionTails.set(key, tail);

    await predecessor;
    let entry: CacheEntry | null = null;
    try {
      // A remove/clear/cacheBust issued after this call was queued must cancel
      // it rather than letting the delayed turn recreate the invalidated key.
      if (!invalidationGenerationIsCurrent(key, queuedGeneration)) {
        throw invalidatedError(key);
      }
      // Likewise for a caller that gave up while queued: never touch the
      // runtime on behalf of an abandoned request.
      if (resolvedOptions.signal?.aborted) {
        throw new MobileSourceSessionAbortedError();
      }
      const acquired = await acquireEntry(source, resolvedOptions);
      const session = acquired.session;
      entry = acquired.entry;
      if (entry) entry.useCount += 1; // pin until every callback await completes
      return await fn(session);
    } catch (error) {
      if (entry && isMobileSourceOperationTimeoutError(error)) {
        removeEntry(key, entry);
      }
      throw error;
    } finally {
      if (entry) unpin(entry);
      releaseTurn();
      if (withSessionTails.get(key) === tail) {
        withSessionTails.delete(key);
      }
    }
  }

  function remove(sourceKey: string, executionScope?: string): void {
    const executionSourceKey = makeMobileSourceExecutionKey(
      sourceKey,
      executionScope,
    );
    // Advance even when no settled entry exists so a pending factory cannot
    // resurrect the source after uninstall/update/explicit invalidation.
    invalidateKey(executionSourceKey);
    const entry = entries.get(executionSourceKey);
    if (!entry) return;
    entries.delete(executionSourceKey);
    disposeEntry(entry);
    if (entries.size === 0) stopSweep();
  }

  async function clear(): Promise<void> {
    stopSweep();
    globalInvalidationGeneration += 1;
    keyInvalidationGenerations.clear();
    const all = [...entries.values()];
    entries.clear();
    for (const entry of all) disposeEntry(entry);
    // Tombstones are already marked disposeWhenUnused; they dispose on unpin.
  }

  function peek(sourceKey: string): ReadySession | undefined {
    return entries.get(makeMobileSourceExecutionKey(sourceKey))?.session;
  }

  function size(): number {
    return entries.size;
  }

  return { acquire, release, withSession, remove, clear, peek, size };
}

/**
 * Shared production cache. Screens and background refresh paths all go through
 * this instance so a source compiled once is reused across library refresh,
 * search, browse, and manga detail.
 */
export const defaultMobileSourceSessionCache = createMobileSourceSessionCache();

registerMobileSourceProfileTransitionHandler(
  "source-session-cache",
  () => defaultMobileSourceSessionCache.clear(),
);
