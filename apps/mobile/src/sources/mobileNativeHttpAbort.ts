let nextMobileNativeHttpRequestId = 0;

export function createMobileNativeHttpRequestId(now = Date.now()): string {
  nextMobileNativeHttpRequestId =
    (nextMobileNativeHttpRequestId + 1) % Number.MAX_SAFE_INTEGER;
  return `nemu-http-${now.toString(36)}-${nextMobileNativeHttpRequestId.toString(36)}`;
}

export function createMobileNativeAbortError(): Error {
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
}

export function throwIfMobileNativeHttpAborted(
  signal?: AbortSignal | null,
): void {
  if (!signal?.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  throw createMobileNativeAbortError();
}

export async function runAbortableMobileNativeHttpRequest<T>(options: {
  requestId: string;
  signal?: AbortSignal | null;
  prepare(requestId: string): void;
  cancel(requestId: string): void;
  release(requestId: string): void;
  execute(): Promise<T>;
}): Promise<T> {
  const { requestId, signal } = options;
  throwIfMobileNativeHttpAborted(signal);
  options.prepare(requestId);

  const cancelTargetRequest = () => {
    try {
      options.cancel(requestId);
    } catch {
      // An abort event must never become a second process-wide exception. The
      // post-await signal check still prevents late decode or state writes.
    }
  };
  signal?.addEventListener("abort", cancelTargetRequest, { once: true });

  try {
    // Close the race where the signal flips after native preparation but
    // before the bridge invocation starts.
    if (signal?.aborted) cancelTargetRequest();
    throwIfMobileNativeHttpAborted(signal);
    const result = await options.execute();
    throwIfMobileNativeHttpAborted(signal);
    return result;
  } finally {
    signal?.removeEventListener("abort", cancelTargetRequest);
    try {
      options.release(requestId);
    } catch {
      // Native completion also releases the request. This call only closes
      // bridge/setup failure races and is intentionally idempotent.
    }
  }
}
