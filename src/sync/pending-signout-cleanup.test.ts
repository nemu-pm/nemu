import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  advancePendingSignOutCleanupToSourceSettings,
  deletePendingSignOutCleanup,
  listPendingSignOutCleanups,
  persistPendingSignOutCleanup,
} from "./pending-signout-cleanup";
import { ProfileWriteFence } from "@/data/profile-write-fence";

const storageDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  "localStorage",
);
const cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");

function createFallibleStorage(): Storage & { failWrites: boolean } {
  const values = new Map<string, string>();
  return {
    failWrites: false,
    get length() {
      return values.size;
    },
    clear() {
      if (this.failWrites) throw new Error("localStorage write failed");
      values.clear();
    },
    getItem(key) {
      return values.get(key) ?? null;
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key) {
      if (this.failWrites) throw new Error("localStorage write failed");
      values.delete(key);
    },
    setItem(key, value) {
      if (this.failWrites) throw new Error("localStorage write failed");
      values.set(key, String(value));
    },
  };
}

let storage: ReturnType<typeof createFallibleStorage>;
let originalNow: typeof Date.now;

function deleteSecurityStateDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase("nemu-security-state");
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error("Cleanup marker database deletion was blocked."));
    request.onsuccess = () => resolve();
  });
}

beforeEach(() => {
  storage = createFallibleStorage();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
  originalNow = Date.now;
});

afterEach(async () => {
  Date.now = originalNow;
  await deleteSecurityStateDatabase();
  if (storageDescriptor) {
    Object.defineProperty(globalThis, "localStorage", storageDescriptor);
  } else {
    Reflect.deleteProperty(globalThis, "localStorage");
  }
  if (cryptoDescriptor) {
    Object.defineProperty(globalThis, "crypto", cryptoDescriptor);
  } else {
    Reflect.deleteProperty(globalThis, "crypto");
  }
});

