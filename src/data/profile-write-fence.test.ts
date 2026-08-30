import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  clearLocalStoragePreservingProfileWriteFences,
  DeviceDataWipePendingError,
  isProfileWriteFenceStorageKey,
  ProfileWriteFence,
  ProfileWriteFenceUnavailableError,
  StaleProfileWriteError,
} from "./profile-write-fence";
import { listDeviceProfileCatalog } from "./device-profile-catalog";
import {
  deleteDeviceProfileWipeGuard,
  persistDeviceProfileWipeGuard,
} from "./device-profile-wipe-guard";

const storageDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  "localStorage",
);
const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, String(value));
    },
  };
}

beforeEach(() => {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: memoryStorage(),
  });
});

afterEach(() => {
  if (storageDescriptor) {
    Object.defineProperty(globalThis, "localStorage", storageDescriptor);
  } else {
    Reflect.deleteProperty(globalThis, "localStorage");
  }
  if (windowDescriptor) {
    Object.defineProperty(globalThis, "window", windowDescriptor);
  } else {
    Reflect.deleteProperty(globalThis, "window");
  }
});

describe("ProfileWriteFence", () => {
  test("rejects corrupt or unreadable durable epochs instead of treating them as zero", async () => {
    const corruptProfile = `user:fence-corrupt-${Math.random()}`;
    localStorage.setItem(
      `nemu:profile-write-epoch:${encodeURIComponent(corruptProfile)}`,
      "not-an-epoch",
    );
    expect(() => new ProfileWriteFence(corruptProfile)).toThrow(
      ProfileWriteFenceUnavailableError,
    );

    const deniedProfile = `user:fence-denied-${Math.random()}`;
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        ...memoryStorage(),
        getItem: () => {
          throw new DOMException("Storage access denied", "SecurityError");
        },
      },
    });
    expect(() => new ProfileWriteFence(deniedProfile)).toThrow(
      "Cannot safely read the durable profile write barrier",
    );
  });

  test("a durable read failure after construction blocks the write callback", async () => {
    const profileId = `user:fence-read-failure-${Math.random()}`;
    const fence = new ProfileWriteFence(profileId);
    const backing = localStorage;
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        ...backing,
        getItem: () => {
          throw new DOMException("Storage access denied", "SecurityError");
        },
      },
    });
    let called = false;
    await expect(
      fence.run(async () => {
        called = true;
      }),
    ).rejects.toBeInstanceOf(ProfileWriteFenceUnavailableError);
    expect(called).toBe(false);
  });

  test("retirement refuses to start when its durable intent cannot be written", async () => {
    const profileId = `user:fence-intent-failure-${Math.random()}`;
    const fence = new ProfileWriteFence(profileId);
    const backing = localStorage;
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        ...backing,
        get length() {
          return backing.length;
        },
        setItem: (key: string, value: string) => {
          if (key.startsWith("nemu:profile-write-retirement-intent:")) {
            throw new DOMException(
              "Storage quota denied",
              "QuotaExceededError",
            );
          }
          backing.setItem(key, value);
        },
      },
    });
    let called = false;
    await expect(
      fence.retire(async () => {
        called = true;
      }),
    ).rejects.toThrow("retirement barrier could not be persisted");
    expect(called).toBe(false);
  });

  test("a durable intent remains the barrier when epoch compaction fails", async () => {
    const profileId = `user:fence-epoch-failure-${Math.random()}`;
    const staleLifetime = new ProfileWriteFence(profileId);
    const storage = localStorage;
    const setItem = storage.setItem.bind(storage);
    storage.setItem = (key, value) => {
      if (
        key === `nemu:profile-write-epoch:${encodeURIComponent(profileId)}` &&
        String(value) === "1"
      ) {
        throw new Error("epoch compaction unavailable");
      }
      setItem(key, value);
    };

    await new ProfileWriteFence(profileId).retire(async () => undefined);

    await expect(
      staleLifetime.run(async () => undefined),
    ).rejects.toBeInstanceOf(StaleProfileWriteError);
    const adoptedLifetime = new ProfileWriteFence(profileId);
    await expect(adoptedLifetime.run(async () => "fresh")).resolves.toBe(
      "fresh",
    );
    expect(
      Array.from({ length: localStorage.length }, (_, index) =>
        localStorage.key(index),
      ).some((key) => key?.startsWith("nemu:profile-write-retirement-intent:")),
    ).toBe(true);

    // A later retirement may supersede the already-adopted intent instead of
    // becoming permanently blocked by a failed compaction from the prior one.
    storage.setItem = setItem;
    await adoptedLifetime.retire(async () => undefined);
    await expect(
      new ProfileWriteFence(profileId).run(async () => "next-lifetime"),
    ).resolves.toBe("next-lifetime");
  });

  test("observing a pending intent commits the adopted lifetime monotonically", async () => {
    const profileId = `user:fence-observed-intent-${Math.random()}`;
    const encodedProfile = encodeURIComponent(profileId);
    localStorage.setItem(
      `nemu:profile-write-retirement-intent:${encodedProfile}`,
      "1",
    );

    const adopted = new ProfileWriteFence(profileId);

    expect(adopted.epoch).toBe(1);
    expect(
      localStorage.getItem(`nemu:profile-write-epoch:${encodedProfile}`),
    ).toBe("1");
    await expect(adopted.run(async () => "adopted")).resolves.toBe("adopted");
  });

  test("a failed retirement cannot roll back an intent another realm observed", async () => {
    const profileId = `user:fence-observed-failure-${Math.random()}`;
    const encodedProfile = encodeURIComponent(profileId);
    const staleLifetime = new ProfileWriteFence(profileId);
    const backing = localStorage;
    const intentKey = `nemu:profile-write-retirement-intent:${encodedProfile}`;
    const epochKey = `nemu:profile-write-epoch:${encodedProfile}`;
    const observationKey = `nemu:profile-write-retirement-observed:${encodedProfile}:1`;
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        ...backing,
        get length() {
          return backing.length;
        },
        getItem: (key: string) => {
          const value = backing.getItem(key);
          if (key === intentKey && value === "1") {
            // Simulate another realm durably adopting the pending intent while
            // the retirement callback is still in progress.
            backing.setItem(observationKey, "1");
          }
          return value;
        },
        setItem: (key: string, value: string) => {
          if (key === epochKey && value === "1") {
            throw new Error("epoch compaction unavailable");
          }
          backing.setItem(key, value);
        },
      },
    });

    await expect(
      new ProfileWriteFence(profileId).retire(async () => {
        throw new Error("clear failed");
      }),
    ).rejects.toThrow("clear failed");

    expect(backing.getItem(intentKey)).toBe("1");
    await expect(
      staleLifetime.run(async () => undefined),
    ).rejects.toBeInstanceOf(StaleProfileWriteError);
    await expect(
      new ProfileWriteFence(profileId).run(async () => "observed-lifetime"),
    ).resolves.toBe("observed-lifetime");
  });

  test("an append-only observation remains a barrier after the intent disappears", async () => {
    const profileId = `user:fence-orphaned-observation-${Math.random()}`;
    const encodedProfile = encodeURIComponent(profileId);
    localStorage.setItem(
      `nemu:profile-write-retirement-observed:${encodedProfile}:3`,
      "3",
    );
    localStorage.setItem(
      `nemu:profile-write-retirement-observations-present:${encodedProfile}`,
      "1",
    );

    const adopted = new ProfileWriteFence(profileId);

    expect(adopted.epoch).toBe(3);
    await expect(adopted.run(async () => "durable")).resolves.toBe("durable");
  });

  test("upgrades an existing write lease to retirement without deadlock", async () => {
    const profileId = `user:fence-upgrade-${Math.random()}`;
    const staleLifetime = new ProfileWriteFence(profileId);
    const clearingLifetime = new ProfileWriteFence(profileId);
    const calls: string[] = [];

    await clearingLifetime.run((lease) =>
      clearingLifetime.retire(async (retirementLease) => {
        expect(retirementLease).toBe(lease);
        calls.push("retired");
      }, lease),
    );

    expect(calls).toEqual(["retired"]);
    await expect(
      staleLifetime.run(async () => undefined),
    ).rejects.toBeInstanceOf(StaleProfileWriteError);
  });

  test("blocks ordinary writers while the exact device-wipe guard owns a profile", async () => {
    const profileId = `user:fence-device-wipe-${Math.random()}`;
    const ordinaryWriter = new ProfileWriteFence(profileId);
    const guard = persistDeviceProfileWipeGuard({
      operationId: "wipe-operation",
      profileId,
      expectedEpoch: ordinaryWriter.epoch,
    });
    let ordinaryCalled = false;

    await expect(
      ordinaryWriter.run(async () => {
        ordinaryCalled = true;
      }),
    ).rejects.toBeInstanceOf(DeviceDataWipePendingError);
    expect(ordinaryCalled).toBe(false);

    let clearCount = 0;
    await new ProfileWriteFence(profileId).runDeviceDataWipe(
      guard,
      async () => {
        clearCount += 1;
      },
    );
    expect(new ProfileWriteFence(profileId).epoch).toBe(guard.targetEpoch);

    // Replaying after a crash at the journal-checkpoint boundary is safe and
    // does not keep advancing the profile lifetime.
    await new ProfileWriteFence(profileId).runDeviceDataWipe(
      guard,
      async () => {
        clearCount += 1;
      },
    );
    expect(clearCount).toBe(2);
    expect(new ProfileWriteFence(profileId).epoch).toBe(guard.targetEpoch);
    await expect(
      new ProfileWriteFence(profileId).run(async () => "blocked"),
    ).rejects.toBeInstanceOf(DeviceDataWipePendingError);

    deleteDeviceProfileWipeGuard(guard);
    await expect(
      new ProfileWriteFence(profileId).run(async () => "fresh"),
    ).resolves.toBe("fresh");
  });

  test("keeps opaque isolated-store scopes outside the device-wipe namespace", async () => {
    const fence = new ProfileWriteFence(`test:isolated:${Math.random()}`);
    await expect(fence.run(async () => "written")).resolves.toBe("written");
  });

  test("a lease cannot be reused after its serialized callback returns", async () => {
    const profileId = `user:fence-leaked-lease-${Math.random()}`;
    const fence = new ProfileWriteFence(profileId);
    const leases: Parameters<typeof fence.run>[1][] = [];
    await fence.run(async (lease) => {
      leases.push(lease);
    });

    let called = false;
    await expect(
      fence.run(async () => {
        called = true;
      }, leases[0]),
    ).rejects.toBeInstanceOf(StaleProfileWriteError);
    expect(called).toBe(false);
  });

  test("a committed retirement appends the catalog's future epoch", async () => {
    const profileId = `user:fence-catalog-${Math.random()}`;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { localStorage },
    });

    await new ProfileWriteFence(profileId).retire(async () => undefined);

    expect(listDeviceProfileCatalog()).toEqual([{ profileId, epoch: 1 }]);
  });

  test("device storage cleanup preserves retirement epochs", async () => {
    const profileId = `user:fence-clear-${Math.random()}`;
    const staleLifetime = new ProfileWriteFence(profileId);
    localStorage.setItem("ordinary-app-state", "remove me");

    await new ProfileWriteFence(profileId).retire(async () => undefined);
    const epochKey = Array.from({ length: localStorage.length }, (_, index) =>
      localStorage.key(index),
    ).find(
      (key): key is string =>
        key !== null && isProfileWriteFenceStorageKey(key),
    );
    expect(epochKey).toBeDefined();

    clearLocalStoragePreservingProfileWriteFences();

    expect(localStorage.getItem("ordinary-app-state")).toBeNull();
    expect(localStorage.getItem(epochKey!)).toBe("1");
    await expect(
      staleLifetime.run(async () => undefined),
    ).rejects.toBeInstanceOf(StaleProfileWriteError);
    await expect(
      new ProfileWriteFence(profileId).run(async () => "fresh"),
    ).resolves.toBe("fresh");
  });
});
