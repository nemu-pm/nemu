import { describe, expect, test } from "bun:test";
import type { InstalledSource, SourceRegistry, UserSettings } from "./schema";
import type { MobileDataStore } from "./storeTypes";
import {
  MobileSourceDirectoryError,
  addMobileSourceDirectory,
  previewMobileSourceDirectory,
  enabledSourceDirectories,
  isMobileSourceAutoUpdateEnabled,
  loadMobileSourceDirectories,
  planSourceDirectorySeed,
  removeMobileSourceDirectory,
  setMobileSourceDirectoryEnabled,
  updateMobileSourceDirectoryUrl,
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

  // Like a site whose folder holds index.min.json: the folder itself is HTML.
  const folderOnlyFetch = async (directory: { indexUrl: string }) => {
    if (!directory.indexUrl.endsWith(".json")) throw new Error("not json");
    return fetchIndex();
  };

  test("adds a directory by https URL, naming it from the index", async () => {
    const { store, registries } = fakeStore({ seeded: true });
    const added = await addMobileSourceDirectory(
      store,
      { url: "https://example.github.io/repo/" },
      { fetchIndex: folderOnlyFetch, now: () => 7 },
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

  test("editing a URL preserves identity, enablement and installed source references", async () => {
    const { store, registries, getSettings } = fakeStore({ seeded: true });
    const added = await addMobileSourceDirectory(store, { url: "https://old.example/index.json" }, { fetchIndex, now: () => 7 });
    await setMobileSourceDirectoryEnabled(store, added.id, false);
    await store.updateSettings((current) => ({ ...current, installedSources: [installed(added.id, "en.example")] }));
    await updateMobileSourceDirectoryUrl(store, added.id, "https://new.example/", { fetchIndex: folderOnlyFetch });
    expect(registries.get(added.id)).toMatchObject({
      url: "https://new.example/index.min.json", disabled: true, addedAt: 7, name: "My Directory",
    });
    expect(getSettings().installedSources?.[0]?.registryId).toBe(added.id);
    await expect(addMobileSourceDirectory(store, { url: "https://new.example/index.min.json" }, { fetchIndex }))
      .rejects.toMatchObject({ code: "duplicate" });
  });

  test("editing rejects duplicates and invalid indexes without changing the saved URL", async () => {
    const { store, registries } = fakeStore({ seeded: true });
    const added = await addMobileSourceDirectory(store, { url: "https://old.example/index.json" }, { fetchIndex });
    await addMobileSourceDirectory(store, { url: "https://other.example/index.json" }, { fetchIndex });
    await expect(updateMobileSourceDirectoryUrl(store, added.id, "https://other.example/index.json", { fetchIndex }))
      .rejects.toMatchObject({ code: "duplicate" });
    await expect(updateMobileSourceDirectoryUrl(store, added.id, "http://new.example/", { fetchIndex }))
      .rejects.toMatchObject({ code: "not-https" });
    await expect(updateMobileSourceDirectoryUrl(store, added.id, "https://new.example/", {
      fetchIndex: async () => { throw new Error("offline"); },
    })).rejects.toMatchObject({ code: "unreachable" });
    expect(registries.get(added.id)).toMatchObject({ url: added.indexUrl });
    await expect(updateMobileSourceDirectoryUrl(store, "nemu-recommended", "https://new.example/", { fetchIndex }))
      .rejects.toMatchObject({ code: "built-in" });
  });

  test("a directory removed during URL validation is not resurrected", async () => {
    const { store, registries } = fakeStore({ seeded: true });
    const added = await addMobileSourceDirectory(store, { url: "https://old.example/index.json" }, { fetchIndex });
    await updateMobileSourceDirectoryUrl(store, added.id, "https://new.example/index.json", {
      fetchIndex: async () => { await store.removeRegistry(added.id); return fetchIndex(); },
    });
    expect(registries.has(added.id)).toBe(false);
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

describe("directory addresses and links", () => {
  const list = (name?: string) => ({
    ...(name ? { name } : {}),
    sources: [{ id: "a", registryId: "x", registryName: "x", name: "A", version: 1 }],
  });

  test("an address with no .json file is tried as a list before as a folder", async () => {
    const { store } = fakeStore({ seeded: true });
    const tried: string[] = [];
    const preview = await previewMobileSourceDirectory(
      store,
      { url: "https://example.com/lists/mine" },
      { fetchIndex: async (d) => (tried.push(d.indexUrl), list("Mine")) },
    );
    expect(tried).toEqual(["https://example.com/lists/mine"]);
    expect(preview).toMatchObject({ indexUrl: "https://example.com/lists/mine", name: "Mine", host: "example.com" });
  });

  test("falls back to <url>/index.min.json when the address is not a list", async () => {
    const { store } = fakeStore({ seeded: true });
    const tried: string[] = [];
    const preview = await previewMobileSourceDirectory(
      store,
      { url: "https://example.com/lists/mine" },
      {
        fetchIndex: async (d) => {
          tried.push(d.indexUrl);
          return d.indexUrl.endsWith("index.min.json") ? list() : { sources: [] };
        },
      },
    );
    expect(tried).toEqual(["https://example.com/lists/mine", "https://example.com/lists/mine/index.min.json"]);
    // A bare array has no name: the display name falls back to the host and path.
    expect(preview.name).toBe("example.com/lists/mine");
  });

  test("previewing stores nothing; adding with a preview does not refetch", async () => {
    const { store, registries } = fakeStore({ seeded: true });
    let fetches = 0;
    const fetchIndex = async () => (fetches++, list("Mine"));
    const preview = await previewMobileSourceDirectory(store, { url: "https://example.com/a.json" }, { fetchIndex });
    expect([...registries.keys()]).toEqual(["nemu-recommended"]);
    const added = await addMobileSourceDirectory(store, { url: "" }, { preview, fetchIndex, now: () => 3 });
    expect(fetches).toBe(1);
    expect(registries.get(added.id)).toMatchObject({ url: "https://example.com/a.json", name: "Mine" });
    await expect(
      addMobileSourceDirectory(store, { url: "" }, { preview, fetchIndex }),
    ).rejects.toMatchObject({ code: "duplicate" });
  });

  test("a pasted aidoku:// or nemu:// link is unwrapped", async () => {
    const { store } = fakeStore({ seeded: true });
    const fetchIndex = async () => list("L");
    for (const link of [
      "aidoku://addSourceList?url=https%3A%2F%2Fexample.com%2Fi.json",
      "nemu://addSourceList?url=https://example.com/i.json",
    ]) {
      expect(await previewMobileSourceDirectory(store, { url: link }, { fetchIndex })).toMatchObject({
        indexUrl: "https://example.com/i.json",
      });
    }
  });

  test("the failure reasons the link flow reports", async () => {
    const { store } = fakeStore({ seeded: true });
    const empty = async () => ({ sources: [] });
    const boom = async () => {
      throw new Error("down");
    };
    await expect(previewMobileSourceDirectory(store, { url: "https://example.com/i.json" }, { fetchIndex: empty })).rejects.toMatchObject({ code: "no-sources" });
    await expect(previewMobileSourceDirectory(store, { url: "https://example.com/i.json" }, { fetchIndex: boom })).rejects.toMatchObject({ code: "unreachable" });
    await expect(previewMobileSourceDirectory(store, { url: "ftp://x" }, { fetchIndex: empty })).rejects.toMatchObject({ code: "not-https" });
    await expect(previewMobileSourceDirectory(store, { url: "garbage" }, { fetchIndex: empty })).rejects.toMatchObject({ code: "invalid" });
  });
});
