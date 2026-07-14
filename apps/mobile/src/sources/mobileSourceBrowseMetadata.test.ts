import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { strToU8, zipSync } from "fflate";
import { FilterType } from "@nemu.pm/aidoku-runtime";
import type { InstalledSource, SourcePackageListing } from "@/data/schema";
import { fetchMobileSourceBrowseMetadata } from "./mobileSourceBrowseMetadata";
import { defaultMobileSourceSessionCache } from "./mobileSourceExecutorCache";
import type {
  Listing,
  MobileAidokuExecutorBridge,
  MobileAidokuExecutorSource,
} from "./mobileSourceExecutor";

const staticListing: SourcePackageListing = {
  id: "popular",
  name: "Popular",
};
const runtimeListing: SourcePackageListing = {
  id: "seasonal",
  name: "Seasonal",
  kind: 1,
};

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
      }),
    ),
    "Payload/main.wasm": new Uint8Array([0, 97, 115, 109]),
  });
}

function installedSource(
  overrides: Partial<InstalledSource> = {},
): InstalledSource {
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
      listings: [staticListing],
      filters: [],
      settings: [],
      hasWasm: true,
    },
    ...overrides,
  };
}

function makeExecutorSource(
  onDispose?: () => void,
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
      return [runtimeListing];
    },
    async getMangaListForListing() {
      return { entries: [], hasNextPage: false };
    },
    async hasListingProvider() {
      return true;
    },
    async hasHomeProvider() {
      return true;
    },
    async hasListings() {
      return true;
    },
    async isOnlySearch() {
      return false;
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
    ...overrides,
  };
}

