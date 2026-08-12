export interface MobileAuthSecureStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): unknown;
}

export type MobileAuthFetch = (
  input: Parameters<typeof globalThis.fetch>[0],
  init?: Parameters<typeof globalThis.fetch>[1],
) => Promise<Response>;

// React Native can leave fetch promises pending while the JS timer queue is
// paused in the background. If connectivity disappears during that window,
// the rejection may only surface when a headless task wakes the queue again.
// Normalize transport failures into an ordinary non-success response so every
// Better Auth caller receives its normal `{ data: null, error }` result. Keep
// this wrapper at the network boundary: parser and lifecycle-hook bugs must
// still throw rather than being silently classified as offline behavior.
export function createFailClosedMobileAuthFetch(
  fetchImpl: MobileAuthFetch = globalThis.fetch,
): MobileAuthFetch {
  return async (input, init) => {
    try {
      return await fetchImpl(input, init);
    } catch {
      return new Response(
        JSON.stringify({
          code: "MOBILE_AUTH_NETWORK_UNAVAILABLE",
          message: "MOBILE_AUTH_NETWORK_UNAVAILABLE",
        }),
        {
          status: init?.signal?.aborted ? 499 : 503,
          statusText: init?.signal?.aborted
            ? "Request Cancelled"
            : "Service Unavailable",
          headers: { "content-type": "application/json" },
        },
      );
    }
  };
}

const logSecureStorageUnavailable = () => {
  // Do not include the key, value, or native error: authentication storage can
  // contain secrets and native error text is not needed to classify this state.
  console.info("[mobile-auth] secure_storage_unavailable");
};

/**
 * Better Auth reads SecureStore synchronously while the client module is being
 * initialized. Native keychain access can fail transiently (for example while
 * protected data is unavailable), and that must not crash the whole app.
 * Returning null fails closed as signed out; later reads may recover normally.
 */
export function createFailClosedMobileAuthStorage(
  storage: MobileAuthSecureStorage,
  onUnavailable: () => void = logSecureStorageUnavailable,
): MobileAuthSecureStorage {
  let hasWarned = false;

  const reportUnavailable = () => {
    if (hasWarned) return;
    hasWarned = true;
    onUnavailable();
  };

  return {
    getItem(key) {
      try {
        return storage.getItem(key);
      } catch {
        reportUnavailable();
        return null;
      }
    },
    setItem(key, value) {
      try {
        const result = storage.setItem(key, value);
        if (
          result !== null &&
          typeof result === "object" &&
          "then" in result &&
          typeof result.then === "function"
        ) {
          return Promise.resolve(result).catch(() => {
            reportUnavailable();
          });
        }
        return result;
      } catch {
        reportUnavailable();
        return undefined;
      }
    },
  };
}
