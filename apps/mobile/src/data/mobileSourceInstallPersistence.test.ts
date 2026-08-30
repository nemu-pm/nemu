import { describe, expect, test } from "bun:test";
import type { InstalledSource, SourceRegistry } from "./schema";
import type { MobileDataStore } from "./storeTypes";
import { persistMobileRegistrySourceInstall } from "./mobileSourceInstallPersistence";

const registry: SourceRegistry = {
  id: "registry",
  name: "Registry",
  type: "url",
  url: "https://example.test/index.json",
};

const source: InstalledSource = {
  id: "registry:source",
  registryId: "registry",
  sourceId: "source",
  version: 2,
  updatedAt: 20,
  removed: false,
};

function storeWith(
  overrides: Partial<MobileDataStore>,
): MobileDataStore {
  return overrides as MobileDataStore;
}

describe("mobile source install persistence", () => {
  test("blocks before any persistence while account cleanup is pending", async () => {
    const calls: string[] = [];
    const store = storeWith({
      saveRegistry: async () => {
        calls.push("registry");
      },
      saveInstalledSource: async () => {
        calls.push("source");
      },
    });

    await expect(
      persistMobileRegistrySourceInstall({
        store,
        registry,
        source,
        isAccountMutationBlocked: () => true,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(calls).toEqual([]);
  });

  test("rechecks the account fence after registry persistence yields", async () => {
    const calls: string[] = [];
    let blocked = false;
    const store = storeWith({
      saveRegistry: async () => {
        calls.push("registry");
        blocked = true;
      },
      saveInstalledSource: async () => {
        calls.push("source");
      },
    });

    await expect(
      persistMobileRegistrySourceInstall({
        store,
        registry,
        source,
        isAccountMutationBlocked: () => blocked,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(calls).toEqual(["registry"]);
  });

  test("uses revision-CAS for auto-updates and reports a stale update as skipped", async () => {
    const calls: unknown[] = [];
    const store = storeWith({
      saveRegistry: async () => undefined,
      saveInstalledSource: async () => {
        throw new Error("unconditional save must not run");
      },
      saveInstalledSourceIfCurrent: async (...args) => {
        calls.push(args);
        return false;
      },
    });

    await expect(
      persistMobileRegistrySourceInstall({
        store,
        registry,
        source,
        updateOnly: true,
        expectedInstalledUpdatedAt: 10,
      }),
    ).resolves.toBe(false);
    expect(calls).toEqual([[source, 10]]);
  });

  test("fails closed when an auto-update store cannot provide revision-CAS", async () => {
    let saved = false;
    const store = storeWith({
      saveRegistry: async () => undefined,
      saveInstalledSource: async () => {
        saved = true;
      },
    });

    await expect(
      persistMobileRegistrySourceInstall({
        store,
        registry,
        source,
        updateOnly: true,
        expectedInstalledUpdatedAt: 10,
      }),
    ).resolves.toBe(false);
    expect(saved).toBe(false);
  });

  test("honors an aborted install before writing", async () => {
    const controller = new AbortController();
    controller.abort();
    const store = storeWith({
      saveRegistry: async () => {
        throw new Error("must not write");
      },
      saveInstalledSource: async () => {
        throw new Error("must not write");
      },
    });

    await expect(
      persistMobileRegistrySourceInstall({
        store,
        registry,
        source,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
