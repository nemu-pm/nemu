import { throwIfMobileNativeHttpAborted } from "./mobileNativeHttpAbort";

/**
 * Retry policy for idempotent source HTTP.
 *
 * Every untrusted-source request is tunneled through the in-process loopback
 * proxy, which re-resolves DNS and pins one IP literal per request
 * (`NemuNativeHttpLoopbackProxy.swift`). Connections are never reused, so a
 * cold egress path — the first mDNSResponder query after simulator boot, or an
 * unreachable first pinned endpoint burning its full 12s connect timeout — can
 * consume the native 30s request budget and surface as NSURLErrorDomain -1001
 * / "Request timed out." A retry of the same request succeeds immediately once
 * DNS/TCP are warm, which is exactly the manual-retry-then-it-works behavior
 * seen during onboarding installs and source home fetches.
 */

export const MOBILE_HTTP_RETRY_MAX_ATTEMPTS = 3;
export const MOBILE_HTTP_RETRY_BASE_BACKOFF_MS = 250;
export const MOBILE_HTTP_RETRY_MAX_BACKOFF_MS = 2_000;

/**
 * One warmup probe per origin per session. The loopback proxy cannot reuse
 * connections across requests, so the only cold-start cost a warmup can
 * remove is resolution/route discovery (mDNSResponder, TUN/VPN wake-up);
 * a single bounded probe before the first package download covers the whole
 * onboarding install burst, whose downloads share one origin.
 */
export type MobileSourceEgressWarmup = {
  shouldWarm(origin: string): boolean;
};

export function createMobileSourceEgressWarmup(): MobileSourceEgressWarmup {
  const warmedOrigins = new Set<string>();
  return {
    shouldWarm(origin) {
      if (!origin || warmedOrigins.has(origin)) return false;
      warmedOrigins.add(origin);
      return true;
    },
  };
}

const TRANSIENT_MOBILE_HTTP_ERROR_PATTERNS = [
  "timed out",
  "timeout",
  "network request failed",
  "network connection was lost",
  "connection was lost",
  "could not connect",
  "hostname could not be found",
  "could not be resolved",
  "network unavailable",
  "socket is not connected",
  "connection reset",
  "connection refused",
  // NSURLErrorDomain codes when only the number survives the bridge:
  // -1001 timed out, -1004 cannot connect, -1005 connection lost.
  "-1001",
  "-1004",
  "-1005",
  // Native lifecycle rejections: the request was started (or was running)
  // while iOS held the app inactive. Retried once the app is active again.
  "app is not active",
];

/**
 * A cancellation nemu did not ask for: the native layer cancelling a task
 * (background suspension, a session rebuilt after the loopback proxy came
 * back) rather than the caller's AbortSignal. The caller's own abort always
 * arrives as its signal reason (`runAbortableMobileNativeHttpRequest`) and is
 * excluded by name before this runs.
 */
const NON_USER_CANCELLATION_PATTERNS = ["cancelled", "canceled", "-999"];

function isCallerCancellationOrDeadline(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" ||
      error.name === "MobileSourceOperationTimeoutError")
  );
}

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error ?? ""))
    .toLowerCase();
}

/**
 * Conservative transient-failure predicate. Deliberately excludes caller
 * cancellations (AbortError) and our own deadline errors
 * (MobileSourceOperationTimeoutError): a user cancel or an install-watchdog
 * deadline must never be converted into another attempt.
 */
export function isTransientMobileHttpError(error: unknown): boolean {
  if (isCallerCancellationOrDeadline(error)) return false;
  const message = errorMessage(error);
  if (!message) return false;
  // "The registry catalog fetch was aborted." and similar: a superseded run.
  if (message.includes("aborted")) return false;
  return (
    TRANSIENT_MOBILE_HTTP_ERROR_PATTERNS.some((pattern) =>
      message.includes(pattern),
    ) ||
    NON_USER_CANCELLATION_PATTERNS.some((pattern) => message.includes(pattern))
  );
}

/**
 * The app's foreground state, as the retry policy sees it. Installed once by
 * the native HTTP module (`mobileHttpForegroundGate.native.ts`, AppState);
 * absent on web and in unit tests unless a test installs a fake.
 */
export type MobileHttpForegroundGate = {
  isActive(): boolean;
  /** Increments every time the app leaves the foreground. */
  backgroundEpoch(): number;
  /** Resolves once the app is active (immediately if it is). */
  waitForActive(signal?: AbortSignal | null): Promise<void>;
};

let foregroundGate: MobileHttpForegroundGate | null = null;