describe("pending sign-out cleanup markers", () => {
  test("fails closed when a durable operation id cannot use secure randomness", async () => {
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: undefined,
    });
    await expect(
      persistPendingSignOutCleanup({
        profileId: "user:no-secure-randomness",
        userId: "no-secure-randomness",
        keepData: false,
        expectedGeneration: null,
        remoteConfirmedAt: 999,
      }),
    ).rejects.toThrow("secure randomness is unavailable");
    expect(await listPendingSignOutCleanups()).toEqual([]);
  });

  test("a completion tombstone suppresses a stale backend copy", async () => {
    const userId = `marker-stale-${Math.random()}`;
    const marker = await persistPendingSignOutCleanup({
      profileId: `user:${userId}`,
      userId,
      keepData: false,
      expectedGeneration: 4,
      remoteConfirmedAt: 1_000,
    });

    // IndexedDB records completion while localStorage retains its pending copy.
    storage.failWrites = true;
    await deletePendingSignOutCleanup(marker);

    expect(await listPendingSignOutCleanups()).not.toContainEqual(
      expect.objectContaining({ profileId: marker.profileId }),
    );
  });

  test("a local completion tombstone suppresses stale IndexedDB state", async () => {
    const userId = `marker-stale-idb-${Math.random()}`;
    const marker = await persistPendingSignOutCleanup({
      profileId: `user:${userId}`,
      userId,
      keepData: false,
      expectedGeneration: 4,
      remoteConfirmedAt: 1_001,
    });
    const indexedDbDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "indexedDB",
    );
    const realIndexedDb = indexedDB;

    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      value: {
        open() {
          throw new Error("IndexedDB write failed");
        },
      },
    });
    await deletePendingSignOutCleanup(marker);
    if (indexedDbDescriptor) {
      Object.defineProperty(globalThis, "indexedDB", indexedDbDescriptor);
    } else {
      Object.defineProperty(globalThis, "indexedDB", {
        configurable: true,
        value: realIndexedDb,
      });
    }

    expect(await listPendingSignOutCleanups()).not.toContainEqual(
      expect.objectContaining({ profileId: marker.profileId }),
    );
  });

  test("logical ordering preserves a later sign-out after wall-clock rollback", async () => {
    const userId = `marker-clock-${Math.random()}`;
    Date.now = () => 10_000;
    const first = await persistPendingSignOutCleanup({
      profileId: `user:${userId}`,
      userId,
      keepData: false,
      expectedGeneration: 2,
      remoteConfirmedAt: Date.now(),
    });

    // Leave the first pending marker stale in localStorage and its completion
    // in IndexedDB, then move the device clock backwards before the next
    // explicit remote-confirmed sign-out.
    storage.failWrites = true;
    await deletePendingSignOutCleanup(first);
    Date.now = () => 100;
    const second = await persistPendingSignOutCleanup({
      profileId: first.profileId,
      userId,
      keepData: true,
      expectedGeneration: 3,
      remoteConfirmedAt: Date.now(),
    });

    expect(second.profileSequence).toBe(first.profileSequence + 1);
    expect(second.remoteConfirmedAt).toBeLessThan(first.remoteConfirmedAt);
    expect(
      (await listPendingSignOutCleanups()).filter(
        (entry) => entry.profileId === second.profileId,
      ),
    ).toEqual([second]);
  });

  test("prefers a durable source-only phase over another backend's stale phase", async () => {
    const userId = `marker-stage-${Math.random()}`;
    const marker = await persistPendingSignOutCleanup({
      profileId: `user:${userId}`,
      userId,
      keepData: true,
      expectedGeneration: 8,
      remoteConfirmedAt: 800,
    });

    storage.failWrites = true;
    const advanced = await advancePendingSignOutCleanupToSourceSettings(marker);

    expect(
      (await listPendingSignOutCleanups()).filter(
        (entry) => entry.profileId === advanced.profileId,
      ),
    ).toEqual([advanced]);
    expect(advanced).toMatchObject({
      cleanupStage: 1,
      expectedGeneration: null,
    });
  });

  test("advances under an existing profile lease without nesting the lock", async () => {
    const userId = `marker-stage-lease-${Math.random()}`;
    const profileId = `user:${userId}`;
    const marker = await persistPendingSignOutCleanup({
      profileId,
      userId,
      keepData: false,
      expectedGeneration: 9,
      remoteConfirmedAt: 900,
    });

    const advanced = await new ProfileWriteFence(profileId).retire((lease) =>
      advancePendingSignOutCleanupToSourceSettings(marker, lease),
    );

    expect(advanced).toMatchObject({
      cleanupStage: 1,
      expectedGeneration: null,
    });
    expect(
      (await listPendingSignOutCleanups()).filter(
        (entry) => entry.profileId === profileId,
      ),
    ).toEqual([advanced]);
  });

  test("concurrent allocations receive distinct monotonic profile sequences", async () => {
    const userId = `marker-concurrent-${Math.random()}`;
    const input = {
      profileId: `user:${userId}`,
      userId,
      keepData: false,
      expectedGeneration: null,
      remoteConfirmedAt: 500,
    } as const;

    const [first, second] = await Promise.all([
      persistPendingSignOutCleanup(input),
      persistPendingSignOutCleanup(input),
    ]);

    expect(new Set([first.profileSequence, second.profileSequence])).toEqual(
      new Set([1, 2]),
    );
    expect(
      (await listPendingSignOutCleanups()).find(
        (entry) => entry.profileId === input.profileId,
      )?.profileSequence,
    ).toBe(2);
  });

  test("completion is idempotent when a retry replays the same marker", async () => {
    const userId = `marker-replayed-${Math.random()}`;
    const marker = await persistPendingSignOutCleanup({
      profileId: `user:${userId}`,
      userId,
      keepData: false,
      expectedGeneration: null,
      remoteConfirmedAt: 501,
    });

    await deletePendingSignOutCleanup(marker);
    await deletePendingSignOutCleanup(marker);

    expect(await listPendingSignOutCleanups()).not.toContainEqual(
      expect.objectContaining({ profileId: marker.profileId }),
    );
  });

  test("never recovers malformed or pre-v2 deletion records", async () => {
    localStorage.setItem(
      "nemu:pending-signout-cleanups",
      JSON.stringify([
        {
          version: 1,
          profileId: "user:legacy",
          userId: "legacy",
          keepData: false,
          remoteConfirmedAt: 1,
        },
        {
          version: 2,
          status: "pending",
          operationId: "mismatched-profile",
          profileSequence: 1,
          profileId: "user:someone-else",
          userId: "target",
          keepData: false,
          cleanupStage: 0,
          expectedGeneration: null,
          remoteConfirmedAt: 1,
        },
        {
          version: 2,
          status: "pending",
          operationId: "invalid-source-phase",
          profileSequence: 1,
          profileId: "user:source-phase",
          userId: "source-phase",
          keepData: false,
          cleanupStage: 1,
          expectedGeneration: 2,
          remoteConfirmedAt: 1,
        },
      ]),
    );

    const recoveredProfiles = (await listPendingSignOutCleanups()).map(
      (marker) => marker.profileId,
    );
    expect(recoveredProfiles).not.toContain("user:legacy");
    expect(recoveredProfiles).not.toContain("user:someone-else");
    expect(recoveredProfiles).not.toContain("user:source-phase");
  });
});
