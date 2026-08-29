import { describe, expect, test } from "bun:test";
import { strToU8, zipSync } from "fflate";
import {
  applyMobileSourcePackageHydration,
  loadMobileSourcePackage,
  mobileSourcePackageHydrationMatchesSource,
  notifyMobileSourcePackageHydrated,
  type MobileSourcePackageHydration,
} from "./mobileSourcePackageLoader";
import { normalizeInstalledSource } from "./mobileSourceRuntime";
import type { InstalledSource } from "@/data/schema";

const ARTIFACT_CACHE_KEY = `aix:${"a".repeat(64)}`;

function makeAixPackage(options: {
  sourceId?: string;
  version?: number;
  hasWasm?: boolean;
} = {}): Uint8Array {
  return zipSync({
    "Payload/source.json": strToU8(
      JSON.stringify({
        info: {
          id: options.sourceId ?? "en.example",
          name: "Example",
          version: options.version ?? 2,
          languages: ["en"],
        },
      })
    ),
    ...(options.hasWasm === false
      ? {}
      : { "Payload/main.wasm": new Uint8Array([0, 97, 115, 109]) }),
  });
}

function installedSource(overrides: Partial<InstalledSource> = {}) {
  return normalizeInstalledSource({
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
    ...overrides,
  });
}

