import { describe, expect, test } from "bun:test";
import type { CacheStore } from "@/data/cache";
import type { InstalledSource } from "@/data/schema";
import type { RegistryManager, SourceRegistryProvider } from "@/lib/sources/registry";
import { createSettingsStore } from "./settings";

const cache: CacheStore = {
  get: async () => null,
  set: async () => {},
  getJson: async () => null,
  setJson: async () => {},
  delete: async () => {},
  clear: async () => {},
};

function installed(id: string, updatedAt = 1): InstalledSource {
  return {
    id: `registry:${id}`,
    registryId: "registry",
    sourceId: id,
    version: 1,
    updatedAt,
  };
}

describe("SettingsStore generation transitions", () => {
  test("clears warm source state and ignores inflight old-generation initialization", async () => {
    let markReadStarted!: () => void;
    const readStarted = new Promise<void>((resolve) => {
      markReadStarted = resolve;
    });
    let resolveRead!: (sources: InstalledSource[]) => void;
    const delayedRead = new Promise<InstalledSource[]>((resolve) => {
      resolveRead = resolve;
    });
    const manager = {
      initialize: async () => {},
      disposeLoadedSources: () => {},
      listAllSources: async () => [],
      getRegistry: () => null,
    } as unknown as RegistryManager;
    const store = createSettingsStore(
      {
        getInstalledSources: async () => {
          markReadStarted();
          return delayedRead;
        },
        getInstalledSource: async () => null,
        saveInstalledSource: async () => {},
        removeInstalledSource: async () => {},
      },
      cache,
      manager,
    );
    store.setState({ installedSources: [installed("warm")], loading: false });

    const initializing = store.getState().initialize();
    await readStarted;
    store.getState().prepareSyncGeneration(3, Promise.resolve());
    expect(store.getState().installedSources).toEqual([]);
    expect(store.getState().syncGeneration).toBe(3);
    resolveRead([installed("stale")]);
    await initializing;

    expect(store.getState().installedSources).toEqual([]);
    expect(store.getState().loading).toBe(true);
  });

  test("queues a new install and passes its generation into registry persistence", async () => {
    const generations: Array<number | null | undefined> = [];
    const source = installed("after-reset", 4);
    let markReady!: () => void;
    const readiness = new Promise<void>((resolve) => {
      markReady = resolve;
    });
    const registry = {
      installSource: async (
        _sourceId: string,
        expectedGeneration?: number | null,
      ) => {
        generations.push(expectedGeneration);
      },
    } as unknown as SourceRegistryProvider;
    const manager = {
      initialize: async () => {},
      disposeLoadedSources: () => {},
      listAllSources: async () => [],
      getRegistry: () => registry,
    } as unknown as RegistryManager;
    const store = createSettingsStore(
      {
        getInstalledSources: async () => [source],
        getInstalledSource: async () => null,
        saveInstalledSource: async () => {},
        removeInstalledSource: async () => {},
      },
      cache,
      manager,
    );
    store.getState().prepareSyncGeneration(4, readiness);

    const installing = store.getState().installSource("registry", "after-reset");
    await Promise.resolve();
    expect(generations).toEqual([]);
    markReady();
    await installing;

    expect(generations).toEqual([4]);
    expect(store.getState().installedSources).toEqual([source]);
  });
});

describe("SettingsStore disabled sources", () => {
  function createDisableHarness(initial: InstalledSource[]) {
    const saved: Array<{
      source: InstalledSource;
      generation?: number | null;
    }> = [];
    const unloaded: string[] = [];
    let sources = initial;
    const registry = {
      installSource: async () => {},
      unloadSource: (sourceId: string) => {
        unloaded.push(sourceId);
      },
    } as unknown as SourceRegistryProvider;
    const manager = {
      initialize: async () => {},
      disposeLoadedSources: () => {},
      listAllSources: async () => [],
      getRegistry: () => registry,
    } as unknown as RegistryManager;
    const store = createSettingsStore(
      {
        getInstalledSources: async () => sources,
        getInstalledSource: async (id: string) =>
          sources.find((source) => source.id === id) ?? null,
        saveInstalledSource: async (source, generation) => {
          saved.push({ source, generation });
          sources = [
            ...sources.filter((item) => item.id !== source.id),
            { ...source, updatedAt: (source.updatedAt ?? 0) + 1 },
          ];
        },
        removeInstalledSource: async () => {},
      },
      cache,
      manager,
    );
    return { store, saved, unloaded, currentSources: () => sources };
  }

  test("persists the toggle through saveInstalledSource and unloads the source", async () => {
    const source = installed("broken", 7);
    const { store, saved, unloaded } = createDisableHarness([source]);

    await store.getState().setSourceDisabled("registry", "broken", true);

    expect(saved).toHaveLength(1);
    expect(saved[0]!.source).toMatchObject({
      id: "registry:broken",
      disabled: true,
    });
    // Same write-through path as install/uninstall, so the persistence layer
    // bumps updatedAt off the sync clock for last-writer-wins.
    expect(saved[0]!.generation).toBe(store.getState().syncGeneration);
    expect(unloaded).toEqual(["broken"]);
    expect(store.getState().installedSources[0]!.updatedAt).toBeGreaterThan(7);
  });

  test("keeps disabled installs listed but drops them from enabledSources", async () => {
    const enabledSource = installed("good", 2);
    const brokenSource = installed("broken", 2);
    const { store } = createDisableHarness([enabledSource, brokenSource]);

    await store.getState().initialize();
    expect(store.getState().enabledSources).toHaveLength(2);

    await store.getState().setSourceDisabled("registry", "broken", true);

    expect(store.getState().installedSources.map((s) => s.id).sort()).toEqual([
      "registry:broken",
      "registry:good",
    ]);
    expect(store.getState().enabledSources.map((s) => s.id)).toEqual([
      "registry:good",
    ]);
  });

  test("re-enabling restores the source to enabledSources without a reload", async () => {
    const source: InstalledSource = { ...installed("broken", 3), disabled: true };
    const { store } = createDisableHarness([source]);

    await store.getState().initialize();
    expect(store.getState().enabledSources).toEqual([]);

    await store.getState().setSourceDisabled("registry", "broken", false);

    expect(store.getState().enabledSources.map((s) => s.id)).toEqual([
      "registry:broken",
    ]);
  });

  test("is a no-op when the source is already in the requested state", async () => {
    const source = installed("good", 5);
    const { store, saved } = createDisableHarness([source]);

    await store.getState().setSourceDisabled("registry", "good", false);

    expect(saved).toEqual([]);
  });

  test("getSource refuses a disabled source instead of returning null", async () => {
    const source: InstalledSource = {
      ...installed("broken", 1),
      name: "Broken Source",
      disabled: true,
    };
    const { store } = createDisableHarness([source]);
    // The guard reads warm state, so hydrate it the way initialize() would.
    await store.getState().initialize();

    await expect(
      store.getState().getSource("registry", "broken"),
    ).rejects.toThrow(/disabled/i);
  });
});
