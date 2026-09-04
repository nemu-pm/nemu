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
  "hostname could not be found",
  "could not be resolved",
  "network unavailable",
  "socket is not connected",
  "connection reset",
  "connection refused",
];

/**
 * Conservative transient-failure predicate. Deliberately excludes caller
 * cancellations (AbortError) and our own deadline errors
 * (MobileSourceOperationTimeoutError): a user cancel or an install-watchdog
 * deadline must never be converted into another attempt.
 */
export function isTransientMobileHttpError(error: unknown): boolean {
  if (error instanceof Error) {
    if (
      error.name === "AbortError" ||
      error.name === "MobileSourceOperationTimeoutError"
    ) {
      return false;
    }
  }
  const message = (
    error instanceof Error ? error.message : String(error)
  ).toLowerCase();
  if (!message) return false;
  return TRANSIENT_MOBILE_HTTP_ERROR_PATTERNS.some((pattern) =>
    message.includes(pattern),
  );
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
 * cancellations propagate untouched.
 */
export async function runMobileHttpRequestWithRetry<T>(
  attempt: () => Promise<T>,
  options: MobileHttpRetryOptions = {},
): Promise<T> {
  const attempts = Math.max(1, options.attempts ?? MOBILE_HTTP_RETRY_MAX_ATTEMPTS);
  const backoffMs = options.backoffMs ?? mobileHttpRetryBackoffMs;
  const isTransient = options.isTransient ?? isTransientMobileHttpError;
  const sleep = options.sleep ?? ((ms: number) => sleepWithAbort(ms, options.signal));

  for (let index = 1; ; index += 1) {
    throwIfMobileNativeHttpAborted(options.signal);
    try {
      return await attempt();
    } catch (error) {
      if (index >= attempts || !isTransient(error)) throw error;
      throwIfMobileNativeHttpAborted(options.signal);
      await sleep(backoffMs(index));
    }
  }
}
