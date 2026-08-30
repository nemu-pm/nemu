import { describe, expect, test } from "bun:test";
import type { InstalledSource } from "@/data/schema";
import {
  clearInstalledSourcePackageCache,
  sourceHasCachedPackage,
} from "./mobileDataManagement";

function source(overrides: Partial<InstalledSource> = {}): InstalledSource {
  return {
    id: "aidoku-community:en.example",
    registryId: "aidoku-community",
    sourceId: "en.example",
    version: 1,
    updatedAt: 100,
    ...overrides,
  };
}

describe("mobile data management helpers", () => {
  test("detects package cache references", () => {
    expect(sourceHasCachedPackage(source())).toBe(false);
    expect(sourceHasCachedPackage(source({ packageUri: "file:///cache/example.aix" }))).toBe(true);
    expect(sourceHasCachedPackage(source({ packageCacheKey: "aix:example" }))).toBe(true);
  });

  test("clears package cache pointers without removing source metadata", () => {
    const cleared = clearInstalledSourcePackageCache(source({
      name: "Example",
      packageUri: "file:///cache/example.aix",
      packageCacheKey: "aix:example",
    }));

    expect(cleared).toMatchObject({
      id: "aidoku-community:en.example",
      name: "Example",
      packageUri: null,
      packageCacheKey: null,
      updatedAt: 100,
    });
  });

  test("keeps uncached source objects stable", () => {
    const uncached = source({ name: "Example" });
    expect(clearInstalledSourcePackageCache(uncached)).toBe(uncached);
  });

});
