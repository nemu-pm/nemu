import { describe, expect, test } from "bun:test";
import { strToU8, zipSync } from "fflate";
import type { InstalledSource } from "@/data/schema";
import {
  createMobileSourceExecutorSession,
  type MobileAidokuExecutorBridge,
  type MobileAidokuExecutorSource,
  type MobileAidokuExecutorLoadInput,
} from "./mobileSourceExecutor";
import { normalizeInstalledSource } from "./mobileSourceRuntime";

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

function tachiyomiSource(overrides: Partial<InstalledSource> = {}) {
  return normalizeInstalledSource({
    id: "tachiyomi-local:en.example",
    registryId: "tachiyomi-local",
    sourceId: "en.example",
    version: 1,
    packageUri: "file:///cache/example.apk",
    packageCacheKey: "tachiyomi:en.example",
    ...overrides,
  });
}

function makeExecutorSource(): MobileAidokuExecutorSource {
  return {
    id: "en.example",
    async getSearchMangaList() {
      return { entries: [], hasNextPage: false };
    },
    async getMangaDetails(manga) {
      return manga;
    },
    async getChapterList() {
      return [];
    },
    async getPageList() {
      return [];
    },
    async getFilters() {
      return [];
    },
    async getListings() {
      return [];
    },
    async getMangaListForListing() {
      return { entries: [], hasNextPage: false };
    },
    async hasListingProvider() {
      return false;
    },
    async hasHomeProvider() {
      return false;
    },
    async hasListings() {
      return false;
    },
    async isOnlySearch() {
      return true;
    },
    async handlesBasicLogin() {
      return false;
    },
    async handlesWebLogin() {
      return false;
    },
    async getHome() {
      return null;
    },
    async getHomeWithPartials() {
      return null;
    },
    async modifyImageRequest(url) {
      return { url, headers: {} };
    },
    async hasImageProcessor() {
      return false;
    },
    async processPageImage() {
      return null;
    },
    updateSettings() {},
    dispose() {},
  };
}

