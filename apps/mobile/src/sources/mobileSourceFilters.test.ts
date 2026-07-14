import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { FilterType } from "@nemu.pm/aidoku-runtime";
import { strToU8, zipSync } from "fflate";
import type { InstalledSource } from "@/data/schema";
import { fetchMobileSourceFilters } from "./mobileSourceFilters";
import { defaultMobileSourceSessionCache } from "./mobileSourceExecutorCache";
import type {
  MobileAidokuExecutorBridge,
  MobileAidokuExecutorSource,
} from "./mobileSourceExecutor";

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
      settings: [],
      hasWasm: true,
    },
    ...overrides,
  };
}

function makeExecutorSource(onDispose?: () => void): MobileAidokuExecutorSource {
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
      return [
        {
          type: FilterType.Select,
          name: "Format",
          options: ["Manga", "Manhwa"],
          default: 0,
        },
      ];
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
    dispose() {
      onDispose?.();
    },
  };
}

describe("mobile source filters", () => {
  beforeEach(async () => {
    await defaultMobileSourceSessionCache.clear();
  });

  afterEach(async () => {
    await defaultMobileSourceSessionCache.clear();
  });

  test("fetches filters through the cached executor session", async () => {
    let disposed = false;
    const bridge: MobileAidokuExecutorBridge = {
      async loadSource() {
        return {
          status: "ready",
          runtime: "native-aidoku",
          source: makeExecutorSource(() => {
            disposed = true;
          }),
        };
      },
    };

    await expect(
      fetchMobileSourceFilters(installedSource(), {
        executor: {
          bridge,
          readBytes: async () => makeAixPackage(),
        },
      })
    ).resolves.toMatchObject({
      status: "ready",
      runtime: "native-aidoku",
      filters: [
        {
          type: FilterType.Select,
          name: "Format",
          options: ["Manga", "Manhwa"],
        },
      ],
    });
    expect(disposed).toBe(false);
    await defaultMobileSourceSessionCache.clear();
    expect(disposed).toBe(true);
  });

  test("returns blocked filters when the executor cannot load", async () => {
    await expect(
      fetchMobileSourceFilters(installedSource(), {
        executor: {
          readBytes: async () => makeAixPackage(),
        },
      })
    ).resolves.toMatchObject({
      status: "blocked",
      reason: "native-bridge-missing",
    });
  });
});
