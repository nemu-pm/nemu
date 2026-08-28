import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  discoverDeviceDataProfiles,
  retireDeviceDataProfiles,
} from "./device-data-retirement";
import {
  ProfileWriteFence,
  StaleProfileWriteError,
} from "./profile-write-fence";

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

describe("device data profile retirement", () => {
  test("discovers and deduplicates exact user and source-settings profiles", () => {
    expect(
      discoverDeviceDataProfiles(
        [
          "nemu-cache",
          "nemu-user",
          "nemu-source-settings",
          "nemu-user::user:alpha",
          "nemu-source-settings::user:alpha",
          "nemu-source-settings::user:beta",
          "nemu-user::",
          "unrelated::user:ignored",
        ],
        "user:active",
      ),
    ).toEqual([
      undefined,
      "user:active",
      "user:alpha",
      "user:beta",
    ]);
  });

  test("includes the active profile when database enumeration is unavailable", () => {
    expect(discoverDeviceDataProfiles([], "user:active-only")).toEqual([
      "user:active-only",
    ]);
    expect(discoverDeviceDataProfiles([], undefined)).toEqual([undefined]);
  });

  test("committed clears retire stale writers but allow a fresh lifetime", async () => {
    const profileId = `user:device-clear-${Math.random()}`;
    const staleWriter = new ProfileWriteFence(profileId);
    const callbacks: Array<string | undefined> = [];

    await retireDeviceDataProfiles(
      [`nemu-user::${profileId}`, `nemu-source-settings::${profileId}`],
      profileId,
      async (clearedProfile) => {
        callbacks.push(clearedProfile);
      },
    );

    expect(callbacks).toEqual([profileId]);
    await expect(
      staleWriter.run(async () => undefined),
    ).rejects.toBeInstanceOf(StaleProfileWriteError);
    await expect(
      new ProfileWriteFence(profileId).run(async () => "fresh"),
    ).resolves.toBe("fresh");
  });

  test("a failed clear does not retire the profile lifetime", async () => {
    const profileId = `user:device-clear-failed-${Math.random()}`;
    const existingWriter = new ProfileWriteFence(profileId);

    await expect(
      retireDeviceDataProfiles([], profileId, async () => {
        throw new Error("clear failed");
      }),
    ).rejects.toThrow("clear failed");

    await expect(
      existingWriter.run(async () => "still current"),
    ).resolves.toBe("still current");
  });
});
