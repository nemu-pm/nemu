import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import type { NativeKVStore } from "./contracts";
import {
  clearMobileDataProfileCleanupPending,
  getMobileDataProfileSnapshot,
  loadMobileDataProfile,
  markMobileDataProfileCleanupPending,
  resetMobileDataProfileForTesting,
  retainMobileDataProfile,
  setMobileDataProfileStorageForTesting,
} from "./mobileDataProfile";
import {
  completePendingMobileDataProfileCleanup,
  MOBILE_LOCAL_DATA_CLEANUP_UNAVAILABLE,
  removeMobileDataProfileAfterSignOut,
  resetMobileDataProfileCleanupForTesting,
} from "./mobileDataProfileCleanup";
import { SecureNativeKVStore } from "./nativeKV";

class ControlledKVStore implements NativeKVStore {
  readonly values = new Map<string, string>();
  readonly events: string[] = [];
  failSetKey: string | null = null;
  failRemoveKey: string | null = null;

  async getString(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async setString(key: string, value: string): Promise<void> {
    if (key === this.failSetKey) {
      this.events.push(`set-failed:${key}`);
      throw new Error("injected secure write failure");
    }
    this.events.push(`set:${key}`);
    this.values.set(key, value);
  }

  async remove(key: string): Promise<void> {
    if (key === this.failRemoveKey) {
      this.events.push(`remove-failed:${key}`);
      throw new Error("injected secure remove failure");
    }
    this.events.push(`remove:${key}`);
    this.values.delete(key);
  }
}

let storage: ControlledKVStore;

describe("post-sign-out mobile data profile cleanup", () => {
  beforeEach(async () => {
    storage = new ControlledKVStore();
    resetMobileDataProfileCleanupForTesting();
    await setMobileDataProfileStorageForTesting(storage);
    await resetMobileDataProfileForTesting();
    await retainMobileDataProfile("user:account-a");
  });

  afterAll(async () => {
    resetMobileDataProfileCleanupForTesting();
    await setMobileDataProfileStorageForTesting(new SecureNativeKVStore());
  });

  test("persists the privacy fence and clears it only after sandbox, DB, and profile", async () => {
    const calls: string[] = [];

    await removeMobileDataProfileAfterSignOut({
      profileId: "user:account-a",
      clearSandboxData: async (scope) => {
        calls.push(`sandbox:${scope}`);
      },
      clearAccountData: async () => {
        expect(getMobileDataProfileSnapshot().pendingCleanupProfileId).toBe(
          "user:account-a",
        );
        calls.push("database");
      },
    });

    expect(calls).toEqual([
      expect.stringMatching(/^sandbox:profile:[a-f0-9]{64}$/),
      "database",
    ]);
    expect(getMobileDataProfileSnapshot()).toMatchObject({
      retainedProfileId: null,
      pendingCleanupProfileId: null,
    });
    expect(
      [...storage.values.keys()].some((key) => key.includes("account-a")),
    ).toBe(false);
    expect(storage.values.has("nemu.mobile.pending-profile-cleanup")).toBe(false);
  });

  test("reloads an identity-bound pending fence after process state resets", async () => {
    await markMobileDataProfileCleanupPending("user:account-a");
    await setMobileDataProfileStorageForTesting(storage);

    await expect(loadMobileDataProfile()).resolves.toMatchObject({
      retainedProfileId: "user:account-a",
      pendingCleanupProfileId: "user:account-a",
    });
  });

  test("does not clear data until a failed durable fence write is successfully retried", async () => {
    const calls: string[] = [];
    storage.events.length = 0;
    storage.failSetKey = "nemu.mobile.pending-profile-cleanup";

    await expect(
      removeMobileDataProfileAfterSignOut({
        profileId: "user:account-a",
        clearSandboxData: async () => {
          calls.push("sandbox");
        },
        clearAccountData: async () => {
          calls.push("database");
        },
      }),
    ).rejects.toThrow(MOBILE_LOCAL_DATA_CLEANUP_UNAVAILABLE);

    expect(getMobileDataProfileSnapshot()).toMatchObject({
      retainedProfileId: "user:account-a",
      pendingCleanupProfileId: "user:account-a",
    });
    expect(calls).toEqual([]);
    expect(storage.values.has("nemu.mobile.pending-profile-cleanup")).toBe(
      false,
    );
    expect(storage.events).toEqual([
      "set-failed:nemu.mobile.pending-profile-cleanup",
    ]);

    storage.failSetKey = null;
    storage.events.length = 0;
    await completePendingMobileDataProfileCleanup({
      profileId: "user:account-a",
      clearSandboxData: async () => {
        expect(
          storage.values.get("nemu.mobile.pending-profile-cleanup"),
        ).toBe("user:account-a");
        calls.push("sandbox");
      },
      clearAccountData: async () => {
        calls.push("database");
      },
    });
    expect(calls).toEqual(["sandbox", "database"]);
    expect(storage.events).toEqual([
      "set:nemu.mobile.pending-profile-cleanup",
      "remove:nemu.mobile.last-profile-id",
      "remove:nemu.mobile.pending-profile-cleanup",
    ]);
    expect(getMobileDataProfileSnapshot()).toMatchObject({
      retainedProfileId: null,
      pendingCleanupProfileId: null,
    });
  });

  test("keeps a failed removal fenced and makes the same operation retryable", async () => {
    let databaseCalls = 0;
    const clearSandboxData = async () => undefined;
    const clearAccountData = async () => {
      databaseCalls += 1;
      if (databaseCalls === 1) throw new Error("private SQLite detail");
    };

    await expect(
      removeMobileDataProfileAfterSignOut({
        profileId: "user:account-a",
        clearSandboxData,
        clearAccountData,
      }),
    ).rejects.toThrow(MOBILE_LOCAL_DATA_CLEANUP_UNAVAILABLE);
    expect(getMobileDataProfileSnapshot()).toMatchObject({
      retainedProfileId: "user:account-a",
      pendingCleanupProfileId: "user:account-a",
    });

    await completePendingMobileDataProfileCleanup({
      profileId: "user:account-a",
      clearSandboxData,
      clearAccountData,
    });
    expect(databaseCalls).toBe(2);
    expect(getMobileDataProfileSnapshot()).toMatchObject({
      retainedProfileId: null,
      pendingCleanupProfileId: null,
    });
  });

  test("finishes only the marker when data was cleared before its final remove failed", async () => {
    storage.failRemoveKey = "nemu.mobile.pending-profile-cleanup";
    await expect(
      removeMobileDataProfileAfterSignOut({
        profileId: "user:account-a",
        clearSandboxData: async () => undefined,
        clearAccountData: async () => undefined,
      }),
    ).rejects.toThrow(MOBILE_LOCAL_DATA_CLEANUP_UNAVAILABLE);
    expect(getMobileDataProfileSnapshot()).toMatchObject({
      retainedProfileId: null,
      pendingCleanupProfileId: "user:account-a",
    });
    expect(storage.values.get("nemu.mobile.pending-profile-cleanup")).toBe(
      "user:account-a",
    );

    storage.failRemoveKey = null;
    let destructiveRetries = 0;
    await completePendingMobileDataProfileCleanup({
      profileId: "user:account-a",
      clearSandboxData: async () => {
        destructiveRetries += 1;
      },
      clearAccountData: async () => {
        destructiveRetries += 1;
      },
    });
    expect(destructiveRetries).toBe(0);
    expect(getMobileDataProfileSnapshot().pendingCleanupProfileId).toBeNull();
  });

  test("does not clear a different retained profile with a stale cleanup task", async () => {
    await markMobileDataProfileCleanupPending("user:account-a");
    await clearMobileDataProfileCleanupPending("user:account-a");
    // Simulate an identity transition only after the old fence was retired.
    await retainMobileDataProfile("user:account-b");
    await expect(
      completePendingMobileDataProfileCleanup({
        profileId: "user:account-a",
        clearSandboxData: async () => undefined,
        clearAccountData: async () => undefined,
      }),
    ).rejects.toThrow(MOBILE_LOCAL_DATA_CLEANUP_UNAVAILABLE);
    expect(getMobileDataProfileSnapshot().retainedProfileId).toBe(
      "user:account-b",
    );
  });
});
