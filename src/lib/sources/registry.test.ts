import { describe, expect, test } from "bun:test";
import type { SourceRegistry } from "@/data/schema";
import type { CacheStore } from "@/data/cache";
import type { SourceSettingsStore } from "@/stores/source-settings";
import { RegistryManager } from "./registry";

function setup(initial: SourceRegistry[] = []) {
  const rows = new Map(initial.map((row) => [row.id, row]));
  const registryStore = {
    getRegistries: async () => [...rows.values()],
    getRegistry: async (id: string) => rows.get(id) ?? null,
    saveRegistry: async (row: SourceRegistry) => void rows.set(row.id, row),
    removeRegistry: async (id: string) => void rows.delete(id),
  };
  const installedStore = {
    saveInstalledSource: async () => {},
    getInstalledSource: async () => null,
  };
  const manager = new RegistryManager(
    registryStore,
    installedStore,
    {} as CacheStore,
    {} as SourceSettingsStore,
  );
  return { rows, manager };
}

const dir = (id: string, over: Record<string, unknown> = {}): SourceRegistry =>
  ({ id, name: id, type: "url", url: `https://${id}.example.com/index.min.json`, ...over }) as SourceRegistry;

describe("RegistryManager directories", () => {
  test("ships nemu recommended next to the legacy Aidoku directories", () => {
    const { manager } = setup();
    expect(manager.getAllRegistries().map((r) => r.info.id)).toEqual([
      "nemu-recommended",
      "aidoku-community",
      "aidoku-zh",
    ]);
  });

  test("follows synced rows: added, renamed, disabled (loadable, unlisted), dropped", async () => {
    const { rows, manager } = setup([dir("a"), dir("b", { disabled: true })]);
    await manager.initialize();
    expect((manager.getRegistry("a")?.info as { url?: string } | undefined)?.url).toBe("https://a.example.com/index.min.json");
    expect(manager.getRegistry("b")).not.toBeNull();
    const listed: string[] = [];
    (manager as unknown as { registries: Map<string, { listSources: () => Promise<unknown[]> }> }).registries.forEach(
      (registry, id) => {
        registry.listSources = async () => {
          listed.push(id);
          return [];
        };
      },
    );
    await manager.listAllSources();
    expect(listed).toContain("a");
    expect(listed).not.toContain("b");
    expect(listed).not.toContain("nemu-recommended");
    expect(manager.getRegistry("nemu-recommended")).not.toBeNull();

    rows.set("a", dir("a", { url: "https://moved.example.com/index.min.json" }));
    rows.delete("b");
    await manager.reloadDirectories();
    expect((manager.getRegistry("a")?.info as { url?: string } | undefined)?.url).toBe("https://moved.example.com/index.min.json");
    expect(manager.getRegistry("b")).toBeNull();
  });

  test("local edits stamp a clock, removal keeps a tombstone, built-ins are protected", async () => {
    const { rows, manager } = setup();
    let changes = 0;
    manager.onDirectoriesChanged(() => (changes += 1));
    await manager.addRegistry(dir("a"));
    const added = rows.get("a") as Extract<SourceRegistry, { type: "url" }>;
    expect(added.updatedAt).toBeGreaterThan(0);
    await manager.setRegistryEnabled("a", false);
    expect(rows.get("a")).toMatchObject({ disabled: true });
    await manager.removeRegistry("a");
    const removed = rows.get("a") as Extract<SourceRegistry, { type: "url" }>;
    expect(removed.removed).toBe(true);
    expect(removed.updatedAt!).toBeGreaterThan(added.updatedAt!);
    // Still loadable for its installed sources.
    expect(manager.getRegistry("a")).not.toBeNull();
    await manager.removeRegistry("nemu-recommended");
    await manager.addRegistry(dir("aidoku-community"));
    expect(rows.has("nemu-recommended")).toBe(false);
    expect(rows.has("aidoku-community")).toBe(false);
    expect(changes).toBe(3);
  });
});
