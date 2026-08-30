import { beforeEach, describe, expect, test } from "bun:test";
import { strToU8, zipSync } from "fflate";
import type { InstalledSource, SourcePackageListing } from "@/data/schema";
import { fetchMobileSourceListing } from "./mobileSourceListings";
import type {
  MobileAidokuExecutorBridge,
  MobileAidokuExecutorSource,
} from "./mobileSourceExecutor";
import { defaultMobileSourceSessionCache } from "./mobileSourceExecutorCache";

const listing: SourcePackageListing = { id: "popular", name: "Popular" };

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
      listings: [listing],
      filters: [],
      settings: [],
      hasWasm: true,
    },
    ...overrides,
  };
}

function makeExecutorSource(
  onListingPage: (page: number, listing: SourcePackageListing) => void,
  onDispose?: () => void,
): MobileAidokuExecutorSource {
  return {
    id: "en.example",
    async getSearchMangaList() {
      return { entries: [], hasNextPage: false };
    },
    async getMangaDetails(manga) {
      return { key: manga.key, title: manga.key };
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
      return [listing];
    },
    async getMangaListForListing(nextListing, page) {
      onListingPage(page, nextListing);
      return {
        entries: [
          {
            key: `${nextListing.id}-blue-lock`,
            title: "Blue Lock",
            cover: "https://example.test/cover.jpg",
            authors: ["Author"],
            artists: ["Artist", "Author"],
            tags: ["Sports"],
          },
        ],
        hasNextPage: page < 2,
      };
    },
    async hasListingProvider() {
      return true;
    },
    async hasHomeProvider() {
      return false;
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
  };
}

describe("mobile source listings", () => {
  beforeEach(async () => {
    await defaultMobileSourceSessionCache.clear();
  });
  test("fetches manga for a package listing through the executor session", async () => {
    let disposed = false;
    let observedPage = 0;
    const bridge: MobileAidokuExecutorBridge = {
      async loadSource() {
        return {
          status: "ready",
          runtime: "native-aidoku",
          source: makeExecutorSource(
            (page) => {
              observedPage = page;
            },
            () => {
              disposed = true;
            }
          ),
        };
      },
    };

    await expect(
      fetchMobileSourceListing(installedSource(), listing, {
        page: 2,
        executor: {
          bridge,
          readBytes: async () => makeAixPackage(),
        },
      })
    ).resolves.toMatchObject({
      status: "ready",
      runtime: "native-aidoku",
      listing,
      page: 2,
      hasMore: false,
      items: [
        {
          id: "popular-blue-lock",
          title: "Blue Lock",
          cover: "https://example.test/cover.jpg",
          authors: ["Author", "Artist"],
          tags: ["Sports"],
        },
      ],
    });
    expect(observedPage).toBe(2);
    expect(disposed).toBe(false); // cached session is retained, not disposed
  });

  test("applies source image request metadata to listing covers", async () => {
    const bridge: MobileAidokuExecutorBridge = {
      async loadSource() {
        return {
          status: "ready",
          runtime: "native-aidoku",
          source: {
            ...makeExecutorSource(() => {}),
            async modifyImageRequest(url) {
              return {
                url: `${url}?token=listing`,
                headers: { Referer: "https://example.test" },
              };
            },
          },
        };
      },
    };

    await expect(
      fetchMobileSourceListing(installedSource(), listing, {
        executor: {
          bridge,
          readBytes: async () => makeAixPackage(),
        },
      }),
    ).resolves.toMatchObject({
      status: "ready",
      items: [
        {
          cover: "https://example.test/cover.jpg?token=listing",
          coverHeaders: { Referer: "https://example.test" },
        },
      ],
    });
  });

  test("fills a blank Aidoku listing name before crossing the executor boundary", async () => {
    const blankNameListing: SourcePackageListing = {
      id: "Updates",
      name: "",
    };
    const observedListings: SourcePackageListing[] = [];
    const bridge: MobileAidokuExecutorBridge = {
      async loadSource() {
        return {
          status: "ready",
          runtime: "native-aidoku",
          source: makeExecutorSource((_page, nextListing) => {
            observedListings.push(nextListing);
          }),
        };
      },
    };

    await expect(
      fetchMobileSourceListing(installedSource(), blankNameListing, {
        executor: {
          bridge,
          readBytes: async () => makeAixPackage(),
        },
      }),
    ).resolves.toMatchObject({
      status: "ready",
      listing: blankNameListing,
    });
    expect(observedListings).toEqual([{ id: "Updates", name: "Updates" }]);
  });

  test("returns blocked listings when package validation or bridge loading blocks", async () => {
    await expect(
      fetchMobileSourceListing(installedSource(), listing, {
        executor: {
          readBytes: async () => makeAixPackage(),
        },
      })
    ).resolves.toMatchObject({
      status: "blocked",
      listing,
      reason: "native-bridge-missing",
    });
  });
});
