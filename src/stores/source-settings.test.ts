import { describe, expect, it } from "bun:test";
import { createSourceSettingsStore } from "./source-settings";

const waitForDebounce = () => new Promise((resolve) => setTimeout(resolve, 650));

describe("SourceSettingsStore persistence", () => {
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
});
