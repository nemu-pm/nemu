import { describe, expect, test } from "bun:test";
import type { InstalledSource } from "@/data/schema";
import { mergeMobileInstalledSources } from "./mobileSyncSnapshots";

function installedSource(
  overrides: Partial<InstalledSource> = {},
): InstalledSource {
  return {
    id: "aidoku-community:multi.mangadex",
    registryId: "aidoku-community",
    sourceKind: "aidoku",
    sourceId: "multi.mangadex",
    name: "MangaDex",
    downloadUrl: "https://example.test/mangadex.aix",
    version: 1,
    updatedAt: 10,
    removed: false,
    ...overrides,
  };
}

const cachedPackage = {
  packageUri: "file:///cache/mangadex.aix",
  packageCacheKey: "aix:aidoku-community:multi.mangadex",
  packageMetadata: {
    sourceId: "multi.mangadex",
    name: "MangaDex",
    version: 1,
    listings: [],
    filters: [],
    settings: [],
    hasWasm: true,
  },
} satisfies Partial<InstalledSource>;

describe("mergeMobileInstalledSources", () => {
  test("keeps a valid local package across metadata-only cloud updates", () => {
    const [merged] = mergeMobileInstalledSources(
      [installedSource(cachedPackage)],
      [installedSource({ name: "MangaDex renamed", updatedAt: 20 })],
    );

    expect(merged).toMatchObject({
      name: "MangaDex renamed",
      ...cachedPackage,
    });
  });

  test.each([
    ["version", { version: 2 }],
    ["download URL", { downloadUrl: "https://example.test/mangadex-v2.aix" }],
    ["source id", { sourceId: "multi.mangadex-v2" }],
    ["source kind", { sourceKind: "tachiyomi" as const }],
  ])(
    "invalidates old package bytes when cloud changes the %s",
    (_label, change) => {
      const [merged] = mergeMobileInstalledSources(
        [installedSource(cachedPackage)],
        [installedSource({ ...change, updatedAt: 20 })],
      );

      expect(merged).toMatchObject(change);
      expect(merged?.packageUri).toBeNull();
      expect(merged?.packageCacheKey).toBeNull();
      expect(merged?.packageMetadata).toBeNull();
    },
  );

  test("keeps the package when a newer local install wins", () => {
    const local = installedSource({ ...cachedPackage, version: 2, updatedAt: 30 });
    const [merged] = mergeMobileInstalledSources(
      [local],
      [installedSource({ version: 1, updatedAt: 20 })],
    );

    expect(merged).toEqual(local);
  });
});
