import { describe, expect, test } from "bun:test";
import type { InstalledSource } from "@/data/schema";
import {
  clearMobileAuthSessionAfterDataReset,
  clearInstalledSourcePackageCache,
  finalizeMobileDataResetAuthProfile,
  sourceHasCachedPackage,
} from "./mobileDataManagement";

function source(overrides: Partial<InstalledSource> = {}): InstalledSource {
  return {
    id: "aidoku-community:en.example",
    registryId: "aidoku-community",
    sourceId: "en.example",
    version: 1,
    updatedAt: 100,
    ...overrides,
  };
}

describe("mobile data management helpers", () => {
  test("detects package cache references", () => {
    expect(sourceHasCachedPackage(source())).toBe(false);
    expect(sourceHasCachedPackage(source({ packageUri: "file:///cache/example.aix" }))).toBe(true);
    expect(sourceHasCachedPackage(source({ packageCacheKey: "aix:example" }))).toBe(true);
  });

  test("clears package cache pointers without removing source metadata", () => {
    const cleared = clearInstalledSourcePackageCache(source({
      name: "Example",
      packageUri: "file:///cache/example.aix",
      packageCacheKey: "aix:example",
    }));

    expect(cleared).toMatchObject({
      id: "aidoku-community:en.example",
      name: "Example",
      packageUri: null,
      packageCacheKey: null,
      updatedAt: 100,
    });
  });

  test("keeps uncached source objects stable", () => {
    const uncached = source({ name: "Example" });
    expect(clearInstalledSourcePackageCache(uncached)).toBe(uncached);
  });

  test("signs out authenticated sessions after clearing local data", async () => {
    let signOutCalls = 0;
    let unregisterCalls = 0;

    await expect(
      clearMobileAuthSessionAfterDataReset({
        isAuthenticated: () => true,
        signOut: async () => {
          signOutCalls += 1;
          return { data: { success: true }, error: null };
        },
        unregisterBackgroundSync: async () => {
          unregisterCalls += 1;
        },
      })
    ).resolves.toBe(true);

    expect(signOutCalls).toBe(1);
    expect(unregisterCalls).toBe(1);
  });

  test("skips auth cleanup when there is no authenticated session", async () => {
    let signOutCalls = 0;
    let unregisterCalls = 0;

    await expect(
      clearMobileAuthSessionAfterDataReset({
        isAuthenticated: () => false,
        signOut: async () => {
          signOutCalls += 1;
          return { data: { success: true }, error: null };
        },
        unregisterBackgroundSync: async () => {
          unregisterCalls += 1;
        },
      })
    ).resolves.toBe(false);

    expect(signOutCalls).toBe(0);
    expect(unregisterCalls).toBe(0);
  });

  test("does not unregister background sync when account sign-out fails", async () => {
    let unregisterCalls = 0;

    await expect(
      clearMobileAuthSessionAfterDataReset({
        isAuthenticated: () => true,
        signOut: async () => ({
          data: null,
          error: { message: "Network unavailable" },
        }),
        unregisterBackgroundSync: async () => {
          unregisterCalls += 1;
        },
      }),
    ).rejects.toThrow("Network unavailable");

    expect(unregisterCalls).toBe(0);
  });

  test("clears the retained profile after authenticated auth cleanup succeeds", async () => {
    const events: string[] = [];

    await expect(
      finalizeMobileDataResetAuthProfile({
        isAuthenticated: () => true,
        signOut: async () => {
          events.push("sign-out");
          return { data: { success: true }, error: null };
        },
        unregisterBackgroundSync: async () => {
          events.push("unregister");
        },
        clearRetainedProfile: async () => {
          events.push("clear-profile");
        },
      }),
    ).resolves.toBe(true);

    expect(events).toEqual(["sign-out", "unregister", "clear-profile"]);
  });

  test("clears the retained profile directly when already unauthenticated", async () => {
    const events: string[] = [];

    await expect(
      finalizeMobileDataResetAuthProfile({
        isAuthenticated: () => false,
        signOut: async () => {
          events.push("sign-out");
          return { data: { success: true }, error: null };
        },
        unregisterBackgroundSync: async () => {
          events.push("unregister");
        },
        clearRetainedProfile: async () => {
          events.push("clear-profile");
        },
      }),
    ).resolves.toBe(false);

    expect(events).toEqual(["clear-profile"]);
  });

  test("retains the mounted profile and registration when offline sign-out fails", async () => {
    const events: string[] = [];

    await expect(
      finalizeMobileDataResetAuthProfile({
        isAuthenticated: () => true,
        signOut: async () => {
          events.push("sign-out");
          return {
            data: null,
            error: { message: "Network unavailable" },
          };
        },
        unregisterBackgroundSync: async () => {
          events.push("unregister");
        },
        clearRetainedProfile: async () => {
          events.push("clear-profile");
        },
      }),
    ).rejects.toThrow("Network unavailable");

    expect(events).toEqual(["sign-out"]);
  });
});
