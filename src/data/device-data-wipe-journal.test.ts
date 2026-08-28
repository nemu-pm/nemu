import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  checkpointPendingDeviceDataWipe,
  createPendingDeviceDataWipe,
  deletePendingDeviceDataWipe,
  isPendingDeviceDataWipe,
  readPendingDeviceDataWipe,
  withDeviceDataWipeLock,
} from "./device-data-wipe-journal";

const storageDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  "localStorage",
);
const documentDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  "document",
);
const navigatorDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  "navigator",
);
const sessionStorageDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  "sessionStorage",
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

async function expectedFingerprint(
  kind: "localStorage" | "sessionStorage" | "cookie",
  name: string,
  value: string,
): Promise<string> {
  const bytes = new TextEncoder().encode(
    JSON.stringify(["nemu-device-data-wipe-v1", kind, name, value]),
  );
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

beforeEach(() => {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: memoryStorage(),
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      cookie: "sidebar_state=open; unrelated_cookie=unrelated-secret",
    },
  });
  Object.defineProperty(globalThis, "sessionStorage", {
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
  if (documentDescriptor) {
    Object.defineProperty(globalThis, "document", documentDescriptor);
  } else {
    Reflect.deleteProperty(globalThis, "document");
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
  if (navigatorDescriptor) {
    Object.defineProperty(globalThis, "navigator", navigatorDescriptor);
  } else {
    Reflect.deleteProperty(globalThis, "navigator");
  }
  if (windowDescriptor) {
    Object.defineProperty(globalThis, "window", windowDescriptor);
  } else {
    Reflect.deleteProperty(globalThis, "window");
  }
});

async function completeJournal() {
  let journal = await createPendingDeviceDataWipe({
    profiles: [
      { profileId: null, expectedEpoch: 0 },
      { profileId: "user:alpha", expectedEpoch: 3 },
    ],
    databases: ["nemu-cache", "nemu-security-state"],
    initiatingProfileId: "user:alpha",
  });
  journal = checkpointPendingDeviceDataWipe(journal, {
    ...journal,
    remoteSignOutConfirmed: true,
  });
  journal = checkpointPendingDeviceDataWipe(journal, {
    ...journal,
    completedProfiles: [...journal.profiles],
  });
  return checkpointPendingDeviceDataWipe(journal, {
    ...journal,
    completedDatabases: [...journal.databases],
  });
}

describe("device-data wipe journal", () => {
  test("persists a bounded exact scope without raw secrets or unrelated origin state", async () => {
    localStorage.setItem("nemu:ordinary-state", "super-secret-token");
    localStorage.setItem("unrelated-state", "unrelated-secret");
    localStorage.setItem("better-auth_cookie", "auth-secret");
    sessionStorage.setItem("nemu:ephemeral", "session-secret");
    sessionStorage.setItem("unrelated-ephemeral", "unrelated-secret");
    localStorage.setItem("nemu:profile-write-epoch:user%3Aalpha", "2");
    localStorage.setItem(
      "nemu:device-profile-catalog:user%3Aalpha",
      JSON.stringify({ version: 1, profileId: "user:alpha", epoch: 2 }),
    );

    const journal = await createPendingDeviceDataWipe({
      profiles: [
        { profileId: "user:alpha", expectedEpoch: 2 },
        { profileId: null, expectedEpoch: 0 },
        { profileId: "user:alpha", expectedEpoch: 2 },
      ],
      databases: ["nemu-security-state", "nemu-cache", "nemu-cache"],
      initiatingProfileId: "user:alpha",
    });

    expect(readPendingDeviceDataWipe()).toEqual(journal);
    expect(journal.profiles).toEqual([
      { profileId: null, expectedEpoch: 0 },
      { profileId: "user:alpha", expectedEpoch: 2 },
    ]);
    expect(journal.databases).toEqual(["nemu-cache", "nemu-security-state"]);
    expect(journal.localStorageEntries.map((entry) => entry.key)).toEqual([
      "better-auth_cookie",
      "nemu:ordinary-state",
    ]);
    expect(journal.sessionStorageEntries.map((entry) => entry.key)).toEqual([
      "nemu:ephemeral",
    ]);
    expect(journal.cookies.map((cookie) => cookie.name)).toEqual([
      "sidebar_state",
    ]);
    for (const fingerprint of [
      ...journal.localStorageEntries.map((entry) => entry.fingerprint),
      ...journal.sessionStorageEntries.map((entry) => entry.fingerprint),
      ...journal.cookies.map((cookie) => cookie.fingerprint),
    ]) {
      expect(fingerprint).toMatch(/^[0-9a-f]{64}$/);
    }
    const serialized = localStorage.getItem("nemu:pending-device-data-wipe");
    expect(serialized).not.toContain("super-secret-token");
    expect(serialized).not.toContain("auth-secret");
    expect(serialized).not.toContain("session-secret");
    expect(serialized).not.toContain("unrelated-secret");
    expect(journal.remoteSignOutConfirmed).toBe(false);
  });

  test("rejects unknown databases, profile keys, and oversized scope", () => {
    const base = {
      version: 1,
      status: "pending",
      operationId: "operation",
      createdAt: 1,
      initiatingProfileId: null,
      remoteSignOutConfirmed: true,
      profiles: [{ profileId: null, expectedEpoch: 0 }],
      completedProfiles: [],
      databases: ["nemu-cache"],
      completedDatabases: [],
      localStorageEntries: [],
      sessionStorageEntries: [],
      cookies: [],
    } as const;

    expect(isPendingDeviceDataWipe(base)).toBe(true);
    expect(
      isPendingDeviceDataWipe({ ...base, attackerExpandedScope: true }),
    ).toBe(false);
    expect(
      isPendingDeviceDataWipe({
        ...base,
        databases: ["unrelated-same-origin-db"],
      }),
    ).toBe(false);
    expect(
      isPendingDeviceDataWipe({
        ...base,
        localStorageEntries: [
          { key: "unrelated-origin-key", fingerprint: "0".repeat(64) },
        ],
      }),
    ).toBe(false);
    expect(
      isPendingDeviceDataWipe({
        ...base,
        cookies: [{ name: "unrelated_cookie", fingerprint: "0".repeat(64) }],
      }),
    ).toBe(false);
    expect(
      isPendingDeviceDataWipe({
        ...base,
        profiles: [
          { profileId: "user:duplicate", expectedEpoch: 1 },
          { profileId: "user:duplicate", expectedEpoch: 2 },
        ],
      }),
    ).toBe(false);
    expect(
      isPendingDeviceDataWipe({
        ...base,
        profiles: [{ profileId: null, expectedEpoch: Number.MAX_SAFE_INTEGER }],
      }),
    ).toBe(false);
    expect(
      isPendingDeviceDataWipe({
        ...base,
        profiles: [{ profileId: "admin:foreign", expectedEpoch: 0 }],
      }),
    ).toBe(false);
    expect(
      isPendingDeviceDataWipe({
        ...base,
        profiles: [
          { profileId: null, expectedEpoch: 0 },
          ...Array.from({ length: 129 }, (_, i) => ({
            profileId: `user:${i}`,
            expectedEpoch: 0,
          })),
        ],
      }),
    ).toBe(false);
    expect(
      isPendingDeviceDataWipe({
        ...base,
        completedDatabases: ["nemu-plugins"],
      }),
    ).toBe(false);
  });

  test("refuses conflicting epochs for one profile before snapshotting storage", async () => {
    let storageReads = 0;
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        ...memoryStorage(),
        get length() {
          storageReads += 1;
          return 0;
        },
      },
    });

    await expect(
      createPendingDeviceDataWipe({
        profiles: [
          { profileId: "user:alpha", expectedEpoch: 3 },
          { profileId: "user:alpha", expectedEpoch: 4 },
        ],
        databases: ["nemu-cache"],
        initiatingProfileId: "user:alpha",
      }),
    ).rejects.toThrow("discovered write epochs conflict");
    expect(storageReads).toBe(0);
  });

  test("retries a transient key-index shift instead of omitting an owned key", async () => {
    const backing = memoryStorage();
    backing.setItem("nemu:owned", "durable-value");
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

    const journal = await createPendingDeviceDataWipe({
      profiles: [{ profileId: null, expectedEpoch: 0 }],
      databases: [],
    });
    expect(journal.localStorageEntries.map((entry) => entry.key)).toEqual([
      "nemu:owned",
    ]);
    expect(keyReads).toBeGreaterThanOrEqual(4);
  });

  test("restarts the snapshot when owned storage mutates during hashing", async () => {
    const backing = memoryStorage();
    backing.setItem("nemu:volatile", "before-hash");
    let scheduledMutation = false;
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        ...backing,
        get length() {
          return backing.length;
        },
        getItem: (key: string) => {
          const value = backing.getItem(key);
          if (key === "nemu:volatile" && !scheduledMutation) {
            scheduledMutation = true;
            queueMicrotask(() => backing.setItem(key, "after-hash"));
          }
          return value;
        },
      },
    });

    const journal = await createPendingDeviceDataWipe({
      profiles: [{ profileId: null, expectedEpoch: 0 }],
      databases: [],
    });
    expect(journal.localStorageEntries).toEqual([
      {
        key: "nemu:volatile",
        fingerprint: await expectedFingerprint(
          "localStorage",
          "nemu:volatile",
          "after-hash",
        ),
      },
    ]);
  });

  test("requires visible Nemu cookies to remain stable across hashing", async () => {
    let cookieReads = 0;
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        get cookie() {
          cookieReads += 1;
          return cookieReads === 1
            ? "sidebar_state=open"
            : "sidebar_state=closed";
        },
      },
    });

    const journal = await createPendingDeviceDataWipe({
      profiles: [{ profileId: null, expectedEpoch: 0 }],
      databases: [],
    });
    expect(journal.cookies).toEqual([
      {
        name: "sidebar_state",
        fingerprint: await expectedFingerprint(
          "cookie",
          "sidebar_state",
          "closed",
        ),
      },
    ]);
    expect(cookieReads).toBeGreaterThanOrEqual(4);
  });

  test("fails closed when Web Storage enumeration throws", async () => {
    const backing = memoryStorage();
    backing.setItem("nemu:owned", "value");
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        ...backing,
        get length() {
          return backing.length;
        },
        key: () => {
          throw new DOMException("Storage access denied", "SecurityError");
        },
      },
    });
    await expect(
      createPendingDeviceDataWipe({
        profiles: [{ profileId: null, expectedEpoch: 0 }],
        databases: [],
      }),
    ).rejects.toThrow("Cannot safely snapshot device localStorage");
  });

  test("checkpoints cannot expand, replace, or rewind the authorized scope", async () => {
    const journal = await createPendingDeviceDataWipe({
      profiles: [{ profileId: "user:alpha", expectedEpoch: 4 }],
      databases: ["nemu-cache"],
      initiatingProfileId: "user:alpha",
    });

    expect(() =>
      checkpointPendingDeviceDataWipe(journal, {
        ...journal,
        profiles: [
          ...journal.profiles,
          { profileId: "user:attacker-added", expectedEpoch: 0 },
        ],
      }),
    ).toThrow("scope changed");

    localStorage.setItem(
      "nemu:pending-device-data-wipe",
      JSON.stringify({
        ...journal,
        databases: [...journal.databases, "nemu-plugins"],
      }),
    );
    expect(() =>
      checkpointPendingDeviceDataWipe(journal, {
        ...journal,
        remoteSignOutConfirmed: true,
      }),
    ).toThrow("scope changed");
  });

  test("refuses premature completion and removes only a fully checkpointed operation", async () => {
    const pending = await createPendingDeviceDataWipe({
      profiles: [{ profileId: null, expectedEpoch: 0 }],
      databases: ["nemu-cache"],
    });
    expect(() => deletePendingDeviceDataWipe(pending)).toThrow(
      "changed before it could be completed",
    );

    // Start a clean operation after simulating an operator retry.
    localStorage.removeItem("nemu:pending-device-data-wipe");
    const completed = await completeJournal();
    deletePendingDeviceDataWipe(completed);
    expect(readPendingDeviceDataWipe()).toBeNull();
  });

  test("serializes duplicate same-realm recovery attempts", async () => {
    const calls: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const first = withDeviceDataWipeLock(async () => {
      calls.push("first:start");
      await firstGate;
      calls.push("first:end");
    });
    const second = withDeviceDataWipeLock(async () => {
      calls.push("second");
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toEqual(["first:start"]);
    releaseFirst();
    await Promise.all([first, second]);
    expect(calls).toEqual(["first:start", "first:end", "second"]);
  });

  test("fails closed in a browser context when Web Locks are unavailable", async () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {},
    });
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {},
    });
    let called = false;
    await expect(
      withDeviceDataWipeLock(async () => {
        called = true;
      }),
    ).rejects.toThrow("Web Locks are unavailable");
    expect(called).toBe(false);
  });

  test("fails closed when a durable journal is corrupt or unreadable", () => {
    localStorage.setItem("nemu:pending-device-data-wipe", "{not-json");
    expect(() => readPendingDeviceDataWipe()).toThrow(
      "pending device-data wipe journal is invalid",
    );

    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        ...memoryStorage(),
        getItem: () => {
          throw new DOMException("Storage access denied", "SecurityError");
        },
      },
    });
    expect(() => readPendingDeviceDataWipe()).toThrow(
      "Cannot safely read the pending device-data wipe journal",
    );
  });
});
