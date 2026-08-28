import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  addPendingCleanupProfileDatabaseNames,
  clearAllObjectStores,
  clearAndRetireDeviceProfiles,
  getKnownDeviceDatabaseNames,
  getNonProfileDeviceDatabaseNames,
  getProfileDatabaseNames,
} from "./device-data-clear";
import { IndexedDBUserDataStore } from "./indexeddb";
import {
  ProfileWriteFence,
  StaleProfileWriteError,
} from "./profile-write-fence";
import { getSourceSettingsStoreForProfile } from "@/stores/source-settings";
import {
  deletePendingSignOutCleanup,
  persistPendingSignOutCleanup,
} from "@/sync/pending-signout-cleanup";

const storageDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  "localStorage",
);

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
});

describe("device data clear", () => {
  test("includes local, active, cache, plugin, and recovery databases without enumeration", () => {
    const activeStore = new IndexedDBUserDataStore("user:active");
    expect([...getKnownDeviceDatabaseNames(activeStore)].sort()).toEqual([
      "nemu-cache",
      "nemu-plugins",
      "nemu-security-state",
      "nemu-source-settings",
      "nemu-source-settings::user:active",
      "nemu-user",
      "nemu-user::user:active",
    ]);
    expect(
      [...getProfileDatabaseNames([undefined, "user:active"])].sort(),
    ).toEqual([
      "nemu-source-settings",
      "nemu-source-settings::user:active",
      "nemu-user",
      "nemu-user::user:active",
    ]);
    expect(
      [
        ...getNonProfileDeviceDatabaseNames(
          getKnownDeviceDatabaseNames(activeStore),
          [undefined, "user:active"],
        ),
      ].sort(),
    ).toEqual(["nemu-cache", "nemu-plugins", "nemu-security-state"]);
  });

  test("clears every object store and does not create a missing database", async () => {
    const dbName = `device-clear-raw-${Math.random()}`;
    const open = indexedDB.open(dbName, 1);
    open.onupgradeneeded = () => {
      open.result.createObjectStore("first");
      open.result.createObjectStore("second");
    };
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onerror = () => reject(open.error);
      open.onsuccess = () => resolve(open.result);
    });
    const write = db.transaction(["first", "second"], "readwrite");
    write.objectStore("first").put("one", "key");
    write.objectStore("second").put("two", "key");
    await new Promise<void>((resolve, reject) => {
      write.onerror = () => reject(write.error);
      write.oncomplete = () => resolve();
    });
    db.close();

    await clearAllObjectStores(dbName);
    const reopened = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(dbName);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    const read = reopened.transaction(["first", "second"], "readonly");
    const first = read.objectStore("first").count();
    const second = read.objectStore("second").count();
    await new Promise<void>((resolve, reject) => {
      read.onerror = () => reject(read.error);
      read.oncomplete = () => resolve();
    });
    expect(first.result).toBe(0);
    expect(second.result).toBe(0);
    reopened.close();

    const missingName = `device-clear-missing-${Math.random()}`;
    await clearAllObjectStores(missingName);
    const names = (await indexedDB.databases()).map((entry) => entry.name);
    expect(names).not.toContain(missingName);
  });

  test("includes marker-owned profiles when database enumeration is unavailable", async () => {
    const userId = `device-clear-marker-${Math.random()}`;
    const profileId = `user:${userId}`;
    const marker = await persistPendingSignOutCleanup({
      profileId,
      userId,
      keepData: false,
      expectedGeneration: 3,
      remoteConfirmedAt: 3_000,
    });
    const names = getKnownDeviceDatabaseNames();

    try {
      expect(names.has(`nemu-user::${profileId}`)).toBe(false);
      await addPendingCleanupProfileDatabaseNames(names);
      expect(names).toContain(`nemu-user::${profileId}`);
      expect(names).toContain(`nemu-source-settings::${profileId}`);
    } finally {
      await deletePendingSignOutCleanup(marker);
    }
  });

  test("clears complete profile state and retires stale writers", async () => {
    const profileId = `user:device-clear-success-${Math.random()}`;
    const store = new IndexedDBUserDataStore(profileId);
    const staleWriter = new ProfileWriteFence(profileId);
    await store.saveLibraryItem({
      libraryItemId: "library-item",
      metadata: { title: "Library item" },
      inLibrary: true,
      createdAt: 1,
      updatedAt: 1,
    });
    await store.saveInstalledSource({
      id: "registry:source",
      registryId: "registry",
      version: 1,
    });
    await store.saveRegistry({
      id: "private-registry",
      name: "Private registry",
      type: "url",
      url: "https://example.invalid/registry.json",
    });
    const sourceSettings = getSourceSettingsStoreForProfile(profileId);
    sourceSettings.getState().setSetting("aidoku:private", "token", "secret");

    await clearAndRetireDeviceProfiles(
      [store.dbName, `nemu-source-settings::${profileId}`],
      store,
    );

    expect(await store.getAllLibraryItems({ includeRemoved: true })).toEqual(
      [],
    );
    expect(await store.getInstalledSources()).toEqual([]);
    expect(await store.getRegistries()).toEqual([]);
    expect(sourceSettings.getState().values).toEqual(new Map());
    await expect(staleWriter.run(async () => undefined)).rejects.toBeInstanceOf(
      StaleProfileWriteError,
    );
  });

  test("commits a partial retirement and completes a retry with a fresh store lifetime", async () => {
    const profileId = `user:device-clear-partial-${Math.random()}`;
    const store = new IndexedDBUserDataStore(profileId);
    const staleWriter = new ProfileWriteFence(profileId);
    await store.saveRegistry({
      id: "retry-private-registry",
      name: "Retry private registry",
      type: "url",
      url: "https://example.invalid/retry.json",
    });

    const originalClear = IndexedDBUserDataStore.prototype.clearAllLocalData;
    let clearAttempts = 0;
    IndexedDBUserDataStore.prototype.clearAllLocalData = async function (
      signal,
      lease,
    ) {
      clearAttempts += 1;
      if (clearAttempts === 1) {
        throw new Error("injected user database failure");
      }
      return originalClear.call(this, signal, lease);
    };

    try {
      await expect(
        clearAndRetireDeviceProfiles([store.dbName], store),
      ).rejects.toThrow("Some profile data could not be cleared safely.");
      await expect(
        staleWriter.run(async () => undefined),
      ).rejects.toBeInstanceOf(StaleProfileWriteError);

      // The dialog still holds `store` from the failed attempt. Its retry must
      // create a fresh store lifetime rather than reusing that retired object.
      await clearAndRetireDeviceProfiles([store.dbName], store);
      expect(clearAttempts).toBe(2);
      expect(
        await new IndexedDBUserDataStore(profileId).getRegistries(),
      ).toEqual([]);
    } finally {
      IndexedDBUserDataStore.prototype.clearAllLocalData = originalClear;
    }
  });
});
