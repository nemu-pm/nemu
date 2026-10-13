import { describe, expect, test } from "bun:test";
import type { InstalledSource, SourceRegistry, UserSettings } from "./schema";
import type { MobileDataStore } from "./storeTypes";
import {
  MobileSourceDirectoryError,
  addMobileSourceDirectory,
  enabledSourceDirectories,
  isMobileSourceAutoUpdateEnabled,
  loadMobileSourceDirectories,
  planSourceDirectorySeed,
  removeMobileSourceDirectory,
  setMobileSourceDirectoryEnabled,
} from "./mobileSourceDirectories";

function installed(registryId: string, sourceId: string): InstalledSource {
  return {
    id: `${registryId}:${sourceId}`,
    registryId,
    sourceId,
    version: 1,
    removed: false,
  };
}

function fakeStore(
  options: {
    registries?: SourceRegistry[];
    installedSources?: InstalledSource[];
    seeded?: boolean;
  } = {},
) {
  const registries = new Map<string, SourceRegistry>(
    (options.registries ?? []).map((entry) => [entry.id, entry]),
  );
  let settings: UserSettings = {
    installedSources: options.installedSources ?? [],
    ...(options.seeded ? { sourceDirectoriesSeeded: true } : {}),
  };
  const store = {
    getRegistries: async () => [...registries.values()],
    getRegistry: async (id: string) => registries.get(id) ?? null,
    saveRegistry: async (entry: SourceRegistry) => {
      registries.set(entry.id, entry);
    },
    removeRegistry: async (id: string) => {
      registries.delete(id);
    },
    getSyncSettings: async () => settings,
    getSettings: async () => settings,
    updateSettings: async (updater: (current: UserSettings) => UserSettings) => {
      settings = updater(settings);
      return settings;
    },
  } as unknown as MobileDataStore;
  return { store, registries, getSettings: () => settings };
}

const communityRow: SourceRegistry = {
  id: "aidoku-community",
  name: "Aidoku Community",
  type: "url",
  url: "https://aidoku-community.github.io/sources/index.min.json",
};
const zhRow: SourceRegistry = {
  id: "aidoku-zh",
  name: "Aidoku ZH",
  type: "url",
  url: "https://raw.githubusercontent.com/suiyuran/aidoku-zh-sources/main/public/index.min.json",
};

describe("source directory seeding", () => {
  test("a new profile only gets the nemu recommended directory", async () => {
    const { store } = fakeStore();
    const directories = await loadMobileSourceDirectories(store);
    expect(directories.map((entry) => entry.id)).toEqual(["nemu-recommended"]);
    expect(directories[0]).toMatchObject({ builtIn: true, enabled: true });
  });

  test("existing users keep a legacy directory their installed sources came from", async () => {
    const { store, registries, getSettings } = fakeStore({
      // The old catalog loader wrote both rows on every load.
      registries: [communityRow, zhRow],
      installedSources: [installed("aidoku-community", "multi.mangadex")],
    });
    const directories = await loadMobileSourceDirectories(store);
    expect(directories.map((entry) => entry.id)).toEqual([
      "nemu-recommended",
      "aidoku-community",
    ]);
    expect(directories[1]).toMatchObject({ builtIn: false, enabled: true });
    expect(registries.has("aidoku-zh")).toBe(false);
    expect(getSettings().sourceDirectoriesSeeded).toBe(true);
  });

  test("migration runs once: a directory the user removed does not come back", async () => {
    const { store } = fakeStore({
      registries: [communityRow],
      installedSources: [installed("aidoku-community", "multi.mangadex")],
    });
    await loadMobileSourceDirectories(store);
    await removeMobileSourceDirectory(store, "aidoku-community");
    const directories = await loadMobileSourceDirectories(store);
    expect(directories.map((entry) => entry.id)).toEqual(["nemu-recommended"]);
  });

  test("tombstoned installs do not keep a legacy directory alive", () => {
    const plan = planSourceDirectorySeed({
      registries: [communityRow],
      installedSources: [
        { ...installed("aidoku-community", "x"), removed: true },
      ],
      seeded: false,
      now: 1,
    });
    expect(plan.removeIds).toEqual(["aidoku-community"]);
    expect(plan.save.map((entry) => entry.id)).toEqual(["nemu-recommended"]);
  });

  test("a disabled recommended directory stays disabled across seeding", async () => {
    const { store } = fakeStore({ seeded: true });
    await loadMobileSourceDirectories(store);
    await setMobileSourceDirectoryEnabled(store, "nemu-recommended", false);
    const directories = await loadMobileSourceDirectories(store);
    expect(directories[0]!.enabled).toBe(false);
    expect(enabledSourceDirectories(directories)).toEqual([]);
  });
});

