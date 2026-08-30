import { describe, expect, test } from "bun:test";
import type { InstalledSource } from "@/data/schema";
import {
  buildMobileSourcePackageLoadPlan,
  getMobileSourceKind,
  normalizeInstalledSource,
  resolveMobileSourcePackageCacheKey,
} from "./mobileSourceRuntime";

describe("mobile source runtime package planning", () => {
  test("normalizes installed source metadata", () => {
    const source: InstalledSource = {
      id: "aidoku-community:en.example",
      registryId: "aidoku-community",
      sourceId: "en.example",
      name: "Example",
      languages: ["en"],
      hasAuthentication: true,
      hasCloudflare: true,
      version: 2,
      packageUri: "file:///cache/example.aix",
      packageCacheKey: "aix:aidoku-community:en.example",
      packageMetadata: {
        sourceId: "en.example",
        name: "Example",
        version: 2,
        languages: ["en"],
        listings: [{ id: "popular", name: "Popular" }],
        filters: [],
        settings: [],
        hasWasm: true,
      },
    };

    expect(normalizeInstalledSource(source)).toMatchObject({
      id: "aidoku-community:en.example",
      registryId: "aidoku-community",
      sourceId: "en.example",
      sourceKind: "aidoku",
      name: "Example",
      version: 2,
      languages: ["en"],
      hasAuthentication: true,
      hasCloudflare: true,
      packageUri: "file:///cache/example.aix",
      packageCacheKey: "aix:aidoku-community:en.example",
      packageMetadata: {
        listings: [{ id: "popular", name: "Popular" }],
      },
    });
  });

  test("falls back to decoded source keys for older installed records", () => {
    expect(
      normalizeInstalledSource({
        id: "aidoku-community:en.legacy%3Avariant",
        registryId: "aidoku-community",
        version: 1,
      }),
    ).toMatchObject({
      registryId: "aidoku-community",
      sourceKind: "aidoku",
      sourceId: "en.legacy:variant",
      name: "en.legacy:variant",
    });
  });

  test("detects Tachiyomi sources from registry and explicit source kind", () => {
    const local: InstalledSource = {
      id: "tachiyomi-local:en.mangapill",
      registryId: "tachiyomi-local",
      sourceId: "en.mangapill",
      name: "MangaPill",
      version: 1,
    };
    const explicit: InstalledSource = {
      id: "community:en.example",
      registryId: "community",
      sourceKind: "tachiyomi",
      sourceId: "en.example",
      name: "Example",
      version: 1,
    };

    expect(getMobileSourceKind(local)).toBe("tachiyomi");
    expect(getMobileSourceKind(explicit)).toBe("tachiyomi");
    expect(normalizeInstalledSource(local)).toMatchObject({
      sourceKind: "tachiyomi",
      sourceId: "en.mangapill",
    });
  });

  test("blocks missing source packages before runtime creation", () => {
    const aidoku = normalizeInstalledSource({
      id: "aidoku-community:en.example",
      registryId: "aidoku-community",
      sourceId: "en.example",
      version: 2,
    });
    const tachiyomi = normalizeInstalledSource({
      id: "tachiyomi-local:en.mangapill",
      registryId: "tachiyomi-local",
      sourceKind: "tachiyomi",
      sourceId: "en.mangapill",
      version: 1,
    });

    expect(buildMobileSourcePackageLoadPlan(null)).toMatchObject({
      status: "blocked",
      sourceKey: null,
      reason: "source-missing",
    });
    expect(buildMobileSourcePackageLoadPlan(aidoku)).toMatchObject({
      status: "blocked",
      sourceKey: "aidoku-community:en.example",
      reason: "package-missing",
    });
    expect(buildMobileSourcePackageLoadPlan(tachiyomi)).toMatchObject({
      status: "blocked",
      sourceKey: "tachiyomi-local:en.mangapill",
      reason: "package-missing",
      detail: expect.stringContaining("Tachiyomi extension package bytes"),
    });
  });

  test("builds a load plan for cached Aidoku packages", () => {
    const source = normalizeInstalledSource({
      id: "aidoku-community:en.example",
      registryId: "aidoku-community",
      sourceId: "en.example",
      version: 2,
      packageUri: "file:///cache/example.aix",
      packageCacheKey: "aix:aidoku-community:en.example",
      packageMetadata: {
        sourceId: "en.example",
        name: "Example",
        version: 2,
        listings: [],
        filters: [],
        settings: [],
        hasWasm: true,
      },
    });

    expect(resolveMobileSourcePackageCacheKey(source)).toBe(
      "aix:aidoku-community:en.example",
    );
    expect(buildMobileSourcePackageLoadPlan(source)).toEqual({
      status: "ready",
      sourceKey: "aidoku-community:en.example",
      packageUri: "file:///cache/example.aix",
      packageCacheKey: "aix:aidoku-community:en.example",
      expectedSourceId: "en.example",
      expectedSourceIds: ["en.example"],
      expectedVersion: 2,
    });
  });

  test("builds a load plan for cached Tachiyomi extensions", () => {
    const source = normalizeInstalledSource({
      id: "tachiyomi-local:en.mangapill",
      registryId: "tachiyomi-local",
      sourceId: "en.mangapill",
      sourceKind: "tachiyomi",
      name: "MangaPill",
      version: 1,
      packageUri: "file:///cache/mangapill.js",
      packageCacheKey: "tachiyomi:tachiyomi-local:en.mangapill",
    });

    expect(resolveMobileSourcePackageCacheKey(source)).toBe(
      "tachiyomi:tachiyomi-local:en.mangapill",
    );
    expect(buildMobileSourcePackageLoadPlan(source)).toEqual({
      status: "ready",
      sourceKey: "tachiyomi-local:en.mangapill",
      packageUri: "file:///cache/mangapill.js",
      packageCacheKey: "tachiyomi:tachiyomi-local:en.mangapill",
      expectedSourceId: "en.mangapill",
      expectedSourceIds: ["en.mangapill"],
      expectedVersion: 1,
    });
  });

  test("derives package cache keys for legacy installed records", () => {
    const aidoku = normalizeInstalledSource({
      id: "aidoku-community:registry-id",
      registryId: "aidoku-community",
      sourceId: "manifest.id",
      version: 1,
      packageUri: "file:///cache/legacy.aix",
    });
    const tachiyomi = normalizeInstalledSource({
      id: "tachiyomi-local:en.legacy",
      registryId: "tachiyomi-local",
      sourceKind: "tachiyomi",
      sourceId: "en.legacy",
      version: 1,
      packageUri: "file:///cache/legacy.js",
    });

    expect(resolveMobileSourcePackageCacheKey(aidoku)).toBe(
      "aix:aidoku-community:registry-id",
    );
    expect(resolveMobileSourcePackageCacheKey(tachiyomi)).toBe(
      "tachiyomi:tachiyomi-local:en.legacy",
    );
    expect(buildMobileSourcePackageLoadPlan(aidoku)).toMatchObject({
      status: "ready",
      sourceKey: "aidoku-community:manifest.id",
      expectedSourceId: "registry-id",
      expectedSourceIds: ["registry-id"],
    });
  });

  test("derives encoded cache keys while validating decoded installed aliases", () => {
    const source = normalizeInstalledSource({
      id: "aidoku-community:registry%3Aid",
      registryId: "aidoku-community",
      sourceId: "manifest.id",
      version: 1,
      packageUri: "file:///cache/legacy.aix",
    });

    expect(resolveMobileSourcePackageCacheKey(source)).toBe(
      "aix:aidoku-community:registry%3Aid",
    );
    expect(buildMobileSourcePackageLoadPlan(source)).toMatchObject({
      status: "ready",
      sourceKey: "aidoku-community:manifest.id",
      expectedSourceIds: ["registry:id"],
      expectedVersion: 1,
    });
  });

  test("blocks an AIX package without its WebAssembly payload", () => {
    const source = normalizeInstalledSource({
      id: "aidoku-community:en.metadata",
      registryId: "aidoku-community",
      sourceId: "en.metadata",
      version: 2,
      packageUri: "file:///cache/metadata.aix",
      packageMetadata: {
        sourceId: "en.metadata",
        name: "Metadata Only",
        version: 2,
        listings: [{ id: "popular", name: "Popular" }],
        filters: [],
        settings: [],
        hasWasm: false,
      },
    });

    expect(buildMobileSourcePackageLoadPlan(source)).toMatchObject({
      status: "blocked",
      reason: "wasm-missing",
    });
  });
});
