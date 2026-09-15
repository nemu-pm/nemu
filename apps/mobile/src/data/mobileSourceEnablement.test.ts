import { describe, expect, test } from "bun:test";
import type { InstalledSource } from "./schema";
import type { MobileDataStore } from "./storeTypes";
import { setMobileInstalledSourceDisabled } from "./mobileSourceEnablement";

function installedSource(
  overrides: Partial<InstalledSource> = {},
): InstalledSource {
  return {
    id: "aidoku-community:en.example",
    registryId: "aidoku-community",
    sourceId: "en.example",
    version: 2,
    updatedAt: 20,
    removed: false,
    ...overrides,
  };
}

function storeWith(
  existing: InstalledSource | null,
  saved: InstalledSource[],
): Pick<MobileDataStore, "getInstalledSource" | "saveInstalledSource"> {
  return {
    getInstalledSource: async () => existing,
    saveInstalledSource: async (source: InstalledSource) => {
      saved.push(source);
    },
  } as Pick<MobileDataStore, "getInstalledSource" | "saveInstalledSource">;
}

describe("mobile source enablement", () => {
  test("writes the toggle with a bumped sync clock and keeps every other field", async () => {
    const saved: InstalledSource[] = [];
    const existing = installedSource({
      name: "Example",
      packageCacheKey: "aix:aidoku-community:en.example",
    });

    await expect(
      setMobileInstalledSourceDisabled(
        storeWith(existing, saved),
        existing,
        true,
      ),
    ).resolves.toBe(true);

    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      id: "aidoku-community:en.example",
      name: "Example",
      packageCacheKey: "aix:aidoku-community:en.example",
      version: 2,
      removed: false,
      disabled: true,
    });
    // Uninstall bumps updatedAt off the sync clock so last-writer-wins can
    // resolve the change; a toggle has to do the same or a stale cloud record
    // silently re-enables the source.
    expect(saved[0]!.updatedAt).toBeGreaterThan(20);
  });

  test("evicts the live session only when disabling", async () => {
    const evicted: string[] = [];
    const off = installedSource({ disabled: true });

    await setMobileInstalledSourceDisabled(
      storeWith(installedSource(), []),
      installedSource(),
      true,
      (source) => evicted.push(`disable:${source.id}`),
    );
    await setMobileInstalledSourceDisabled(storeWith(off, []), off, false, (source) =>
      evicted.push(`enable:${source.id}`),
    );

    expect(evicted).toEqual(["disable:aidoku-community:en.example"]);
  });

  test("re-enabling clears the flag rather than deleting the record", async () => {
    const saved: InstalledSource[] = [];
    const off = installedSource({ disabled: true, updatedAt: 40 });

    await setMobileInstalledSourceDisabled(storeWith(off, saved), off, false);

    expect(saved[0]).toMatchObject({ disabled: false, removed: false });
    expect(saved[0]!.updatedAt).toBeGreaterThan(40);
  });

  test("skips the write when the source is already in the requested state", async () => {
    const saved: InstalledSource[] = [];
    const source = installedSource();

    await expect(
      setMobileInstalledSourceDisabled(storeWith(source, saved), source, false),
    ).resolves.toBe(false);
    expect(saved).toEqual([]);
  });

  test("falls back to the passed record when the store has no row yet", async () => {
    const saved: InstalledSource[] = [];
    const source = installedSource();

    await expect(
      setMobileInstalledSourceDisabled(storeWith(null, saved), source, true),
    ).resolves.toBe(true);
    expect(saved[0]).toMatchObject({ disabled: true });
  });
});
