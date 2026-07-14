import { describe, expect, it } from "bun:test";
import {
  createSourceSettingsStore,
  getSourceSettingsDatabaseName,
  getSourceSettingsStoreForProfile,
} from "./source-settings";

const waitForDebounce = () => new Promise((resolve) => setTimeout(resolve, 650));

describe("SourceSettingsStore persistence", () => {
  it("uses a distinct IndexedDB container for every authenticated profile", () => {
    expect(getSourceSettingsDatabaseName()).toBe("nemu-source-settings");
    expect(getSourceSettingsDatabaseName("user:a")).toBe(
      "nemu-source-settings::user:a",
    );
    expect(getSourceSettingsDatabaseName("user:b")).not.toBe(
      getSourceSettingsDatabaseName("user:a"),
    );
  });

  it("keeps in-memory credentials isolated across profile containers", () => {
    const accountA = getSourceSettingsStoreForProfile("test:account-a");
    const accountB = getSourceSettingsStoreForProfile("test:account-b");
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
        await new Promise<void>((resolve) => { releaseLoad = resolve; });
        return new Map([["aidoku:test", { token: "persisted", language: "en" }]]);
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

  it("cancels a pending save when deleting the last value", async () => {
    const saved: Array<{ sourceKey: string; values: Record<string, unknown> }> = [];
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
    const saved: Array<{ sourceKey: string; values: Record<string, unknown> }> = [];
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
        await new Promise<void>((resolve) => { releaseSave = resolve; });
      },
      deleteSettings: async () => {},
      saveSchema: async () => {},
      clearAll: async () => { cleared += 1; },
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
    const saved: Array<{ sourceKey: string; values: Record<string, unknown> }> = [];
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
});
