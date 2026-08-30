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
