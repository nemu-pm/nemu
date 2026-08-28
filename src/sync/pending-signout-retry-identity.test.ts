import { describe, expect, test } from "bun:test";
import { resolvePendingSignOutCleanupRetryIdentity } from "./pending-signout-retry-identity";

describe("pending sign-out cleanup retry identity", () => {
  test("waits for both authentication layers to settle", () => {
    expect(
      resolvePendingSignOutCleanupRetryIdentity({
        convexLoading: true,
        sessionPending: false,
        convexAuthenticated: false,
        sessionUserId: undefined,
      }),
    ).toBeNull();
    expect(
      resolvePendingSignOutCleanupRetryIdentity({
        convexLoading: false,
        sessionPending: true,
        convexAuthenticated: false,
        sessionUserId: undefined,
      }),
    ).toBeNull();
  });

  test("waits while Convex and Better Auth disagree", () => {
    expect(
      resolvePendingSignOutCleanupRetryIdentity({
        convexLoading: false,
        sessionPending: false,
        convexAuthenticated: true,
        sessionUserId: undefined,
      }),
    ).toBeNull();
    expect(
      resolvePendingSignOutCleanupRetryIdentity({
        convexLoading: false,
        sessionPending: false,
        convexAuthenticated: false,
        sessionUserId: "user-a",
      }),
    ).toBeNull();
  });

  test("distinguishes settled signed-out and exact signed-in identities", () => {
    expect(
      resolvePendingSignOutCleanupRetryIdentity({
        convexLoading: false,
        sessionPending: false,
        convexAuthenticated: false,
        sessionUserId: undefined,
      }),
    ).toBeUndefined();
    expect(
      resolvePendingSignOutCleanupRetryIdentity({
        convexLoading: false,
        sessionPending: false,
        convexAuthenticated: true,
        sessionUserId: "exact-user-id",
      }),
    ).toBe("exact-user-id");
  });
});
