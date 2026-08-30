import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { strToU8, zipSync } from "fflate";
import type { InstalledSource } from "@/data/schema";
import {
  clearMobileSourceImageRequestCache,
  makeMobileSourceImageRequestCacheKey,
  resolveCachedMobileSourceImageRequest,
  resolveMobileSourceImageRequest,
} from "./mobileSourceImages";
import { defaultMobileSourceSessionCache } from "./mobileSourceExecutorCache";
import type {
  MobileAidokuExecutorBridge,
  MobileAidokuExecutorSource,
} from "./mobileSourceExecutor";
import { getMobileImageCacheSourceKey } from "@/lib/mobileImageCache";

function makeAixPackage(): Uint8Array {
  return zipSync({
    "Payload/source.json": strToU8(
      JSON.stringify({
        info: {
          id: "en.example",
          name: "Example",
          version: 2,
          languages: ["en"],
        },
      })
    ),
    "Payload/main.wasm": new Uint8Array([0, 97, 115, 109]),
  });
}

function installedSource(overrides: Partial<InstalledSource> = {}): InstalledSource {
  return {
    id: "aidoku-community:en.example",
    registryId: "aidoku-community",
    sourceId: "en.example",
    name: "Example",
    version: 2,
    packageUri: "file:///cache/example.aix",
    packageCacheKey: "aix:aidoku-community:en.example",
    packageMetadata: {
      sourceId: "en.example",
      name: "Example",
      version: 2,
      listings: [],
      filters: [],
      settings: [
        {
          key: "referer",
          title: "Referer",
          type: "text",
          default: "https://default.test",
        },
      ],
      hasWasm: true,
    },
    ...overrides,
  };
}

function makeExecutorSource(
  overrides: Partial<MobileAidokuExecutorSource> = {},
): MobileAidokuExecutorSource {
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
    ...overrides,
  };
}

