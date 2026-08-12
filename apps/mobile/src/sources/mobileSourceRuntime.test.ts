import { describe, expect, test } from "bun:test";
import {
  buildMobileSourcePackageLoadPlan,
  buildMobileSourceOperations,
  getMobileSourceKind,
  normalizeInstalledSource,
  probeInstalledSourceRuntime,
  resolveMobileSourcePackageCacheKey,
  summarizeMobileSourceOperations,
} from "./mobileSourceRuntime";
import type { InstalledSource } from "@/data/schema";

describe("mobile source runtime metadata", () => {
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

  test("falls back to the encoded source key for older installed records", () => {
    const source: InstalledSource = {
      id: "aidoku-community:en.legacy",
      registryId: "aidoku-community",
      version: 1,
    };

    expect(normalizeInstalledSource(source)).toMatchObject({
      registryId: "aidoku-community",
      sourceKind: "aidoku",
      sourceId: "en.legacy",
      name: "en.legacy",
    });
  });

  test("decodes reserved separators from older installed source keys", () => {
    const source: InstalledSource = {
      id: "aidoku-community:en.legacy%3Avariant",
      registryId: "aidoku-community",
      version: 1,
    };

    expect(normalizeInstalledSource(source)).toMatchObject({
      registryId: "aidoku-community",
      sourceKind: "aidoku",
      sourceId: "en.legacy:variant",
      name: "en.legacy:variant",
    });
  });

  test("detects Tachiyomi synced sources separately from Aidoku packages", () => {
    const source: InstalledSource = {
      id: "tachiyomi-local:en.mangapill",
      registryId: "tachiyomi-local",
      sourceId: "en.mangapill",
      name: "MangaPill",
      version: 1,
    };

    expect(getMobileSourceKind(source)).toBe("tachiyomi");
    expect(normalizeInstalledSource(source)).toMatchObject({
      registryId: "tachiyomi-local",
      sourceKind: "tachiyomi",
      sourceId: "en.mangapill",
      name: "MangaPill",
    });
    expect(probeInstalledSourceRuntime(source)).toMatchObject({
      sourceKind: "tachiyomi",
      status: "package-missing",
      packageUri: null,
    });
    expect(
      probeInstalledSourceRuntime({
        ...source,
        packageUri: "file:///cache/tachiyomi-extension.zip",
      })
    ).toMatchObject({
      sourceKind: "tachiyomi",
      status: "requires-runtime-port",
      packageUri: "file:///cache/tachiyomi-extension.zip",
      detail: expect.stringContaining("isolated JavaScript runtime"),
    });
  });

  test("honors explicit Tachiyomi source kind beyond the local registry", () => {
    const source: InstalledSource = {
      id: "tachiyomi-community:en.example",
      registryId: "tachiyomi-community",
      sourceKind: "tachiyomi",
      sourceId: "en.example",
      name: "Example",
      version: 1,
    };

    expect(getMobileSourceKind(source)).toBe("tachiyomi");
    expect(normalizeInstalledSource(source)).toMatchObject({
      registryId: "tachiyomi-community",
      sourceKind: "tachiyomi",
      sourceId: "en.example",
      name: "Example",
    });
  });

  test("marks missing Tachiyomi packages as package-blocked before runtime validation", () => {
    const source = normalizeInstalledSource({
      id: "tachiyomi-local:en.mangapill",
      registryId: "tachiyomi-local",
      sourceId: "en.mangapill",
      name: "MangaPill",
      version: 1,
    });

    expect(buildMobileSourcePackageLoadPlan(source)).toMatchObject({
      status: "blocked",
      sourceKey: "tachiyomi-local:en.mangapill",
      reason: "package-missing",
      detail: expect.stringContaining("Tachiyomi extension package bytes"),
    });

    const operations = buildMobileSourceOperations(source);
    expect(operations.find((operation) => operation.key === "package")).toMatchObject({
      title: "Tachiyomi Extension",
      status: "requires-package",
      sourceKind: "tachiyomi",
      detail: expect.stringContaining("not cached"),
    });
    expect(operations.find((operation) => operation.key === "home")).toMatchObject({
      status: "unsupported",
      sourceKind: "tachiyomi",
    });
    expect(summarizeMobileSourceOperations(operations)).toEqual({
      ready: 0,
      metadataReady: 0,
      nativeCompatible: 0,
      runtimeBlocked: 0,
      packageBlocked: 9,
      unsupported: 1,
    });
  });

  test("builds a package load plan for cached Tachiyomi extensions", () => {
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

  test("keeps Tachiyomi static metadata visible while cached packages await runtime validation", () => {
    const source = normalizeInstalledSource({
      id: "tachiyomi-local:en.mangapill",
      registryId: "tachiyomi-local",
      sourceId: "en.mangapill",
      name: "MangaPill",
      version: 1,
      packageUri: "file:///cache/mangapill.js",
      packageCacheKey: "tachiyomi:tachiyomi-local:en.mangapill",
      packageMetadata: {
        sourceId: "en.mangapill",
        name: "MangaPill",
        version: 1,
        listings: [
          { id: "popular", name: "Popular" },
          { id: "latest", name: "Latest" },
        ],
        filters: [{ id: "genre", title: "Genre", type: "select", optionCount: 8 }],
        settings: [{ key: "source", title: "Source", type: "select", optionCount: 2 }],
        hasWasm: false,
      },
    });

    const operations = buildMobileSourceOperations(source);

    expect(operations.find((operation) => operation.key === "package")).toMatchObject({
      status: "metadata-ready",
      detail: expect.stringContaining("cached locally"),
    });
    expect(operations.find((operation) => operation.key === "settings")).toMatchObject({
      count: 1,
      status: "metadata-ready",
      sourceKind: "tachiyomi",
    });
    expect(operations.find((operation) => operation.key === "listings")).toMatchObject({
      count: 2,
      status: "metadata-ready",
      sourceKind: "tachiyomi",
    });
    expect(operations.find((operation) => operation.key === "filters")).toMatchObject({
      count: 1,
      status: "metadata-ready",
      sourceKind: "tachiyomi",
    });
    expect(operations.find((operation) => operation.key === "search")).toMatchObject({
      status: "requires-runtime",
    });
    expect(summarizeMobileSourceOperations(operations)).toEqual({
      ready: 4,
      metadataReady: 4,
      nativeCompatible: 0,
      runtimeBlocked: 5,
      packageBlocked: 0,
      unsupported: 1,
    });
  });

  test("marks cached Tachiyomi operations unsupported after a blocked executor probe", () => {
    const source = normalizeInstalledSource({
      id: "tachiyomi-local:en.mangapill",
      registryId: "tachiyomi-local",
      sourceId: "en.mangapill",
      name: "MangaPill",
      version: 1,
      packageUri: "file:///cache/mangapill.apk",
      packageCacheKey: "tachiyomi:tachiyomi-local:en.mangapill",
      packageMetadata: {
        sourceId: "en.mangapill",
        name: "MangaPill",
        version: 1,
        listings: [{ id: "popular", name: "Popular" }],
        filters: [],
        settings: [],
        hasWasm: false,
      },
    });

    const operations = buildMobileSourceOperations(source, {
      executorBlockedReason: "unsupported-package",
    });

    expect(operations.find((operation) => operation.key === "package")).toMatchObject({
      status: "metadata-ready",
    });
    expect(operations.find((operation) => operation.key === "listings")).toMatchObject({
      status: "metadata-ready",
    });
    expect(operations.find((operation) => operation.key === "search")).toMatchObject({
      status: "unsupported",
    });
    expect(summarizeMobileSourceOperations(operations)).toEqual({
      ready: 2,
      metadataReady: 2,
      nativeCompatible: 0,
      runtimeBlocked: 0,
      packageBlocked: 0,
      unsupported: 8,
    });
  });

  test("marks Tachiyomi runtime operations native-compatible after bridge readiness", () => {
    const source = normalizeInstalledSource({
      id: "tachiyomi-local:en.mangapill",
      registryId: "tachiyomi-local",
      sourceId: "en.mangapill",
      name: "MangaPill",
      version: 1,
      packageUri: "file:///cache/mangapill.js",
      packageCacheKey: "tachiyomi:tachiyomi-local:en.mangapill",
      packageMetadata: {
        sourceId: "en.mangapill",
        name: "MangaPill",
        version: 1,
        listings: [
          { id: "popular", name: "Popular" },
          { id: "latest", name: "Latest" },
        ],
        filters: [{ id: "genre", title: "Genre", type: "select", optionCount: 8 }],
        settings: [{ key: "source", title: "Source", type: "select", optionCount: 2 }],
        hasWasm: false,
      },
    });

    const operations = buildMobileSourceOperations(source, { executorReady: true });

    expect(operations.find((operation) => operation.key === "package")).toMatchObject({
      title: "Tachiyomi Extension",
      status: "native-compatible",
      sourceKind: "tachiyomi",
    });
    expect(operations.find((operation) => operation.key === "settings")).toMatchObject({
      count: 1,
      status: "metadata-ready",
    });
    expect(operations.find((operation) => operation.key === "listings")).toMatchObject({
      count: 2,
      status: "metadata-ready",
    });
    expect(operations.find((operation) => operation.key === "filters")).toMatchObject({
      count: 1,
      status: "metadata-ready",
    });
    expect(operations.find((operation) => operation.key === "home")).toMatchObject({
      status: "unsupported",
      sourceKind: "tachiyomi",
    });
    expect(operations.find((operation) => operation.key === "search")).toMatchObject({
      status: "native-compatible",
      sourceKind: "tachiyomi",
    });
    expect(operations.find((operation) => operation.key === "manga-details")).toMatchObject({
      status: "native-compatible",
      sourceKind: "tachiyomi",
    });
    expect(operations.find((operation) => operation.key === "chapters")).toMatchObject({
      status: "native-compatible",
      sourceKind: "tachiyomi",
    });
    expect(operations.find((operation) => operation.key === "pages")).toMatchObject({
      status: "native-compatible",
      sourceKind: "tachiyomi",
    });
    expect(operations.find((operation) => operation.key === "image-requests")).toMatchObject({
      status: "native-compatible",
      sourceKind: "tachiyomi",
    });
    expect(summarizeMobileSourceOperations(operations)).toEqual({
      ready: 9,
      metadataReady: 3,
      nativeCompatible: 6,
      runtimeBlocked: 0,
      packageBlocked: 0,
      unsupported: 1,
    });
  });

  test("reports cached Aidoku packages as runtime-port work", () => {
    expect(
      probeInstalledSourceRuntime({
        id: "aidoku-community:en.example",
        registryId: "aidoku-community",
        sourceId: "en.example",
        version: 2,
        packageUri: "file:///cache/example.aix",
        packageMetadata: {
          sourceId: "en.example",
          name: "Example",
          version: 2,
          listings: [],
          filters: [],
          settings: [],
          hasWasm: true,
        },
      })
    ).toMatchObject({
      sourceKind: "aidoku",
      status: "requires-runtime-port",
      packageUri: "file:///cache/example.aix",
    });
  });

  test("builds operation readiness from package metadata", () => {
    const source = normalizeInstalledSource({
      id: "aidoku-community:en.example",
      registryId: "aidoku-community",
      sourceId: "en.example",
      version: 2,
      packageUri: "file:///cache/example.aix",
      packageMetadata: {
        sourceId: "en.example",
        name: "Example",
        version: 2,
        listings: [{ id: "popular", name: "Popular" }],
        filters: [
          { id: "genre", title: "Genre", type: "select", optionCount: 12 },
          { id: "sort", title: "Sort", type: "sort", optionCount: 3 },
        ],
        settings: [
          {
            key: "reader",
            title: "Reader",
            type: "group",
            items: [
              { key: "quality", title: "Image Quality", type: "select", optionCount: 2 },
              { key: "compact", title: "Compact", type: "switch", default: false },
              { key: "help", title: "Help", type: "link", url: "https://example.com" },
            ],
          },
        ],
        hasWasm: true,
      },
    });

    const operations = buildMobileSourceOperations(source);

    expect(operations.find((operation) => operation.key === "package")).toMatchObject({
      status: "metadata-ready",
    });
    expect(operations.find((operation) => operation.key === "settings")).toMatchObject({
      count: 3,
      status: "metadata-ready",
    });
    expect(operations.find((operation) => operation.key === "listings")).toMatchObject({
      count: 1,
      status: "metadata-ready",
    });
    expect(operations.find((operation) => operation.key === "filters")).toMatchObject({
      count: 2,
      status: "metadata-ready",
    });
    expect(operations.find((operation) => operation.key === "search")).toMatchObject({
      status: "requires-runtime",
    });
    expect(summarizeMobileSourceOperations(operations)).toEqual({
      ready: 4,
      metadataReady: 4,
      nativeCompatible: 0,
      runtimeBlocked: 6,
      packageBlocked: 0,
      unsupported: 0,
    });
  });

  test("marks executable operations native-compatible after executor readiness", () => {
    const source = normalizeInstalledSource({
      id: "aidoku-community:en.example",
      registryId: "aidoku-community",
      sourceId: "en.example",
      version: 2,
      packageUri: "file:///cache/example.aix",
      packageMetadata: {
        sourceId: "en.example",
        name: "Example",
        version: 2,
        listings: [{ id: "popular", name: "Popular" }],
        filters: [],
        settings: [],
        hasWasm: true,
      },
    });

    const operations = buildMobileSourceOperations(source, { executorReady: true });

    expect(operations.find((operation) => operation.key === "package")).toMatchObject({
      status: "metadata-ready",
    });
    expect(operations.find((operation) => operation.key === "listings")).toMatchObject({
      status: "metadata-ready",
    });
    expect(operations.find((operation) => operation.key === "filters")).toMatchObject({
      status: "native-compatible",
    });
    expect(operations.find((operation) => operation.key === "search")).toMatchObject({
      status: "native-compatible",
    });
    expect(summarizeMobileSourceOperations(operations)).toEqual({
      ready: 10,
      metadataReady: 2,
      nativeCompatible: 8,
      runtimeBlocked: 0,
      packageBlocked: 0,
      unsupported: 0,
    });
  });

  test("builds a package load plan for native runtime execution", () => {
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

    expect(resolveMobileSourcePackageCacheKey(source)).toBe("aix:aidoku-community:en.example");
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

  test("derives package cache keys for older installed source records", () => {
    const source = normalizeInstalledSource({
      id: "aidoku-community:en.legacy",
      registryId: "aidoku-community",
      sourceId: "en.legacy",
      version: 1,
      packageUri: "file:///cache/legacy.aix",
    });

    expect(resolveMobileSourcePackageCacheKey(source)).toBe("aix:aidoku-community:en.legacy");
  });

  test("derives Tachiyomi package cache keys for older installed records", () => {
    const source = normalizeInstalledSource({
      id: "tachiyomi-local:en.legacy",
      registryId: "tachiyomi-local",
      sourceKind: "tachiyomi",
      sourceId: "en.legacy",
      version: 1,
      packageUri: "file:///cache/legacy.js",
    });

    expect(resolveMobileSourcePackageCacheKey(source)).toBe(
      "tachiyomi:tachiyomi-local:en.legacy",
    );
    expect(buildMobileSourcePackageLoadPlan(source)).toMatchObject({
      status: "ready",
      sourceKey: "tachiyomi-local:en.legacy",
      packageCacheKey: "tachiyomi:tachiyomi-local:en.legacy",
    });
  });

  test("derives old cache keys from installed ids when metadata source ids differ", () => {
    const source = normalizeInstalledSource({
      id: "aidoku-community:registry-id",
      registryId: "aidoku-community",
      sourceId: "manifest.id",
      version: 1,
      packageUri: "file:///cache/legacy.aix",
    });

    expect(resolveMobileSourcePackageCacheKey(source)).toBe("aix:aidoku-community:registry-id");
  });

  test("derives encoded cache keys from decoded installed id aliases", () => {
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

  test("keeps installed id source aliases available for legacy package validation", () => {
    const source = normalizeInstalledSource({
      id: "aidoku-community:registry-id",
      registryId: "aidoku-community",
      sourceId: "manifest.id",
      version: 1,
      packageUri: "file:///cache/legacy.aix",
    });

    expect(buildMobileSourcePackageLoadPlan(source)).toMatchObject({
      status: "ready",
      sourceKey: "aidoku-community:manifest.id",
      packageCacheKey: "aix:aidoku-community:registry-id",
      expectedSourceId: "registry-id",
      expectedSourceIds: ["registry-id"],
      expectedVersion: 1,
    });
  });

  test("marks all source operations package-blocked before install cache exists", () => {
    const source = normalizeInstalledSource({
      id: "aidoku-community:en.example",
      registryId: "aidoku-community",
      sourceId: "en.example",
      version: 2,
    });

    const summary = summarizeMobileSourceOperations(buildMobileSourceOperations(source));

    expect(summary).toEqual({
      ready: 0,
      metadataReady: 0,
      nativeCompatible: 0,
      runtimeBlocked: 0,
      packageBlocked: 10,
      unsupported: 0,
    });
  });

  test("marks executable operations unsupported when an AIX has no wasm payload", () => {
    const installedSource: InstalledSource = {
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
    };

    expect(probeInstalledSourceRuntime(installedSource)).toMatchObject({
      status: "unsupported",
    });

    const operations = buildMobileSourceOperations(normalizeInstalledSource(installedSource));
    expect(operations.find((operation) => operation.key === "listings")).toMatchObject({
      status: "metadata-ready",
    });
    expect(operations.find((operation) => operation.key === "search")).toMatchObject({
      status: "unsupported",
    });
  });

  test("distinguishes missing packages from missing installs", () => {
    expect(
      probeInstalledSourceRuntime({
        id: "aidoku-community:en.example",
        registryId: "aidoku-community",
        sourceId: "en.example",
        version: 2,
      }).status
    ).toBe("package-missing");

    expect(probeInstalledSourceRuntime(null).status).toBe("unsupported");
  });
});
