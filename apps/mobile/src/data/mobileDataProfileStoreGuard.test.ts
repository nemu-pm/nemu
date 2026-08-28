import { describe, expect, test } from "bun:test";
import type { MobileDataStore } from "./storeTypes";
import { MOBILE_DATA_PROFILE_CLEANUP_PENDING } from "./mobileDataProfile";
import { createMobileDataProfileGuardedStore } from "./mobileDataProfileStoreGuard";

function fakeStore(overrides: Partial<MobileDataStore>): MobileDataStore {
  return overrides as MobileDataStore;
}

describe("mobile data profile store guard", () => {
  test("rejects account mutations after cleanup is fenced", async () => {
    let saved = false;
    const guarded = createMobileDataProfileGuardedStore(
      fakeStore({
        saveSourceSettings: async () => {
          saved = true;
        },
      }),
      () => true,
    );

    await expect(
      guarded.saveSourceSettings({
        sourceKey: "source",
        values: { token: "secret" },
        updatedAt: 1,
      }),
    ).rejects.toThrow(MOBILE_DATA_PROFILE_CLEANUP_PENDING);
    expect(saved).toBe(false);
  });

  test("allows reads and the cleanup transaction itself while fenced", async () => {
    const calls: string[] = [];
    const guarded = createMobileDataProfileGuardedStore(
      fakeStore({
        getSettings: async () => {
          calls.push("read");
          return { installedSources: [] };
        },
        clearAccountData: async () => {
          calls.push("clear");
        },
      }),
      () => true,
    );

    await expect(guarded.getSettings()).resolves.toEqual({
      installedSources: [],
    });
    await expect(guarded.clearAccountData()).resolves.toBeUndefined();
    expect(calls).toEqual(["read", "clear"]);
  });

  test("lets a mutation that entered before the fence finish ahead of cleanup", async () => {
    let pending = false;
    let releaseSave!: () => void;
    const saveGate = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    const calls: string[] = [];
    let writeQueue: Promise<unknown> = Promise.resolve();
    const enqueueWrite = <T>(operation: () => Promise<T>): Promise<T> => {
      const task = writeQueue.then(operation);
      writeQueue = task.catch(() => undefined);
      return task;
    };
    const guarded = createMobileDataProfileGuardedStore(
      fakeStore({
        saveSourceSettings: () =>
          enqueueWrite(async () => {
            calls.push("save-started");
            await saveGate;
            calls.push("save-finished");
          }),
        clearAccountData: () =>
          enqueueWrite(async () => {
            calls.push("clear");
          }),
      }),
      () => pending,
    );

    const save = guarded.saveSourceSettings({
      sourceKey: "source",
      values: { theme: "dark" },
      updatedAt: 1,
    });
    pending = true;
    const clear = guarded.clearAccountData();
    releaseSave();
    await Promise.all([save, clear]);
    expect(calls).toEqual(["save-started", "save-finished", "clear"]);
  });

  test("preserves stable method identity for hook dependencies", () => {
    const guarded = createMobileDataProfileGuardedStore(
      fakeStore({ getSettings: async () => ({ installedSources: [] }) }),
      () => false,
    );
    expect(guarded.getSettings).toBe(guarded.getSettings);
  });
});
