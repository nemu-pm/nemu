// Manual re-arm entry point for the mobile Convex auth transport.
//
// Lives outside mobileConvexAuth.tsx so that module can export components
// only (react-refresh keeps a component module's exports homogeneous), and so
// consumers like the Settings cloud-sync card can import the retry without
// pulling the provider — and its react-native imports — into their graph.
//
// The handler is registered by the mounted provider. When sync is
// unconfigured, or before the provider mounts, the retry is a no-op rather
// than an error: the caller is a user-facing button, not a contract.

type MobileConvexAuthRetryHandler = () => void;

let retryHandler: MobileConvexAuthRetryHandler | null = null;

/**
 * Registers the mounted provider's re-arm handler.
 *
 * @returns an unregister function that only clears the handler if it is still
 * the one this call installed, so a remount ordered
 * `mount(next) → unmount(previous)` cannot leave the retry dead.
 */
export function setMobileConvexAuthRetryHandler(
  handler: MobileConvexAuthRetryHandler,
): () => void {
  retryHandler = handler;
  return () => {
    if (retryHandler === handler) retryHandler = null;
  };
}

/** Forces a fresh Convex token fetch. No-op when no provider is mounted. */
export function retryMobileConvexAuth(): void {
  retryHandler?.();
}

/** Exposed for tests to isolate cases. */
export function resetMobileConvexAuthRetryForTesting(): void {
  retryHandler = null;
}