describe("loadMobileSourcePackage", () => {
  test("reads and validates cached AIX package bytes", async () => {
    const bytes = makeAixPackage();
    const result = await loadMobileSourcePackage(installedSource(), async () => bytes);

    expect(result).toMatchObject({
      status: "ready",
      sourceKey: "aidoku-community:en.example",
      packageCacheKey: "aix:aidoku-community:en.example",
      byteLength: bytes.byteLength,
      metadata: {
        sourceId: "en.example",
        version: 2,
        hasWasm: true,
      },
    });
  });

  test("keeps a validated native-sandbox package entirely on disk", async () => {
    let reads = 0;
    const result = await loadMobileSourcePackage(
      installedSource(),
      async () => {
        reads += 1;
        throw new Error("native-file mode must not materialize package bytes");
      },
      {
        packageLoadMode: "native-file",
        resolvePackageUri: async () => "file:///cache/example.aix",
      },
    );

    expect(result).toMatchObject({
      status: "ready",
      sourceKey: "aidoku-community:en.example",
      packageUri: "file:///cache/example.aix",
      metadata: { sourceId: "en.example", hasWasm: true },
    });
    expect(result).not.toHaveProperty("bytes");
    expect(reads).toBe(0);
  });

  test("refreshes legacy filter metadata that discarded option values", async () => {
    const bytes = zipSync({
      "Payload/source.json": strToU8(
        JSON.stringify({
          info: {
            id: "en.example",
            name: "Example",
            version: 2,
            languages: ["en"],
          },
        }),
      ),
      "Payload/filters.json": strToU8(
        JSON.stringify([
          {
            id: "status",
            title: "Status",
            type: "multi-select",
            options: ["Ongoing", "Complete"],
          },
        ]),
      ),
      "Payload/main.wasm": new Uint8Array([0, 97, 115, 109]),
    });
    let reads = 0;
    const result = await loadMobileSourcePackage(
      installedSource({
        packageMetadata: {
          sourceId: "en.example",
          name: "Example",
          version: 2,
          listings: [],
          filters: [
            {
              id: "status",
              title: "Status",
              type: "multi-select",
              optionCount: 2,
            },
          ],
          settings: [],
          hasWasm: true,
        },
      }),
      async () => {
        reads += 1;
        return bytes;
      },
      {
        packageLoadMode: "native-file",
        resolvePackageUri: async () => "file:///cache/example.aix",
      },
    );

    expect(reads).toBe(1);
    expect(result).toMatchObject({
      status: "ready",
      metadata: {
        filters: [
          {
            id: "status",
            options: ["Ongoing", "Complete"],
          },
        ],
      },
      sourcePackageHydration: {
        packageMetadata: {
          filters: [
            {
              id: "status",
              options: ["Ongoing", "Complete"],
            },
          ],
        },
      },
    });
  });

  test("rebases a persisted package URI after the native data container moves", async () => {
    const result = await loadMobileSourcePackage(
      installedSource({
        packageUri: "file:///old-container/cache/example.aix",
      }),
      async () => {
        throw new Error("native-file mode must not materialize package bytes");
      },
      {
        packageLoadMode: "native-file",
        resolvePackageUri: async () =>
          "file:///current-container/cache/example.aix",
      },
    );

    expect(result).toMatchObject({
      status: "ready",
      packageUri: "file:///current-container/cache/example.aix",
      sourcePackageHydration: {
        packageUri: "file:///current-container/cache/example.aix",
        packageCacheKey: "aix:aidoku-community:en.example",
      },
    });
  });

  test("blocks when metadata points at missing bytes", async () => {
    await expect(loadMobileSourcePackage(installedSource(), async () => null)).resolves.toMatchObject({
      status: "blocked",
      reason: "bytes-missing",
    });
  });

  test("caches a missing AIX package on demand when a download URL is available", async () => {
    const bytes = makeAixPackage();
    const cacheCalls: string[] = [];
    const registryIdentities: Array<{ id: string; version: number }> = [];
    const result = await loadMobileSourcePackage(
      installedSource({
        downloadUrl: "https://example.test/example.aix",
        packageUri: null,
        packageCacheKey: null,
      }),
      async (key) => (key === ARTIFACT_CACHE_KEY ? bytes : null),
      {
        cachePackage: async (source) => {
          cacheCalls.push(source.downloadUrl ?? "");
          registryIdentities.push({ id: source.id, version: source.version });
          return {
            packageUri: "file:///cache/new.aix",
            packageCacheKey: ARTIFACT_CACHE_KEY,
            metadata: {
              sourceId: "en.example",
              name: "Example",
              version: 2,
              listings: [],
              filters: [],
              settings: [],
              hasWasm: true,
            },
          };
        },
      },
    );

    expect(cacheCalls).toEqual(["https://example.test/example.aix"]);
    expect(registryIdentities).toEqual([{ id: "en.example", version: 2 }]);
    expect(result).toMatchObject({
      status: "ready",
      packageUri: "file:///cache/new.aix",
      packageCacheKey: ARTIFACT_CACHE_KEY,
      sourcePackageHydration: {
        sourceId: "en.example",
        name: "Example",
        packageUri: "file:///cache/new.aix",
        packageCacheKey: ARTIFACT_CACHE_KEY,
        packageMetadata: {
          sourceId: "en.example",
          hasWasm: true,
        },
      },
    });
  });

  test("repairs from the durable installed identity and registry version", async () => {
    const bytes = makeAixPackage({ sourceId: "registry-id", version: 7 });
    const requested: Array<{ id: string; version: number }> = [];
    const result = await loadMobileSourcePackage(
      installedSource({
        id: "aidoku-community:registry-id",
        sourceId: "stale.metadata-id",
        version: 7,
        downloadUrl: "https://example.test/registry-id.aix",
        packageUri: null,
        packageCacheKey: null,
        packageMetadata: {
          sourceId: "stale.metadata-id",
          name: "Stale",
          version: 6,
          listings: [],
          filters: [],
          settings: [],
          hasWasm: true,
        },
      }),
      async (key) => (key === ARTIFACT_CACHE_KEY ? bytes : null),
      {
        cachePackage: async (source) => {
          requested.push({ id: source.id, version: source.version });
          return {
            packageUri: "file:///cache/registry-id.aix",
            packageCacheKey: ARTIFACT_CACHE_KEY,
            metadata: {
              sourceId: "registry-id",
              name: "Registry identity",
              version: 7,
              listings: [],
              filters: [],
              settings: [],
              hasWasm: true,
            },
          };
        },
      },
    );

    expect(requested).toEqual([{ id: "registry-id", version: 7 }]);
    expect(result).toMatchObject({
      status: "ready",
      metadata: { sourceId: "registry-id", version: 7 },
    });
  });

  test("repairs stale package cache metadata on demand when local bytes are missing", async () => {
    const bytes = makeAixPackage();
    const result = await loadMobileSourcePackage(
      installedSource({
        downloadUrl: "https://example.test/example.aix",
        packageUri: "file:///cache/old.aix",
        packageCacheKey: "aix:old",
      }),
      async (key) => (key === ARTIFACT_CACHE_KEY ? bytes : null),
      {
        cachePackage: async () => ({
          packageUri: "file:///cache/new.aix",
          packageCacheKey: ARTIFACT_CACHE_KEY,
          metadata: {
            sourceId: "en.example",
            name: "Example",
            version: 2,
            listings: [],
            filters: [],
            settings: [],
            hasWasm: true,
          },
        }),
      },
    );

    expect(result).toMatchObject({
      status: "ready",
      packageUri: "file:///cache/new.aix",
      packageCacheKey: ARTIFACT_CACHE_KEY,
    });
  });

  test("blocks invalid or mismatched packages before runtime execution", async () => {
    await expect(
      loadMobileSourcePackage(installedSource(), async () => new Uint8Array([1, 2, 3]))
    ).resolves.toMatchObject({
      status: "blocked",
      reason: "invalid-package",
    });

    await expect(
      loadMobileSourcePackage(installedSource(), async () =>
        makeAixPackage({ sourceId: "en.other" })
      )
    ).resolves.toMatchObject({
      status: "blocked",
      reason: "metadata-mismatch",
    });
  });

  test("accepts legacy packages whose source id matches the installed registry key", async () => {
    const result = await loadMobileSourcePackage(
      installedSource({
        id: "aidoku-community:registry-id",
        sourceId: "manifest.id",
        packageCacheKey: "aix:aidoku-community:registry-id",
        packageMetadata: undefined,
      }),
      async () => makeAixPackage({ sourceId: "registry-id" }),
    );

    expect(result).toMatchObject({
      status: "ready",
      sourceKey: "aidoku-community:manifest.id",
      packageCacheKey: "aix:aidoku-community:registry-id",
      metadata: {
        sourceId: "registry-id",
        hasWasm: true,
      },
    });
  });

  test("blocks cached packages without wasm payloads", async () => {
    await expect(
      loadMobileSourcePackage(
        installedSource({
          packageMetadata: {
            sourceId: "en.example",
            name: "Example",
            version: 2,
            listings: [],
            filters: [],
            settings: [],
            hasWasm: true,
          },
        }),
        async () => makeAixPackage({ hasWasm: false })
      )
    ).resolves.toMatchObject({
      status: "blocked",
      reason: "wasm-missing",
    });
  });
});

