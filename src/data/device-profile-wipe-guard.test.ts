import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  deleteDeviceProfileWipeGuard,
  isDeviceProfileWipeGuard,
  isDeviceProfileWipeGuardStorageKey,
  persistDeviceProfileWipeGuard,
  readDeviceProfileWipeGuard,
} from "./device-profile-wipe-guard";

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

describe("device profile wipe guard", () => {
  test("persists one operation-bound expected/target epoch", () => {
    const guard = persistDeviceProfileWipeGuard({
      operationId: "wipe-operation",
      profileId: "user:alpha",
      expectedEpoch: 7,
    });
    expect(guard).toEqual({
      version: 1,
      operationId: "wipe-operation",
      profileId: "user:alpha",
      expectedEpoch: 7,
      targetEpoch: 8,
    });
    expect(readDeviceProfileWipeGuard("user:alpha")).toEqual(guard);
    expect(
      Array.from({ length: localStorage.length }, (_, index) =>
        localStorage.key(index),
      ).some((key) => (key ? isDeviceProfileWipeGuardStorageKey(key) : false)),
    ).toBe(true);
  });

  test("rejects malformed epochs, profiles, and conflicting operations", () => {
    expect(
      isDeviceProfileWipeGuard({
        version: 1,
        operationId: "operation",
        profileId: "user:alpha",
        expectedEpoch: 3,
        targetEpoch: 5,
      }),
    ).toBe(false);
    expect(() =>
      persistDeviceProfileWipeGuard({
        operationId: "operation",
        profileId: "foreign:alpha",
        expectedEpoch: 0,
      }),
    ).toThrow("invalid profile wipe guard");

    persistDeviceProfileWipeGuard({
      operationId: "first",
      profileId: "user:alpha",
      expectedEpoch: 1,
    });
    expect(() =>
      persistDeviceProfileWipeGuard({
        operationId: "second",
        profileId: "user:alpha",
        expectedEpoch: 1,
      }),
    ).toThrow("device-wipe guard could not be persisted");
  });

  test("append-only claims expose an adversarial concurrent owner", () => {
    const backing = memoryStorage();
    let nestedGuard: ReturnType<typeof persistDeviceProfileWipeGuard> | null =
      null;
    let interleaved = false;
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        ...backing,
        get length() {
          return backing.length;
        },
        setItem: (key: string, value: string) => {
          if (!interleaved && value.includes('"operationId":"outer"')) {
            interleaved = true;
            nestedGuard = persistDeviceProfileWipeGuard({
              operationId: "inner",
              profileId: "user:alpha",
              expectedEpoch: 4,
            });
          }
          backing.setItem(key, value);
        },
      },
    });

    expect(() =>
      persistDeviceProfileWipeGuard({
        operationId: "outer",
        profileId: "user:alpha",
        expectedEpoch: 4,
      }),
    ).toThrow("device-wipe guard could not be persisted");
    expect(nestedGuard).toMatchObject({ operationId: "inner" });
    expect(() => readDeviceProfileWipeGuard("user:alpha")).toThrow(
      "Multiple device-data wipe operations claim the same profile",
    );
    expect(
      Array.from({ length: backing.length }, (_, index) =>
        backing.key(index),
      ).filter((key) => key?.startsWith("nemu:device-profile-wipe-guard:")),
    ).toHaveLength(2);
  });

  test("deletes only the exact durable guard", () => {
    const guard = persistDeviceProfileWipeGuard({
      operationId: "exact",
      expectedEpoch: 0,
    });
    expect(() =>
      deleteDeviceProfileWipeGuard({ ...guard, operationId: "stale" }),
    ).toThrow("changed before completion");
    deleteDeviceProfileWipeGuard(guard);
    expect(readDeviceProfileWipeGuard()).toBeNull();
  });

  test("fails closed on a corrupt or unreadable durable guard", () => {
    const key = "nemu:device-profile-wipe-guard:user%3Aalpha";
    localStorage.setItem(key, "{not-json");
    expect(() => readDeviceProfileWipeGuard("user:alpha")).toThrow(
      "durable profile wipe guard is invalid",
    );
    expect(() =>
      persistDeviceProfileWipeGuard({
        operationId: "must-not-replace-corruption",
        profileId: "user:alpha",
        expectedEpoch: 1,
      }),
    ).toThrow("device-wipe guard could not be persisted");
    expect(localStorage.getItem(key)).toBe("{not-json");

    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        ...memoryStorage(),
        get length() {
          throw new DOMException("Storage access denied", "SecurityError");
        },
      },
    });
    expect(() => readDeviceProfileWipeGuard("user:alpha")).toThrow(
      "Cannot safely read the durable profile wipe guard",
    );
  });

  test("verifies writes instead of treating a no-op storage write as success", () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        ...memoryStorage(),
        setItem: () => undefined,
      },
    });
    expect(() =>
      persistDeviceProfileWipeGuard({
        operationId: "no-op-write",
        profileId: "user:alpha",
        expectedEpoch: 1,
      }),
    ).toThrow("device-wipe guard could not be persisted");
  });
});
