import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import type { NativeKVStore } from "./contracts";
import {
  clearMobileDataProfileCleanupPending,
  clearRetainedMobileDataProfile,
  getMobileDataProfileSnapshot,
  loadMobileDataProfile,
  markMobileDataProfileCleanupPending,
  MOBILE_LOCAL_FULL_RESET_PROFILE_ID,
  resetMobileDataProfileForTesting,
  retainMobileDataProfile,
  setMobileDataProfileStorageForTesting,
} from "./mobileDataProfile";
import {
  completePendingMobileDataProfileCleanup,
  MOBILE_LOCAL_DATA_CLEANUP_UNAVAILABLE,
  isMobileDataProfileCleanupPreparedInProcess,
  prepareMobileDataProfileCleanupBeforeSignOut,
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

  test("persists and resumes the exact full-device reset scope", async () => {
    await markMobileDataProfileCleanupPending("user:account-a", "all");
    expect(
      JSON.parse(
        storage.values.get("nemu.mobile.pending-profile-cleanup") ?? "null",
      ),
    ).toEqual({
      version: 1,
      profileId: "user:account-a",
      mode: "all",
      remoteSignOutConfirmed: true,
    });

    await setMobileDataProfileStorageForTesting(storage);
    await expect(loadMobileDataProfile()).resolves.toMatchObject({
      retainedProfileId: "user:account-a",
      pendingCleanupProfileId: "user:account-a",
      pendingCleanupMode: "all",
    });

    const calls: string[] = [];
    await completePendingMobileDataProfileCleanup({
      profileId: "user:account-a",
      clearSandboxData: async () => {
        calls.push("sandbox");
      },
      clearAccountData: async () => {
        calls.push("account");
      },
      clearAllData: async () => {
        calls.push("all");
      },
    });

    expect(calls).toEqual(["sandbox", "all"]);
    expect(getMobileDataProfileSnapshot()).toMatchObject({
      retainedProfileId: null,
      pendingCleanupProfileId: null,
      pendingCleanupMode: null,
    });
  });

  test("fails closed when full-reset recovery lacks its all-data clearer", async () => {
    await markMobileDataProfileCleanupPending("user:account-a", "all");
    let accountClears = 0;

    await expect(
      completePendingMobileDataProfileCleanup({
        profileId: "user:account-a",
        clearSandboxData: async () => undefined,
        clearAccountData: async () => {
          accountClears += 1;
        },
      }),
    ).rejects.toThrow(MOBILE_LOCAL_DATA_CLEANUP_UNAVAILABLE);

    expect(accountClears).toBe(0);
    expect(getMobileDataProfileSnapshot()).toMatchObject({
      retainedProfileId: "user:account-a",
      pendingCleanupProfileId: "user:account-a",
      pendingCleanupMode: "all",
    });
  });

  test("prepares before sign-out and cancels only when sign-out fails", async () => {
    let clearCalls = 0;

    await expect(
      prepareMobileDataProfileCleanupBeforeSignOut({
        profileId: "user:account-a",
        mode: "all",
        signOutAndUnregister: async () => {
          expect(
            isMobileDataProfileCleanupPreparedInProcess("user:account-a"),
          ).toBe(true);
          expect(getMobileDataProfileSnapshot()).toMatchObject({
            pendingCleanupProfileId: "user:account-a",
            pendingCleanupMode: "all",
            pendingCleanupRemoteSignOutConfirmed: false,
          });
          throw new Error("synthetic offline sign-out");
        },
        clearSandboxData: async () => {
          clearCalls += 1;
        },
        clearAccountData: async () => {
          clearCalls += 1;
        },
        clearAllData: async () => {
          clearCalls += 1;
        },
      }),
    ).rejects.toThrow("synthetic offline sign-out");

    expect(clearCalls).toBe(0);
    expect(
      isMobileDataProfileCleanupPreparedInProcess("user:account-a"),
    ).toBe(false);
    expect(getMobileDataProfileSnapshot()).toMatchObject({
      retainedProfileId: "user:account-a",
      pendingCleanupProfileId: null,
      pendingCleanupMode: null,
      pendingCleanupRemoteSignOutConfirmed: null,
    });
  });

  test("retains a confirmed marker when post-sign-out clearing fails", async () => {
    await expect(
      prepareMobileDataProfileCleanupBeforeSignOut({
        profileId: "user:account-a",
        mode: "all",
        signOutAndUnregister: async (onConfirmed) => onConfirmed(),
        clearSandboxData: async () => undefined,
        clearAccountData: async () => undefined,
        clearAllData: async () => {
          throw new Error("synthetic clear failure");
        },
      }),
    ).rejects.toThrow(MOBILE_LOCAL_DATA_CLEANUP_UNAVAILABLE);

    expect(getMobileDataProfileSnapshot()).toMatchObject({
      retainedProfileId: "user:account-a",
      pendingCleanupProfileId: "user:account-a",
      pendingCleanupMode: "all",
      pendingCleanupRemoteSignOutConfirmed: true,
    });
  });

  test("releases volatile ownership when the confirmation checkpoint fails", async () => {
    await expect(
      prepareMobileDataProfileCleanupBeforeSignOut({
        profileId: "user:account-a",
        mode: "all",
        signOutAndUnregister: async (onConfirmed) => {
          storage.failSetKey = "nemu.mobile.pending-profile-cleanup";
          await onConfirmed();
        },
        clearSandboxData: async () => undefined,
        clearAccountData: async () => undefined,
        clearAllData: async () => undefined,
      }),
    ).rejects.toThrow("injected secure write failure");

    expect(getMobileDataProfileSnapshot()).toMatchObject({
      retainedProfileId: "user:account-a",
      pendingCleanupProfileId: "user:account-a",
      pendingCleanupMode: "all",
      pendingCleanupRemoteSignOutConfirmed: false,
      pendingCleanupLocallyOwned: false,
    });
  });

  test("journals and completes a signed-out local full reset", async () => {
    await clearRetainedMobileDataProfile("user:account-a");
    const calls: string[] = [];

    await removeMobileDataProfileAfterSignOut({
      profileId: MOBILE_LOCAL_FULL_RESET_PROFILE_ID,
      mode: "all",
      clearSandboxData: async (scope) => {
        calls.push(`sandbox:${scope}`);
      },
      clearAccountData: async () => {
        calls.push("account");
      },
      clearAllData: async () => {
        expect(getMobileDataProfileSnapshot()).toMatchObject({
          retainedProfileId: null,
          pendingCleanupProfileId: MOBILE_LOCAL_FULL_RESET_PROFILE_ID,
          pendingCleanupMode: "all",
        });
        calls.push("all");
      },
    });

    expect(calls).toEqual(["sandbox:local", "all"]);
    expect(getMobileDataProfileSnapshot()).toMatchObject({
      retainedProfileId: null,
      pendingCleanupProfileId: null,
      pendingCleanupMode: null,
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