describe("source package hydration persistence", () => {
  const metadata = {
    sourceId: "en.example",
    name: "Example",
    version: 2,
    languages: ["en"],
    listings: [],
    filters: [],
    settings: [],
    hasWasm: true,
  } satisfies NonNullable<InstalledSource["packageMetadata"]>;
  const hydration: MobileSourcePackageHydration = {
    sourceKind: "aidoku",
    sourceId: "en.example",
    name: "Example",
    languages: ["en"],
    packageUri: "file:///cache/example.aix",
    packageCacheKey: "aix:aidoku-community:en.example",
    packageMetadata: metadata,
  };

  function persistedSource(
    overrides: Partial<InstalledSource> = {},
  ): InstalledSource {
    return {
      id: "aidoku-community:en.example",
      registryId: "aidoku-community",
      sourceKind: "aidoku",
      sourceId: "en.example",
      name: "Example",
      languages: ["en"],
      packageUri: "file:///cache/example.aix",
      packageCacheKey: "aix:aidoku-community:en.example",
      // Deliberately use a different property order from `metadata`: native
      // persistence reconstructs this object and must not retrigger hydration.
      packageMetadata: {
        hasWasm: true,
        settings: [],
        filters: [],
        listings: [],
        languages: ["en"],
        version: 2,
        name: "Example",
        sourceId: "en.example",
      },
      version: 2,
      updatedAt: 100,
      ...overrides,
    };
  }

  test("matches the complete persisted snapshot independent of object and key order", () => {
    const source = persistedSource();

    expect(mobileSourcePackageHydrationMatchesSource(source, hydration)).toBe(
      true,
    );
    expect(
      mobileSourcePackageHydrationMatchesSource(
        persistedSource({ languages: ["ja"] }),
        hydration,
      ),
    ).toBe(false);
    expect(
      mobileSourcePackageHydrationMatchesSource(
        persistedSource({
          packageMetadata: { ...metadata, version: 3 },
        }),
        hydration,
      ),
    ).toBe(false);
    expect(
      mobileSourcePackageHydrationMatchesSource(
        persistedSource({ removed: true }),
        hydration,
      ),
    ).toBe(false);
  });

  test("does not advance the sync clock for an already persisted hydration", () => {
    const source = persistedSource();

    expect(applyMobileSourcePackageHydration(source, hydration, 999)).toBe(
      source,
    );
    expect(source.updatedAt).toBe(100);
  });

  test("revives a matching package snapshot that is still tombstoned", () => {
    const source = persistedSource({ removed: true });
    const hydrated = applyMobileSourcePackageHydration(source, hydration, 999);

    expect(hydrated).not.toBe(source);
    expect(hydrated).toMatchObject({ removed: false, updatedAt: 999 });
  });

  test("notifies exactly when persistence is still required", async () => {
    const calls: Array<[InstalledSource, MobileSourcePackageHydration]> = [];
    const handler = (
      source: InstalledSource,
      nextHydration: MobileSourcePackageHydration,
    ) => {
      calls.push([source, nextHydration]);
    };

    await notifyMobileSourcePackageHydrated(
      persistedSource(),
      hydration,
      handler,
    );
    expect(calls).toHaveLength(0);

    const stale = persistedSource({
      packageUri: "file:///cache/stale.aix",
      packageCacheKey: "aix:stale",
    });
    await notifyMobileSourcePackageHydrated(stale, hydration, handler);
    expect(calls).toEqual([[stale, hydration]]);
  });
});
