import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { IndexedDBUserDataStore } from "./indexeddb";
import { ProfileWriteFence } from "./profile-write-fence";
import {
  recoverPendingDeviceDataWipe,
  startDeviceDataWipe,
} from "./device-data-wipe";
import { readPendingDeviceDataWipe } from "./device-data-wipe-journal";
import { getSourceSettingsStoreForProfile } from "@/stores/source-settings";

const localStorageDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  "localStorage",
);
const sessionStorageDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  "sessionStorage",
);
const documentDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  "document",
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
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, String(value)),
  };
}

let cookies: Map<string, string>;

beforeEach(() => {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: memoryStorage(),
  });
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: memoryStorage(),
  });
  // The fence module deliberately retains same-realm lifetimes. Mirror that
  // durable browser state when this test replaces localStorage between cases.
  const localEpoch = new ProfileWriteFence().epoch;
  localStorage.setItem("nemu:profile-write-epoch:local", String(localEpoch));
  cookies = new Map([
    ["sidebar_state", "expanded"],
    ["unrelated_cookie", "preserve"],
  ]);
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      get cookie() {
        return [...cookies]
          .map(([name, value]) => `${name}=${value}`)
          .join("; ");
      },
      set cookie(raw: string) {
        const [pair, ...attributes] = raw.split(";");
        const separator = pair?.indexOf("=") ?? -1;
        if (!pair || separator < 0) return;
        const name = pair.slice(0, separator);
        const value = pair.slice(separator + 1);
        if (
          attributes.some((attribute) =>
            /^\s*max-age=0\s*$/i.test(attribute),
          )
        ) {
          cookies.delete(name);
        } else {
          cookies.set(name, value);
        }
      },
    },
  });
});

afterEach(() => {
  if (localStorageDescriptor) {
    Object.defineProperty(
      globalThis,
      "localStorage",
      localStorageDescriptor,
    );
  } else {
    Reflect.deleteProperty(globalThis, "localStorage");
  }
  if (sessionStorageDescriptor) {
    Object.defineProperty(
      globalThis,
      "sessionStorage",
      sessionStorageDescriptor,
    );
  } else {
    Reflect.deleteProperty(globalThis, "sessionStorage");
  }
  if (documentDescriptor) {
    Object.defineProperty(globalThis, "document", documentDescriptor);
  } else {
    Reflect.deleteProperty(globalThis, "document");
  }
});

async function createDatabase(
  name: string,
  storeName: string,
  value: string,
): Promise<void> {
  const request = indexedDB.open(name, 1);
  request.onupgradeneeded = () => request.result.createObjectStore(storeName);
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
  const transaction = database.transaction(storeName, "readwrite");
  transaction.objectStore(storeName).put(value, "key");
  await new Promise<void>((resolve, reject) => {
    transaction.onerror = () => reject(transaction.error);
    transaction.oncomplete = () => resolve();
  });
  database.close();
}

async function readDatabaseValue(
  name: string,
  storeName: string,
): Promise<string | undefined> {
  const request = indexedDB.open(name);
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
  const transaction = database.transaction(storeName, "readonly");
  const read = transaction.objectStore(storeName).get("key");
  await new Promise<void>((resolve, reject) => {
    transaction.onerror = () => reject(transaction.error);
    transaction.oncomplete = () => resolve();
  });
  database.close();
  return read.result as string | undefined;
}