describe("mobile source browse metadata", () => {
  beforeEach(async () => {
    await defaultMobileSourceSessionCache.clear();
  });

  afterEach(async () => {
    await defaultMobileSourceSessionCache.clear();
  });

  test("fetches runtime listing tabs and capability flags", async () => {
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
      fetchMobileSourceBrowseMetadata(installedSource(), {
        executor: {
          bridge,
          readBytes: async () => makeAixPackage(),
        },
      }),
    ).resolves.toMatchObject({
      status: "ready",
      runtime: "native-aidoku",
      listings: [runtimeListing],
      hasHomeProvider: true,
      hasListingProvider: true,
      onlySearch: false,
    });
    expect(disposed).toBe(false);
    await defaultMobileSourceSessionCache.clear();
    expect(disposed).toBe(true);
  });

  test("fills a missing runtime listing name from its stable ID", async () => {
    const missingNameListing = { id: "Updates" } as Listing;
    const bridge: MobileAidokuExecutorBridge = {
      async loadSource() {
        return {
          status: "ready",
          runtime: "native-aidoku",
          source: makeExecutorSource(undefined, {
            async getListings() {
              return [missingNameListing];
            },
          }),
        };
      },
    };

    const result = await fetchMobileSourceBrowseMetadata(installedSource(), {
      executor: {
        bridge,
        readBytes: async () => makeAixPackage(),
      },
    });

    expect(result).toMatchObject({
      status: "ready",
      listings: [{ id: "Updates", name: "Updates" }],
      packageMetadata: {
        listings: [{ id: "Updates", name: "Updates" }],
      },
    });
  });

  test("builds runtime package metadata from listings filters and settings", async () => {
    const bridge: MobileAidokuExecutorBridge = {
      async loadSource() {
        return {
          status: "ready",
          runtime: "native-aidoku",
          source: makeExecutorSource(undefined, {
            async getFilters() {
              return [
                { type: FilterType.Text, name: "Title" },
                {
                  type: FilterType.Select,
                  name: "Status",
                  options: ["Any", "Completed"],
                  default: 0,
                },
              ];
            },
            async getSettingsSchema() {
              return JSON.stringify({
                preferences: [
                  {
                    type: "EditTextPreference",
                    key: "quality",
                    title: "Quality",
                    summary: "Image quality",
                    defaultValue: "high",
                  },
                  {
                    type: "ListPreference",
                    key: "server",
                    title: "Server",
                    entries: ["Server A", "Server B"],
                    entryValues: ["a", "b"],
                    defaultValue: "a",
                  },
                  {
                    type: "SwitchPreferenceCompat",
                    key: "enabled",
                    title: "Enabled",
                    defaultValue: true,
                  },
                  {
                    type: "SeekBarPreference",
                    key: "limit",
                    title: "Result limit",
                    description: "Maximum results per page",
                    min: 10,
                    max: 100,
                    step: 10,
                    defaultValue: 20,
                    requires: "enabled",
                    refreshes: ["content", "filters", "unknown"],
                  },
                ],
              });
            },
          }),
        };
      },
    };

    const result = await fetchMobileSourceBrowseMetadata(
      installedSource({
        languages: ["en"],
        contentRating: 0,
        packageMetadata: {
          sourceId: "en.example",
          name: "Example",
          version: 2,
          languages: ["en"],
          contentRating: 0,
          urls: ["https://example.test"],
          listings: [staticListing],
          filters: [],
          settings: [],
          hasWasm: true,
        },
      }),
      {
        executor: {
          bridge,
          readBytes: async () => makeAixPackage(),
        },
      },
    );

    expect(result).toMatchObject({
      status: "ready",
      listings: [runtimeListing],
      filters: [
        { type: FilterType.Text, name: "Title" },
        {
          type: FilterType.Select,
          name: "Status",
          options: ["Any", "Completed"],
          default: 0,
        },
      ],
    });
    expect(result.status).toBe("ready");
    if (result.status !== "ready") {
      return;
    }
    expect(result.packageMetadata).toEqual({
      sourceId: "en.example",
      name: "Example",
      version: 2,
      languages: ["en"],
      contentRating: 0,
      urls: ["https://example.test"],
      listings: [runtimeListing],
      filters: [
        { id: "Title", title: "Title", type: "text" },
        { id: "Status", title: "Status", type: "select", optionCount: 2 },
      ],
      settings: [
        {
          key: "quality",
          title: "Quality",
          type: "text",
          subtitle: "Image quality",
          default: "high",
        },
        {
          key: "server",
          title: "Server",
          type: "select",
          optionCount: 2,
          values: ["a", "b"],
          titles: ["Server A", "Server B"],
          default: "a",
        },
        {
          key: "enabled",
          title: "Enabled",
          type: "switch",
          default: true,
        },
        {
          key: "limit",
          title: "Result limit",
          type: "slider",
          subtitle: "Maximum results per page",
          default: 20,
          min: 10,
          max: 100,
          step: 10,
          requires: "enabled",
          refreshes: ["content", "filters"],
        },
      ],
      hasWasm: true,
    });
  });

  test("detects search-only sources with no home or listings", async () => {
    const bridge: MobileAidokuExecutorBridge = {
      async loadSource() {
        return {
          status: "ready",
          runtime: "native-aidoku",
          source: makeExecutorSource(undefined, {
            async getListings() {
              return [];
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
          }),
        };
      },
    };

    await expect(
      fetchMobileSourceBrowseMetadata(installedSource(), {
        executor: {
          bridge,
          readBytes: async () => makeAixPackage(),
        },
      }),
    ).resolves.toMatchObject({
      status: "ready",
      listings: [],
      hasHomeProvider: false,
      hasListingProvider: false,
      onlySearch: true,
    });
  });

  test("keeps browse metadata ready when optional enrichment fails", async () => {
    const bridge: MobileAidokuExecutorBridge = {
      async loadSource() {
        return {
          status: "ready",
          runtime: "native-aidoku",
          source: makeExecutorSource(undefined, {
            async getFilters() {
              throw new Error("filter metadata failed");
            },
            async getSettingsSchema() {
              throw new Error("settings metadata failed");
            },
          }),
        };
      },
    };

    const result = await fetchMobileSourceBrowseMetadata(
      installedSource({
        packageMetadata: {
          sourceId: "en.example",
          name: "Example",
          version: 2,
          listings: [staticListing],
          filters: [{ id: "Genre", title: "Genre", type: "genre" }],
          settings: [
            {
              key: "enabled",
              title: "Enabled",
              type: "switch",
            },
          ],
          hasWasm: true,
        },
      }),
      {
        executor: {
          bridge,
          readBytes: async () => makeAixPackage(),
        },
      },
    );

    expect(result.status).toBe("ready");
    if (result.status !== "ready") {
      return;
    }
    expect(result.packageMetadata).toMatchObject({
      listings: [runtimeListing],
      filters: [{ id: "Genre", title: "Genre", type: "genre" }],
      settings: [{ key: "enabled", title: "Enabled", type: "switch" }],
    });
  });

  test("returns blocked metadata when the executor cannot load", async () => {
    await expect(
      fetchMobileSourceBrowseMetadata(installedSource(), {
        executor: {
          readBytes: async () => makeAixPackage(),
        },
      }),
    ).resolves.toMatchObject({
      status: "blocked",
      reason: "native-bridge-missing",
    });
  });
});