describe("mobile source images", () => {
  beforeEach(async () => {
    clearMobileSourceImageRequestCache();
    await defaultMobileSourceSessionCache.clear();
  });

  afterEach(async () => {
    clearMobileSourceImageRequestCache();
    await defaultMobileSourceSessionCache.clear();
  });

  test("resolves cover image request metadata with source settings", async () => {
    let loadedSettings: Record<string, unknown> | null = null;
    let disposed = false;
    const bridge: MobileAidokuExecutorBridge = {
      async loadSource(input) {
        loadedSettings = input.settings;
        return {
          status: "ready",
          runtime: "native-aidoku",
          source: makeExecutorSource({
            async modifyImageRequest(url) {
              return {
                url: `${url}?token=source`,
                headers: { Referer: String(input.settings.referer) },
              };
            },
            dispose() {
              disposed = true;
            },
          }),
        };
      },
    };

    await expect(
      resolveMobileSourceImageRequest(
        installedSource(),
        "https://images.test/cover.jpg",
        {
          getSourceSettings: async () => ({ referer: "https://saved.test" }),
          executor: {
            bridge,
            readBytes: async () => makeAixPackage(),
          },
        },
      ),
    ).resolves.toEqual({
      url: "https://images.test/cover.jpg?token=source",
      headers: { Referer: "https://saved.test" },
    });
    expect(loadedSettings).toMatchObject({ referer: "https://saved.test" });
    expect(disposed).toBe(false);
    await defaultMobileSourceSessionCache.clear();
    expect(disposed).toBe(true);
  });

  test("falls back when image request metadata fails", async () => {
    let disposed = false;
    const bridge: MobileAidokuExecutorBridge = {
      async loadSource() {
        return {
          status: "ready",
          runtime: "native-aidoku",
          source: makeExecutorSource({
            async modifyImageRequest() {
              throw new Error("image request failed");
            },
            dispose() {
              disposed = true;
            },
          }),
        };
      },
    };

    await expect(
      resolveMobileSourceImageRequest(installedSource(), "https://images.test/cover.jpg", {
        executor: {
          bridge,
          readBytes: async () => makeAixPackage(),
        },
      }),
    ).resolves.toBeNull();
    expect(disposed).toBe(false);
    await defaultMobileSourceSessionCache.clear();
    expect(disposed).toBe(true);
  });

  test("caches source image requests by source, url, and settings", async () => {
    let loadCount = 0;
    let requestCount = 0;
    const bridge: MobileAidokuExecutorBridge = {
      async loadSource() {
        loadCount += 1;
        return {
          status: "ready",
          runtime: "native-aidoku",
          source: makeExecutorSource({
            async modifyImageRequest(url) {
              requestCount += 1;
              return {
                url: `${url}?load=${loadCount}`,
                headers: { Referer: "https://cached.test" },
              };
            },
          }),
        };
      },
    };
    const source = installedSource();
    const options = {
      getSourceSettings: async () => ({ nested: { b: 2, a: 1 } }),
      executor: {
        bridge,
        readBytes: async () => makeAixPackage(),
      },
    };

    const first = await resolveCachedMobileSourceImageRequest(
      source,
      "https://images.test/cover.jpg",
      options,
    );
    const second = await resolveCachedMobileSourceImageRequest(
      source,
      "https://images.test/cover.jpg",
      options,
    );

    expect(first).toEqual(second);
    expect(first?.url).toBe("https://images.test/cover.jpg?load=1");
    expect(loadCount).toBe(1);
    expect(requestCount).toBe(1);
  });

  test("retries a transient null image rewrite instead of caching failure", async () => {
    let requestCount = 0;
    const bridge: MobileAidokuExecutorBridge = {
      async loadSource() {
        return {
          status: "ready",
          runtime: "native-aidoku",
          source: makeExecutorSource({
            async modifyImageRequest(url) {
              requestCount += 1;
              if (requestCount === 1) throw new Error("transient timeout");
              return { url: `${url}?recovered=1`, headers: {} };
            },
          }),
        };
      },
    };
    const options = {
      executor: { bridge, readBytes: async () => makeAixPackage() },
    };

    await expect(resolveCachedMobileSourceImageRequest(
      installedSource(),
      "https://images.test/retry.jpg",
      options,
    )).resolves.toBeNull();
    await expect(resolveCachedMobileSourceImageRequest(
      installedSource(),
      "https://images.test/retry.jpg",
      options,
    )).resolves.toEqual({
      url: "https://images.test/retry.jpg?recovered=1",
      headers: {},
    });
    expect(requestCount).toBe(2);
  });

  test("keeps concurrent successful image rewrites single-flight", async () => {
    let requestCount = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const bridge: MobileAidokuExecutorBridge = {
      async loadSource() {
        return {
          status: "ready",
          runtime: "native-aidoku",
          source: makeExecutorSource({
            async modifyImageRequest(url) {
              requestCount += 1;
              await gate;
              return { url, headers: { Referer: "https://single.test" } };
            },
          }),
        };
      },
    };
    const source = installedSource();
    const options = {
      executor: { bridge, readBytes: async () => makeAixPackage() },
    };

    const first = resolveCachedMobileSourceImageRequest(
      source,
      "https://images.test/single.jpg",
      options,
    );
    const second = resolveCachedMobileSourceImageRequest(
      source,
      "https://images.test/single.jpg",
      options,
    );
    await Promise.resolve();
    release();

    expect(await first).toEqual(await second);
    expect(requestCount).toBe(1);
  });

  test("clears cached source image requests", async () => {
    let loadCount = 0;
    let requestCount = 0;
    const bridge: MobileAidokuExecutorBridge = {
      async loadSource() {
        loadCount += 1;
        return {
          status: "ready",
          runtime: "native-aidoku",
          source: makeExecutorSource({
            async modifyImageRequest(url) {
              requestCount += 1;
              return {
                url: `${url}?request=${requestCount}`,
                headers: { Referer: "https://cached.test" },
              };
            },
          }),
        };
      },
    };
    const source = installedSource();
    const options = {
      executor: {
        bridge,
        readBytes: async () => makeAixPackage(),
      },
    };

    await resolveCachedMobileSourceImageRequest(
      source,
      "https://images.test/cover.jpg",
      options,
    );
    clearMobileSourceImageRequestCache();
    const second = await resolveCachedMobileSourceImageRequest(
      source,
      "https://images.test/cover.jpg",
      options,
    );

    expect(second?.url).toBe("https://images.test/cover.jpg?request=2");
    expect(loadCount).toBe(1);
    expect(requestCount).toBe(2);
  });

  test("builds stable cache keys for reordered setting objects", () => {
    const source = installedSource();

    expect(
      makeMobileSourceImageRequestCacheKey(source, "https://images.test/cover.jpg", {
        b: 2,
        a: { y: "two", x: "one" },
      })
    ).toBe(
      makeMobileSourceImageRequestCacheKey(source, "https://images.test/cover.jpg", {
        a: { x: "one", y: "two" },
        b: 2,
      })
    );
  });

  test("keeps late A image metadata and disk keys isolated from B", async () => {
    const aStarted = Promise.withResolvers<void>();
    const releaseA = Promise.withResolvers<void>();
    const rewriteCalls = new Map<string, number>();
    const bridge: MobileAidokuExecutorBridge = {
      async loadSource(input) {
        const scope = input.sourceKey;
        return {
          status: "ready",
          runtime: "native-aidoku",
          source: makeExecutorSource({
            async modifyImageRequest(url) {
              rewriteCalls.set(scope, (rewriteCalls.get(scope) ?? 0) + 1);
              if (scope.startsWith("profile:account-a::")) {
                aStarted.resolve();
                await releaseA.promise;
              }
              return { url, headers: { "X-Test-Scope": scope } };
            },
          }),
        };
      },
    };
    const source = installedSource();
    const url = "https://images.test/private-cover.jpg";
    const sharedExecutor = { bridge, readBytes: async () => makeAixPackage() };

    const lateA = resolveCachedMobileSourceImageRequest(source, url, {
      executor: { ...sharedExecutor, executionScope: "profile:account-a" },
    });
    await aStarted.promise;
    const resultB = await resolveCachedMobileSourceImageRequest(source, url, {
      executor: { ...sharedExecutor, executionScope: "profile:account-b" },
    });
    expect(resultB?.headers["X-Test-Scope"]).toBe(
      "profile:account-b::aidoku-community:en.example",
    );

    releaseA.resolve();
    const resultA = await lateA;
    expect(resultA?.headers["X-Test-Scope"]).toBe(
      "profile:account-a::aidoku-community:en.example",
    );

    const cachedB = await resolveCachedMobileSourceImageRequest(source, url, {
      executor: { ...sharedExecutor, executionScope: "profile:account-b" },
    });
    expect(cachedB).toEqual(resultB);
    expect([...rewriteCalls.values()].reduce((sum, count) => sum + count, 0)).toBe(2);

    expect(
      getMobileImageCacheSourceKey(
        { uri: url, headers: { Authorization: "private" } },
        "private-cover",
        "profile:account-a",
      ),
    ).not.toBe(
      getMobileImageCacheSourceKey(
        { uri: url, headers: { Authorization: "private" } },
        "private-cover",
        "profile:account-b",
      ),
    );
  });
});
