import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import "fake-indexeddb/auto";
import { ProfileWriteFence } from "@/data/profile-write-fence";
import type { Setting } from "@/lib/settings";
import { MAX_SOURCE_SETTING_VALUE_STRING_LENGTH } from "@/lib/settings";
import {
  createSourceSettingsStore,
  getSourceSettingsDatabaseName,
  getSourceSettingsStoreForProfile,
  matchSourceSettingsDatabaseProfile,
} from "./source-settings";

const waitForDebounce = () =>
  new Promise((resolve) => setTimeout(resolve, 650));

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

describe("SourceSettingsStore persistence", () => {
  it("uses a distinct IndexedDB container for every authenticated profile", () => {
    expect(getSourceSettingsDatabaseName()).toBe("nemu-source-settings");
    expect(getSourceSettingsDatabaseName("user:a")).toBe(
      "nemu-source-settings::user:a",
    );
    expect(getSourceSettingsDatabaseName("user:b")).not.toBe(
      getSourceSettingsDatabaseName("user:a"),
    );
    expect(matchSourceSettingsDatabaseProfile("nemu-source-settings")).toEqual({
      profileId: undefined,
    });
    expect(
      matchSourceSettingsDatabaseProfile("nemu-source-settings::user:a"),
    ).toEqual({ profileId: "user:a" });
    expect(
      matchSourceSettingsDatabaseProfile("nemu-source-settings::"),
    ).toBeNull();
  });

  it("keeps in-memory credentials isolated across profile containers", () => {
    const accountA = getSourceSettingsStoreForProfile("user:test-account-a");
    const accountB = getSourceSettingsStoreForProfile("user:test-account-b");
    accountA.setState({
      values: new Map([["aidoku:test", { token: "account-a-secret" }]]),
    });

    expect(accountA).not.toBe(accountB);
    expect(accountA.getState().values.get("aidoku:test")).toEqual({
      token: "account-a-secret",
    });
    expect(accountB.getState().values.get("aidoku:test")).toBeUndefined();
  });

  it("deduplicates concurrent initialization and preserves a racing live value", async () => {
    let loadCount = 0;
    let releaseLoad: (() => void) | undefined;
    const store = createSourceSettingsStore({
      loadAllSettings: async () => {
        loadCount += 1;
        await new Promise<void>((resolve) => {
          releaseLoad = resolve;
        });
        return new Map([
          ["aidoku:test", { token: "persisted", language: "en" }],
        ]);
      },
      loadAllSchemas: async () => new Map(),
      saveSettings: async () => {},
      deleteSettings: async () => {},
      saveSchema: async () => {},
      clearAll: async () => {},
      migrateFromLocalStorage: () => new Map(),
    });

    const first = store.getState().initialize();
    const second = store.getState().initialize();
    expect(first).toBe(second);
    store.getState().setSetting("aidoku:test", "token", "live");
    releaseLoad?.();
    await first;

    expect(loadCount).toBe(1);
    expect(store.getState().values.get("aidoku:test")).toEqual({
      token: "live",
      language: "en",
    });
    store.getState().resetSettings("aidoku:test");
  });

  it("sanitizes persisted schemas before exposing them to consumers", async () => {
    const cyclicGroup: Record<string, unknown> = {
      type: "group",
      title: "Persisted",
      items: [
        { type: "switch", key: "enabled", title: "Enabled", default: true },
        { type: "text", key: "enabled", title: "Duplicate" },
        { type: "unsupported", key: "bad", title: "Bad" },
      ],
    };
    (cyclicGroup.items as unknown[]).push(cyclicGroup);
    const store = createSourceSettingsStore({
      loadAllSettings: async () => new Map(),
      loadAllSchemas: async () =>
        new Map([["aidoku:persisted", [cyclicGroup] as unknown as never[]]]),
      saveSettings: async () => {},
      deleteSettings: async () => {},
      saveSchema: async () => {},
      clearAll: async () => {},
      migrateFromLocalStorage: () => new Map(),
    });

    await store.getState().initialize();

    expect(store.getState().schemas.get("aidoku:persisted")).toEqual([
      {
        type: "group",
        title: "Persisted",
        items: [
          {
            type: "switch",
            key: "enabled",
            title: "Enabled",
            default: true,
          },
        ],
      },
    ]);
  });

  it("sanitizes persisted values before exposing or re-saving them", async () => {
    let getterCalls = 0;
    const values: Record<string, unknown> = {
      enabled: true,
      count: 3,
      timestamp: 2_000_000_000_000,
      token: "secret",
      cookies: ["sid=abc", "theme=dark"],
      nested: { must: "drop" },
      infinite: Number.POSITIVE_INFINITY,
    };
    values.cycle = values;
    Object.defineProperty(values, "getter", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return "must-not-run";
      },
    });
    const store = createSourceSettingsStore({
      loadAllSettings: async () =>
        new Map([["aidoku:persisted-values", values]]),
      loadAllSchemas: async () => new Map(),
      saveSettings: async () => {},
      deleteSettings: async () => {},
      saveSchema: async () => {},
      clearAll: async () => {},
      migrateFromLocalStorage: () => new Map(),
    });

    await store.getState().initialize();

    expect(store.getState().values.get("aidoku:persisted-values")).toEqual({
      enabled: true,
      count: 3,
      timestamp: 2_000_000_000_000,
      token: "secret",
      cookies: ["sid=abc", "theme=dark"],
    });
    expect(getterCalls).toBe(0);
  });

  it("sanitizes schemas before caching and persisting them", async () => {
    const saved: unknown[] = [];
    const store = createSourceSettingsStore({
      loadAllSettings: async () => new Map(),
      loadAllSchemas: async () => new Map(),
      saveSettings: async () => {},
      deleteSettings: async () => {},
      saveSchema: async (_sourceKey, schema) => {
        saved.push(schema);
      },
      clearAll: async () => {},
      migrateFromLocalStorage: () => new Map(),
    });

    await store.getState().setSchema("aidoku:new", [
      { type: "stepper", key: "count", title: "Count", maximumValue: 10 },
      { type: "unknown", key: "bad", title: "Bad" },
    ] as unknown as never[]);

    const expected: Setting[] = [
      {
        type: "slider",
        key: "count",
        title: "Count",
        min: 0,
        max: 10,
      },
    ];
    expect(store.getState().schemas.get("aidoku:new")).toEqual(expected);
    expect(saved).toEqual([expected]);
  });

  it("removes invalid or cleared values instead of persisting them", async () => {
    const saved: Record<string, unknown>[] = [];
    const deleted: string[] = [];
    const store = createSourceSettingsStore({
      loadAllSettings: async () => new Map(),
      loadAllSchemas: async () => new Map(),
      saveSettings: async (_sourceKey, values) => {
        saved.push(values);
      },
      deleteSettings: async (sourceKey) => {
        deleted.push(sourceKey);
      },
      saveSchema: async () => {},
      clearAll: async () => {},
      migrateFromLocalStorage: () => new Map(),
    });

    store.getState().setSetting("aidoku:values", "valid", "kept");
    store
      .getState()
      .setSetting(
        "aidoku:values",
        "valid",
        "x".repeat(MAX_SOURCE_SETTING_VALUE_STRING_LENGTH + 1),
      );
    store.getState().setSetting("aidoku:values", "valid", undefined);
    await waitForDebounce();

    expect(store.getState().values.has("aidoku:values")).toBe(false);
    expect(saved).toEqual([]);
    expect(deleted).toEqual(["aidoku:values"]);
  });

  it("does not invoke corrupt in-memory accessors at the write boundary", () => {
    let getterCalls = 0;
    const corrupt: Record<string, unknown> = { existing: "kept" };
    Object.defineProperty(corrupt, "getter", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return "must-not-run";
      },
    });
    const store = createSourceSettingsStore({
      saveSettings: async () => {},
      deleteSettings: async () => {},
    });
    store.setState({ values: new Map([["aidoku:corrupt", corrupt]]) });

    store.getState().setSetting("aidoku:corrupt", "new", "safe");

    expect(store.getState().values.get("aidoku:corrupt")).toEqual({
      existing: "kept",
      new: "safe",
    });
    expect(getterCalls).toBe(0);
    store.getState().resetSettings("aidoku:corrupt");
  });

  it("cancels a pending save when deleting the last value", async () => {
    const saved: Array<{ sourceKey: string; values: Record<string, unknown> }> =
      [];
    const deleted: string[] = [];
    const store = createSourceSettingsStore({
      loadAllSettings: async () => new Map(),
      loadAllSchemas: async () => new Map(),
      saveSettings: async (sourceKey, values) => {
        saved.push({ sourceKey, values });
      },
      deleteSettings: async (sourceKey) => {
        deleted.push(sourceKey);
      },
      saveSchema: async () => {},
      migrateFromLocalStorage: () => new Map(),
    });

    store.getState().setSetting("aidoku:test", "login", "logged_in");
    store.getState().deleteSetting("aidoku:test", "login");

    await waitForDebounce();

    expect(store.getState().values.has("aidoku:test")).toBe(false);
    expect(saved).toEqual([]);
    expect(deleted).toEqual(["aidoku:test"]);
  });

  it("cancels a pending save when resetting settings", async () => {
    const saved: Array<{ sourceKey: string; values: Record<string, unknown> }> =
      [];
    const deleted: string[] = [];
    const store = createSourceSettingsStore({
      loadAllSettings: async () => new Map(),
      loadAllSchemas: async () => new Map(),
      saveSettings: async (sourceKey, values) => {
        saved.push({ sourceKey, values });
      },
      deleteSettings: async (sourceKey) => {
        deleted.push(sourceKey);
      },
      saveSchema: async () => {},
      migrateFromLocalStorage: () => new Map(),
    });

    store.getState().setSetting("aidoku:test", "login.username", "user");
    store.getState().resetSettings("aidoku:test");

    await waitForDebounce();

    expect(store.getState().values.has("aidoku:test")).toBe(false);
    expect(saved).toEqual([]);
    expect(deleted).toEqual(["aidoku:test"]);
  });

  it("drains active writes, cancels debounce, and rejects late writes when cleared", async () => {
    const saved: string[] = [];
    let releaseSave: (() => void) | undefined;
    let cleared = 0;
    const store = createSourceSettingsStore({
      loadAllSettings: async () => new Map(),
      loadAllSchemas: async () => new Map(),
      saveSettings: async (sourceKey) => {
        saved.push(sourceKey);
        await new Promise<void>((resolve) => {
          releaseSave = resolve;
        });
      },
      deleteSettings: async () => {},
      saveSchema: async () => {},
      clearAll: async () => {
        cleared += 1;
      },
      migrateFromLocalStorage: () => new Map(),
    });

    store.getState().setSetting("aidoku:active", "token", "secret");
    await new Promise((resolve) => setTimeout(resolve, 550));
    expect(saved).toEqual(["aidoku:active"]);

    const clearing = store.getState().clearAll();
    await Promise.resolve();
    expect(cleared).toBe(0);
    releaseSave?.();
    await clearing;
    expect(cleared).toBe(1);

    store.getState().setSetting("aidoku:late", "token", "must-not-return");
    await waitForDebounce();
    expect(saved).toEqual(["aidoku:active"]);
    expect(store.getState().values.size).toBe(0);
  });

  it("rolls an aborted transactional clear back to a writable store", async () => {
    const saved: Array<{ sourceKey: string; values: Record<string, unknown> }> =
      [];
    let markClearStarted!: () => void;
    const clearStarted = new Promise<void>((resolve) => {
      markClearStarted = resolve;
    });
    let resumeClear!: () => void;
    const clearCanResume = new Promise<void>((resolve) => {
      resumeClear = resolve;
    });
    const store = createSourceSettingsStore({
      loadAllSettings: async () => new Map(),
      loadAllSchemas: async () => new Map(),
      saveSettings: async (sourceKey, values) => {
        saved.push({ sourceKey, values });
      },
      deleteSettings: async () => {},
      saveSchema: async () => {},
      clearAll: async (signal) => {
        markClearStarted();
        await clearCanResume;
        if (signal?.aborted) {
          throw new DOMException("cancelled", "AbortError");
        }
      },
      migrateFromLocalStorage: () => new Map(),
    });
    store.getState().setSetting("aidoku:test", "token", "preserved");
    const controller = new AbortController();
    const clearing = store.getState().clearAll(controller.signal);

    await clearStarted;
    controller.abort();
    resumeClear();
    await expect(clearing).rejects.toMatchObject({ name: "AbortError" });

    store.getState().setSetting("aidoku:test", "refresh", "still-writable");
    await waitForDebounce();
    expect(store.getState().values.get("aidoku:test")).toEqual({
      token: "preserved",
      refresh: "still-writable",
    });
    expect(saved).toEqual([
      {
        sourceKey: "aidoku:test",
        values: { token: "preserved", refresh: "still-writable" },
      },
    ]);
  });

  it("cannot resurrect credentials from another tab after profile retirement", async () => {
    const profileId = `user:source-settings-retire-${Date.now()}-${Math.random()}`;
    const staleTab = createSourceSettingsStore({}, profileId);
    const clearingTab = createSourceSettingsStore({}, profileId);

    // Leave this credential in the debounce window while the other tab owns
    // the destructive profile boundary.
    staleTab
      .getState()
      .setSetting("aidoku:private", "oauth.refreshToken", "must-disappear");
    await new ProfileWriteFence(profileId).retire((lease) =>
      clearingTab.getState().clearAll(undefined, lease),
    );
    await waitForDebounce();

    // Retirement invalidates the stale in-memory tab as well as its pending
    // persistence callbacks. Further writes through that lifetime are ignored.
    expect(staleTab.getState().values.size).toBe(0);
    staleTab
      .getState()
      .setSetting("aidoku:private", "password", "must-not-return");
    await waitForDebounce();

    const freshTab = createSourceSettingsStore({}, profileId);
    await freshTab.getState().initialize();
    expect(freshTab.getState().values.size).toBe(0);
    expect(freshTab.getState().schemas.size).toBe(0);
  });
});