describe("user-added directories", () => {
  const fetchIndex = async () => ({
    name: "My Directory",
    sources: [
      {
        id: "en.example",
        registryId: "x",
        registryName: "x",
        name: "Example",
        version: 1,
      },
    ],
  });

  test("adds a directory by https URL, naming it from the index", async () => {
    const { store, registries } = fakeStore({ seeded: true });
    const added = await addMobileSourceDirectory(
      store,
      { url: "https://example.github.io/repo/" },
      { fetchIndex, now: () => 7 },
    );
    expect(added).toMatchObject({
      name: "My Directory",
      indexUrl: "https://example.github.io/repo/index.min.json",
      builtIn: false,
      enabled: true,
      addedAt: 7,
    });
    expect(registries.get(added.id)).toMatchObject({
      type: "url",
      url: "https://example.github.io/repo/index.min.json",
    });
    const names = (await loadMobileSourceDirectories(store)).map(
      (entry) => entry.id,
    );
    expect(names).toEqual(["nemu-recommended", added.id]);
  });

  test("rejects bad URLs, duplicates, unreachable and empty directories", async () => {
    const { store } = fakeStore({ seeded: true });
    const url = "https://example.github.io/repo/index.min.json";
    await expect(
      addMobileSourceDirectory(store, { url: "http://example.com" }, { fetchIndex }),
    ).rejects.toMatchObject({ code: "not-https" });
    await expect(
      addMobileSourceDirectory(store, { url: "https://192.168.1.2/" }, { fetchIndex }),
    ).rejects.toMatchObject({ code: "local-host" });
    await addMobileSourceDirectory(store, { url }, { fetchIndex });
    await expect(
      addMobileSourceDirectory(store, { url }, { fetchIndex }),
    ).rejects.toMatchObject({ code: "duplicate" });
    await expect(
      addMobileSourceDirectory(
        store,
        { url: "https://other.example.com/" },
        {
          fetchIndex: async () => {
            throw new Error("offline");
          },
        },
      ),
    ).rejects.toMatchObject({ code: "unreachable" });
    await expect(
      addMobileSourceDirectory(
        store,
        { url: "https://other.example.com/" },
        { fetchIndex: async () => ({ sources: [] }) },
      ),
    ).rejects.toBeInstanceOf(MobileSourceDirectoryError);
  });

  test("disable keeps the entry; remove forgets it; built-in cannot be removed", async () => {
    const { store, registries } = fakeStore({ seeded: true });
    const added = await addMobileSourceDirectory(
      store,
      { url: "https://example.github.io/" },
      { fetchIndex },
    );
    await setMobileSourceDirectoryEnabled(store, added.id, false);
    expect(registries.get(added.id)).toMatchObject({ disabled: true });
    expect(
      enabledSourceDirectories(await loadMobileSourceDirectories(store)).map(
        (entry) => entry.id,
      ),
    ).toEqual(["nemu-recommended"]);

    await removeMobileSourceDirectory(store, added.id);
    expect(registries.has(added.id)).toBe(false);
    await expect(
      removeMobileSourceDirectory(store, "nemu-recommended"),
    ).rejects.toMatchObject({ code: "built-in" });

    // Same URL, same id: sources installed from it get their update origin back.
    const again = await addMobileSourceDirectory(
      store,
      { url: "https://example.github.io/" },
      { fetchIndex },
    );
    expect(again.id).toBe(added.id);
  });
});

describe("auto-update preference", () => {
  test("is on unless explicitly turned off", () => {
    expect(isMobileSourceAutoUpdateEnabled({})).toBe(true);
    expect(isMobileSourceAutoUpdateEnabled({ autoUpdateSources: true })).toBe(
      true,
    );
    expect(isMobileSourceAutoUpdateEnabled({ autoUpdateSources: false })).toBe(
      false,
    );
  });
});