describe("createMobileSourceExecutorSession", () => {
  test("validates package bytes before handing source load to the native bridge", async () => {
    const bridgeInputs: MobileAidokuExecutorLoadInput[] = [];
    const bridge: MobileAidokuExecutorBridge = {
      async loadSource(input) {
        bridgeInputs.push(input);
        return {
          status: "ready",
          runtime: "native-aidoku",
          source: makeExecutorSource(),
        };
      },
    };

    const bytes = makeAixPackage();
    const session = await createMobileSourceExecutorSession(installedSource(), {
      bridge,
      readBytes: async () => bytes,
      settings: { quality: "high" },
      executionScope: "profile:account-a",
    });

    expect(session).toMatchObject({
      status: "ready",
      sourceKey: "aidoku-community:en.example",
      runtime: "native-aidoku",
      metadata: {
        sourceId: "en.example",
        version: 2,
        hasWasm: true,
      },
    });
    const bridgeInput = bridgeInputs[0];
    expect(bridgeInput).toMatchObject({
      sourceKey: "profile:account-a::aidoku-community:en.example",
      packageCacheKey: "aix:aidoku-community:en.example",
      packageUri: "file:///cache/example.aix",
      byteLength: bytes.byteLength,
      metadata: {
        sourceId: "en.example",
        version: 2,
      },
      settings: { quality: "high" },
    });
    expect(bridgeInput?.bytes).toBe(bytes);
  });

  test("does not copy AIX bytes into JS for a native-file sandbox bridge", async () => {
    const bridgeInputs: MobileAidokuExecutorLoadInput[] = [];
    let reads = 0;
    const bridge: MobileAidokuExecutorBridge = {
      packageLoadMode: "native-file",
      async loadSource(input) {
        bridgeInputs.push(input);
        return {
          status: "ready",
          runtime: "native-aidoku",
          source: makeExecutorSource(),
        };
      },
    };

    const session = await createMobileSourceExecutorSession(installedSource(), {
      bridge,
      resolvePackageUri: async () => "file:///cache/example.aix",
      readBytes: async () => {
        reads += 1;
        return makeAixPackage();
      },
    });

    expect(session).toMatchObject({ status: "ready", runtime: "native-aidoku" });
    expect(bridgeInputs[0]).not.toHaveProperty("bytes");
    expect(bridgeInputs[0]).not.toHaveProperty("byteLength");
    expect(reads).toBe(0);
  });

  test("hydrates missing package bytes before loading the native bridge", async () => {
    const bridgeInputs: MobileAidokuExecutorLoadInput[] = [];
    const bridge: MobileAidokuExecutorBridge = {
      async loadSource(input) {
        bridgeInputs.push(input);
        return {
          status: "ready",
          runtime: "native-aidoku",
          source: makeExecutorSource(),
        };
      },
    };
    const bytes = makeAixPackage();

    const session = await createMobileSourceExecutorSession(
      installedSource({
        downloadUrl: "https://example.test/example.aix",
        packageUri: null,
        packageCacheKey: null,
      }),
      {
        bridge,
        readBytes: async (key) => (key === ARTIFACT_CACHE_KEY ? bytes : null),
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

    expect(session).toMatchObject({
      status: "ready",
      sourceKey: "aidoku-community:en.example",
      sourcePackageHydration: {
        packageUri: "file:///cache/new.aix",
        packageCacheKey: ARTIFACT_CACHE_KEY,
        packageMetadata: {
          sourceId: "en.example",
          hasWasm: true,
        },
      },
    });
    expect(bridgeInputs[0]).toMatchObject({
      packageUri: "file:///cache/new.aix",
      packageCacheKey: ARTIFACT_CACHE_KEY,
    });
  });

  test("blocks with an explicit native bridge reason after package validation", async () => {
    await expect(
      createMobileSourceExecutorSession(installedSource(), {
        readBytes: async () => makeAixPackage(),
      })
    ).resolves.toMatchObject({
      status: "blocked",
      sourceKey: "aidoku-community:en.example",
      reason: "native-bridge-missing",
      metadata: {
        sourceId: "en.example",
      },
    });
  });

  test("does not call the bridge when package bytes are invalid", async () => {
    let bridgeCalls = 0;
    const bridge: MobileAidokuExecutorBridge = {
      async loadSource() {
        bridgeCalls += 1;
        return {
          status: "ready",
          runtime: "native-aidoku",
          source: makeExecutorSource(),
        };
      },
    };

    const session = await createMobileSourceExecutorSession(installedSource(), {
      bridge,
      readBytes: async () => new Uint8Array([1, 2, 3]),
    });

    expect(session).toMatchObject({
      status: "blocked",
      reason: "invalid-package",
    });
    expect(bridgeCalls).toBe(0);
  });

  test("normalizes bridge load failures into blocked executor sessions", async () => {
    const bridge: MobileAidokuExecutorBridge = {
      async loadSource() {
        throw new Error("native module unavailable");
      },
    };

    await expect(
      createMobileSourceExecutorSession(installedSource(), {
        bridge,
        readBytes: async () => makeAixPackage(),
      })
    ).resolves.toMatchObject({
      status: "blocked",
      sourceKey: "aidoku-community:en.example",
      reason: "bridge-load-failed",
      detail: "native module unavailable",
    });
  });

  test("keeps the bridge contract aligned with Aidoku runtime source methods", async () => {
    const bridge: MobileAidokuExecutorBridge = {
      async loadSource() {
        return {
          status: "ready",
          runtime: "native-aidoku",
          source: makeExecutorSource(),
        };
      },
    };

    const session = await createMobileSourceExecutorSession(installedSource(), {
      bridge,
      readBytes: async () => makeAixPackage(),
    });

    expect(session.status).toBe("ready");
    if (session.status === "ready") {
      await expect(session.source.getSearchMangaList(null, 1, [])).resolves.toEqual({
        entries: [],
        hasNextPage: false,
      });
      await expect(session.source.getFilters()).resolves.toEqual([]);
      await expect(session.source.getListings()).resolves.toEqual([]);
      await expect(session.source.getHome()).resolves.toBeNull();
      await expect(session.source.modifyImageRequest("https://example.test/page.jpg")).resolves.toEqual({
        url: "https://example.test/page.jpg",
        headers: {},
      });
    }
  });

  test("blocks Tachiyomi before reading an unusable cached APK", async () => {
    let reads = 0;
    await expect(
      createMobileSourceExecutorSession(tachiyomiSource(), {
        readBytes: async () => {
          reads += 1;
          return new Uint8Array(64 * 1024 * 1024);
        },
      }),
    ).resolves.toMatchObject({
      status: "blocked",
      sourceKey: "tachiyomi-local:en.example",
      reason: "native-bridge-missing",
      detail: expect.stringContaining("native Tachiyomi bridge"),
    });
    expect(reads).toBe(0);
  });
});
