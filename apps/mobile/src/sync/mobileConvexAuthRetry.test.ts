import { afterEach, describe, expect, test } from "bun:test";
import {
  resetMobileConvexAuthRetryForTesting,
  retryMobileConvexAuth,
  setMobileConvexAuthRetryHandler,
} from "./mobileConvexAuthRetry";

afterEach(() => {
  resetMobileConvexAuthRetryForTesting();
});

describe("mobile convex auth retry handle", () => {
  test("is a no-op when no provider is mounted", () => {
    expect(() => retryMobileConvexAuth()).not.toThrow();
  });

  test("invokes the registered handler", () => {
    let calls = 0;
    setMobileConvexAuthRetryHandler(() => {
      calls += 1;
    });

    retryMobileConvexAuth();
    retryMobileConvexAuth();

    expect(calls).toBe(2);
  });

  test("unregistering stops the handler from being called", () => {
    let calls = 0;
    const unregister = setMobileConvexAuthRetryHandler(() => {
      calls += 1;
    });

    unregister();
    retryMobileConvexAuth();

    expect(calls).toBe(0);
  });

  test("a stale unregister never clears a newer handler", () => {
    // React can mount the replacement before unmounting the previous
    // instance; the older cleanup must not disarm the live provider.
    let previous = 0;
    let next = 0;
    const unregisterPrevious = setMobileConvexAuthRetryHandler(() => {
      previous += 1;
    });
    setMobileConvexAuthRetryHandler(() => {
      next += 1;
    });

    unregisterPrevious();
    retryMobileConvexAuth();

    expect(previous).toBe(0);
    expect(next).toBe(1);
  });
});