export function setMobileHttpForegroundGate(
  gate: MobileHttpForegroundGate | null,
): void {
  foregroundGate = gate;
}

export function getMobileHttpForegroundGate(): MobileHttpForegroundGate | null {
  return foregroundGate;
}

/**
 * A failure caused by the app going to the background: the app left the
 * foreground while the attempt ran (or is not active now), and the error is
 * a transport/lifecycle failure or a source-operation deadline that ran out
 * while JS was suspended. Caller aborts are never background failures.
 */
export function isMobileHttpBackgroundInterruption(
  error: unknown,
  options: {
    gate: MobileHttpForegroundGate | null;
    epochAtStart: number;
    signal?: AbortSignal | null;
  },
): boolean {
  const { gate, epochAtStart, signal } = options;
  if (!gate || signal?.aborted) return false;
  if (gate.backgroundEpoch() === epochAtStart && gate.isActive()) return false;
  if (error instanceof Error && error.name === "AbortError") return false;
  if (
    error instanceof Error &&
    error.name === "MobileSourceOperationTimeoutError"
  ) {
    return true;
  }
  return isTransientMobileHttpError(error);
}

/** `attempt` is the 1-based index of the attempt that just failed. */
export function mobileHttpRetryBackoffMs(attempt: number): number {
  const backoff =
    MOBILE_HTTP_RETRY_BASE_BACKOFF_MS * 2 ** Math.max(0, attempt - 1);
  return Math.min(backoff, MOBILE_HTTP_RETRY_MAX_BACKOFF_MS);
}

export type MobileHttpRetryOptions = {
  /** Caller's abort signal. An aborted signal always wins over a retry. */
  signal?: AbortSignal | null;
  /** Total attempts, including the first. Defaults to 3 (two retries). */
  attempts?: number;
  backoffMs?: (attempt: number) => number;
  isTransient?: (error: unknown) => boolean;
  sleep?: (ms: number) => Promise<void>;
  /**
   * Foreground state; defaults to the installed gate. A request that failed
   * because the app went to the background waits for the app to be active
   * and is retried once more (on top of `attempts`) before rejecting.
   */
  foregroundGate?: MobileHttpForegroundGate | null;
};

function sleepWithAbort(ms: number, signal?: AbortSignal | null): Promise<void> {
  if (ms <= 0) {
    throwIfMobileNativeHttpAborted(signal);
    return Promise.resolve();
  }
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      try {
        throwIfMobileNativeHttpAborted(signal);
      } catch (error) {
        reject(error);
      }
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Runs one idempotent request attempt with short exponential backoff. Only
 * transient transport failures are retried; caller aborts and deadline
 * cancellations propagate untouched. A failure caused by backgrounding gets
 * one extra attempt once the app is active again, so only a real failure
 * after a retry reaches the UI.
 *
 * Every native source HTTP path goes through here: `mobileNativeFetch` /
 * `sendMobileNativeHttpRequest` (registry and source lists, installs, sync
 * helpers), `downloadMobileNativeHttpFile` (packages, covers, reader pages)
 * and, background-only, the isolated source operations.
 */
export async function runMobileHttpRequestWithRetry<T>(
  attempt: () => Promise<T>,
  options: MobileHttpRetryOptions = {},
): Promise<T> {
  const attempts = Math.max(1, options.attempts ?? MOBILE_HTTP_RETRY_MAX_ATTEMPTS);
  const backoffMs = options.backoffMs ?? mobileHttpRetryBackoffMs;
  const isTransient = options.isTransient ?? isTransientMobileHttpError;
  const sleep = options.sleep ?? ((ms: number) => sleepWithAbort(ms, options.signal));
  const gate =
    options.foregroundGate === undefined ? foregroundGate : options.foregroundGate;
  let backgroundRetryUsed = false;

  for (let index = 1; ; index += 1) {
    throwIfMobileNativeHttpAborted(options.signal);
    const epochAtStart = gate?.backgroundEpoch() ?? 0;
    try {
      return await attempt();
    } catch (error) {
      throwIfMobileNativeHttpAborted(options.signal);
      if (
        !backgroundRetryUsed &&
        isMobileHttpBackgroundInterruption(error, {
          gate,
          epochAtStart,
          signal: options.signal,
        })
      ) {
        backgroundRetryUsed = true;
        await gate!.waitForActive(options.signal);
        throwIfMobileNativeHttpAborted(options.signal);
        // The extra attempt does not consume the transient budget.
        index -= 1;
        continue;
      }
      if (index >= attempts || !isTransient(error)) throw error;
      await sleep(backoffMs(index));
    }
  }
}