describe("device-data wipe orchestration", () => {
  test("clears synthetic Nemu state while preserving unrelated origin data", async () => {
    const localStore = new IndexedDBUserDataStore();
    await localStore.saveRegistry({
      id: "synthetic-private-registry",
      name: "Synthetic private registry",
      type: "url",
      url: "https://example.invalid/private.json",
    });
    getSourceSettingsStoreForProfile()
      .getState()
      .setSetting("aidoku:synthetic", "token", "synthetic-secret");
    await createDatabase("nemu-plugins", "settings", "nemu-owned");
    const unrelatedDb = `unrelated-origin-${Math.random()}`;
    await createDatabase(unrelatedDb, "records", "preserve");
    localStorage.setItem("nemu:language", "ja");
    localStorage.setItem("unrelated-state", "preserve");
    sessionStorage.setItem("nemu:scroll:/settings", "128");
    sessionStorage.setItem("unrelated-session", "preserve");

    await expect(startDeviceDataWipe({ activeStore: localStore })).resolves.toMatchObject({
      status: "completed",
    });

    expect(await localStore.getRegistries()).toEqual([]);
    expect(getSourceSettingsStoreForProfile().getState().values).toEqual(
      new Map(),
    );
    expect(localStorage.getItem("nemu:language")).toBeNull();
    expect(localStorage.getItem("unrelated-state")).toBe("preserve");
    expect(sessionStorage.getItem("nemu:scroll:/settings")).toBeNull();
    expect(sessionStorage.getItem("unrelated-session")).toBe("preserve");
    expect(cookies.get("sidebar_state")).toBeUndefined();
    expect(cookies.get("unrelated_cookie")).toBe("preserve");
    expect(await readDatabaseValue(unrelatedDb, "records")).toBe("preserve");
    expect(readPendingDeviceDataWipe()).toBeNull();
  }, 30_000);

  test("recovers a remote-confirmed partial wipe after a synthetic failure", async () => {
    const profileId = `user:wipe-recovery-${Math.random()}`;
    const store = new IndexedDBUserDataStore(profileId);
    await store.saveRegistry({
      id: "recovery-registry",
      name: "Recovery registry",
      type: "url",
      url: "https://example.invalid/recovery.json",
    });
    const originalClear = IndexedDBUserDataStore.prototype.clearAllLocalData;
    let failOnce = true;
    IndexedDBUserDataStore.prototype.clearAllLocalData = async function (
      signal,
      lease,
    ) {
      if (failOnce) {
        failOnce = false;
        throw new Error("synthetic interruption");
      }
      return originalClear.call(this, signal, lease);
    };
    let remoteSignOutCalls = 0;

    try {
      await expect(
        startDeviceDataWipe({
          activeStore: store,
          initiatingProfileId: profileId,
          confirmRemoteSignOut: async () => {
            remoteSignOutCalls += 1;
          },
        }),
      ).rejects.toThrow("Failed to clear all data");
      expect(readPendingDeviceDataWipe()?.remoteSignOutConfirmed).toBe(true);

      const recovery = await recoverPendingDeviceDataWipe();
      expect(recovery).toMatchObject({ status: "completed" });
      expect(remoteSignOutCalls).toBe(1);
      expect(await new IndexedDBUserDataStore(profileId).getRegistries()).toEqual(
        [],
      );
      expect(readPendingDeviceDataWipe()).toBeNull();
    } finally {
      IndexedDBUserDataStore.prototype.clearAllLocalData = originalClear;
    }
  }, 30_000);

  test("a newer authenticated session supersedes pending crash recovery", async () => {
    const profileId = `user:wipe-superseded-${Math.random()}`;
    const store = new IndexedDBUserDataStore(profileId);
    await store.saveRegistry({
      id: "preserved-new-session-registry",
      name: "Preserved registry",
      type: "url",
      url: "https://example.invalid/preserved.json",
    });
    const originalClear = IndexedDBUserDataStore.prototype.clearAllLocalData;
    IndexedDBUserDataStore.prototype.clearAllLocalData = async () => {
      throw new Error("synthetic crash boundary");
    };

    try {
      await expect(
        startDeviceDataWipe({
          activeStore: store,
          initiatingProfileId: profileId,
          confirmRemoteSignOut: async () => {},
        }),
      ).rejects.toThrow("Failed to clear all data");

      await expect(
        recoverPendingDeviceDataWipe(profileId),
      ).resolves.toMatchObject({ status: "superseded" });
      expect(readPendingDeviceDataWipe()).toBeNull();
      expect(
        await new IndexedDBUserDataStore(profileId).getRegistries(),
      ).toHaveLength(1);
      await expect(
        new IndexedDBUserDataStore(profileId).saveRegistry({
          id: "new-session-write",
          name: "New session write",
          type: "url",
          url: "https://example.invalid/new-session.json",
        }),
      ).resolves.toBeUndefined();
    } finally {
      IndexedDBUserDataStore.prototype.clearAllLocalData = originalClear;
    }
  }, 30_000);
});
