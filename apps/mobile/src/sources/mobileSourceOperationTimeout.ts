// A source may perform more than one synchronous WASM host request. Keep the
// whole operation bounded so a slow or wedged extension cannot make the app
// appear frozen for the previous 45-second window.
export const DEFAULT_MOBILE_SOURCE_OPERATION_TIMEOUT_MS = 20_000;

export class MobileSourceOperationTimeoutError extends Error {
  constructor(message = "Source operation timed out.") {
    super(message);
    this.name = "MobileSourceOperationTimeoutError";
  }
}

export function isMobileSourceOperationTimeoutError(
  error: unknown,
): error is MobileSourceOperationTimeoutError {
  return (
    error instanceof MobileSourceOperationTimeoutError ||
    (error instanceof Error &&
      error.name === "MobileSourceOperationTimeoutError")
  );
}

export function withMobileSourceOperationTimeout<T>(
  operation: Promise<T> | (() => T | Promise<T>),
  {
    timeoutMs = DEFAULT_MOBILE_SOURCE_OPERATION_TIMEOUT_MS,
    message,
  }: {
    timeoutMs?: number;
    message?: string;
  } = {},
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let settled = false;

  return new Promise<T>((resolve, reject) => {
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      fn();
    };

    timeout = setTimeout(() => {
      settle(() => reject(new MobileSourceOperationTimeoutError(message)));
    }, Math.max(1, timeoutMs));

    const promise =
      typeof operation === "function"
        ? Promise.resolve().then(operation)
        : operation;

    promise.then(
      (value) => settle(() => resolve(value)),
      (error) => settle(() => reject(error)),
    );
  });
}
