import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  isDeviceDataProfileId,
  isDeviceProfileCatalogStorageKey,
  listDeviceProfileCatalog,
  registerDeviceProfile,
} from "./device-profile-catalog";

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

describe("device profile catalog", () => {
  test("records exact authenticated profiles without cross-profile overwrites", () => {
    registerDeviceProfile("user:alpha", 0);
    registerDeviceProfile("user:beta", 3);
    registerDeviceProfile("user:alpha", 2);
    registerDeviceProfile("user:alpha", 1);

    expect(listDeviceProfileCatalog()).toEqual([
      { profileId: "user:alpha", epoch: 2 },
      { profileId: "user:beta", epoch: 3 },
    ]);
    expect(
      Array.from({ length: localStorage.length }, (_, index) =>
        localStorage.key(index),
      ).filter(
        (key): key is string =>
          key !== null && isDeviceProfileCatalogStorageKey(key),
      ),
    ).toHaveLength(3);
  });

  test("rejects malformed profile identifiers and fails closed on forged records", () => {
    expect(isDeviceDataProfileId("user:valid")).toBe(true);
    expect(isDeviceDataProfileId("local")).toBe(false);
    expect(isDeviceDataProfileId("user:")).toBe(false);
    expect(isDeviceDataProfileId("user:bad\nprofile")).toBe(false);
    expect(isDeviceDataProfileId(`user:${"x".repeat(600)}`)).toBe(false);

    expect(() => registerDeviceProfile("not-a-user-profile", 0)).toThrow(
      "invalid device profile catalog entry",
    );
    localStorage.setItem(
      "nemu:device-profile-catalog:user%3Aforged",
      JSON.stringify({ version: 1, profileId: "user:different", epoch: 1 }),
    );
    localStorage.setItem(
      "nemu:device-profile-catalog:user%3Abad-epoch",
      JSON.stringify({
        version: 1,
        profileId: "user:bad-epoch",
        epoch: -1,
      }),
    );

    expect(() => listDeviceProfileCatalog()).toThrow(
      "local profile catalog is invalid",
    );
  });

  test("fails closed instead of returning a truncated oversized catalog", () => {
    for (let index = 0; index < 129; index += 1) {
      const profileId = `user:profile-${String(index).padStart(3, "0")}`;
      localStorage.setItem(
        `nemu:device-profile-catalog:${encodeURIComponent(profileId)}:0`,
        JSON.stringify({ version: 1, profileId, epoch: 0 }),
      );
    }
    expect(() => listDeviceProfileCatalog()).toThrow(
      "profile catalog exceeds its supported limit",
    );
  });

  test("fails closed when durable catalog storage cannot be read", () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        ...memoryStorage(),
        get length() {
          throw new DOMException("Storage access denied", "SecurityError");
        },
      },
    });
    expect(() => listDeviceProfileCatalog()).toThrow(
      "Cannot safely enumerate the durable local profile catalog",
    );
  });

  test("verifies registration and never overwrites a corrupt durable entry", () => {
    const backing = memoryStorage();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        ...backing,
        setItem: () => undefined,
      },
    });
    expect(() => registerDeviceProfile("user:no-op", 1)).toThrow(
      "Cannot safely persist the durable local profile catalog",
    );

    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: backing,
    });
    backing.setItem("nemu:device-profile-catalog:user%3Acorrupt", "{not-json");
    expect(() => registerDeviceProfile("user:corrupt", 2)).toThrow(
      "Cannot safely persist the durable local profile catalog",
    );
    expect(backing.getItem("nemu:device-profile-catalog:user%3Acorrupt")).toBe(
      "{not-json",
    );
  });

  test("append-only epochs cannot regress under an adversarial interleaving", () => {
    const backing = memoryStorage();
    const nestedResults: Array<ReturnType<typeof registerDeviceProfile>> = [];
    let interleaved = false;
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        ...backing,
        get length() {
          return backing.length;
        },
        setItem: (key: string, value: string) => {
          backing.setItem(key, value);
          if (!interleaved && key.endsWith(":7")) {
            interleaved = true;
            nestedResults.push(registerDeviceProfile("user:alpha", 9));
          }
        },
      },
    });
    expect(registerDeviceProfile("user:alpha", 7)).toEqual({
      profileId: "user:alpha",
      epoch: 9,
    });
    expect(nestedResults).toEqual([{ profileId: "user:alpha", epoch: 9 }]);
    expect(listDeviceProfileCatalog()).toEqual([
      { profileId: "user:alpha", epoch: 9 },
    ]);
    expect(
      Array.from({ length: backing.length }, (_, index) =>
        backing.key(index),
      ).filter((key) => key?.includes("user%3Aalpha")),
    ).toHaveLength(2);

    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        ...backing,
        getItem: (key: string) =>
          key.includes("regressed")
            ? JSON.stringify({
                version: 1,
                profileId: "user:regressed",
                epoch: 1,
              })
            : backing.getItem(key),
      },
    });
    expect(() => registerDeviceProfile("user:regressed", 3)).toThrow(
      "Cannot safely persist the durable local profile catalog",
    );
  });

  test("requires two matching views after a transient key-index shift", () => {
    registerDeviceProfile("user:alpha", 1);
    const backing = localStorage;
    let keyReads = 0;
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        ...backing,
        get length() {
          return backing.length;
        },
        key: (index: number) => {
          keyReads += 1;
          return keyReads === 1 ? "unrelated-racing-key" : backing.key(index);
        },
      },
    });

    expect(listDeviceProfileCatalog()).toEqual([
      { profileId: "user:alpha", epoch: 1 },
    ]);
    expect(keyReads).toBeGreaterThanOrEqual(3);
  });

  test("retries a shifting key index and fails when the storage view never stabilizes", () => {
    registerDeviceProfile("user:alpha", 1);
    const backing = localStorage;
    let scan = 0;
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        ...backing,
        get length() {
          return backing.length;
        },
        key: (index: number) => {
          if (index === 0) scan += 1;
          return scan % 2 === 0
            ? backing.key(index)
            : index === 0
              ? "unrelated-racing-key"
              : backing.key(index);
        },
      },
    });
    expect(() => listDeviceProfileCatalog()).toThrow(
      "device storage did not stabilize",
    );
  });
});
