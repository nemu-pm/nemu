import { describe, expect, test } from "bun:test";
import {
  getMobileBackgroundRegistrationAction,
  signOutAndUnregisterMobileBackgroundSync,
} from "./mobileBackgroundSyncLifecycle";

describe("mobile background sync lifecycle", () => {
  test("registers only after authentication is positively resolved", () => {
    expect(
      getMobileBackgroundRegistrationAction({
        isAuthenticated: true,
        isLoading: false,
      }),
    ).toBe("register");
  });

  test("never unregisters from an unknown or offline unauthenticated auth state", () => {
    expect(
      getMobileBackgroundRegistrationAction({
        isAuthenticated: false,
        isLoading: true,
      }),
    ).toBe("none");
    expect(
      getMobileBackgroundRegistrationAction({
        isAuthenticated: false,
        isLoading: false,
      }),
    ).toBe("none");
    expect(
      getMobileBackgroundRegistrationAction({
        isAuthenticated: true,
        isLoading: true,
      }),
    ).toBe("none");
  });

  test("unregisters only after an explicitly successful sign-out", async () => {
    const calls: string[] = [];

    await signOutAndUnregisterMobileBackgroundSync({
      signOut: async () => {
        calls.push("sign-out");
        return { data: { success: true }, error: null };
      },
      unregister: async () => {
        calls.push("unregister");
      },
    });

    expect(calls).toEqual(["sign-out", "unregister"]);
  });

  test("keeps registration when sign-out resolves with a network error", async () => {
    let unregisterCalls = 0;

    await expect(
      signOutAndUnregisterMobileBackgroundSync({
        signOut: async () => ({
          data: null,
          error: { message: "Network unavailable", status: 0 },
        }),
        unregister: async () => {
          unregisterCalls += 1;
        },
      }),
    ).rejects.toThrow("Network unavailable");

    expect(unregisterCalls).toBe(0);
  });

  test("keeps registration when sign-out throws or cannot be confirmed", async () => {
    let unregisterCalls = 0;
    const unregister = async () => {
      unregisterCalls += 1;
    };

    await expect(
      signOutAndUnregisterMobileBackgroundSync({
        signOut: async () => {
          throw new Error("offline");
        },
        unregister,
      }),
    ).rejects.toThrow("offline");
    await expect(
      signOutAndUnregisterMobileBackgroundSync({
        signOut: async () => ({ data: { success: false }, error: null }),
        unregister,
      }),
    ).rejects.toThrow("Failed to confirm sign out");

    expect(unregisterCalls).toBe(0);
  });
});
