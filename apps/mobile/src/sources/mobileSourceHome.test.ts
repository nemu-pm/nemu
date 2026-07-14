import { beforeEach, describe, expect, test } from "bun:test";
import { strToU8, zipSync } from "fflate";
import type { InstalledSource } from "@/data/schema";
import { fetchMobileSourceHome } from "./mobileSourceHome";
import type {
  HomeLayout,
  MobileAidokuExecutorBridge,
  MobileAidokuExecutorSource,
} from "./mobileSourceExecutor";
import { defaultMobileSourceSessionCache } from "./mobileSourceExecutorCache";

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

function makeHome(title: string): HomeLayout {
  return {
    components: [
      {
        title,
        value: {
          type: "bigScroller",
          entries: [
            {
              key: "one",
              title: "One",
            },
          ],
        },
      },
    ],
  };
}

function makeHomeWithImages(): HomeLayout {
  const manga = (key: string, cover: string) => ({
    key,
    title: key,
    cover,
  });

  return {
    components: [
      {
        title: "Scroller",
        value: {
          type: "scroller",
          entries: [
            {
              title: "Link Manga",
              imageUrl: "https://example.test/link.jpg",
              value: {
                type: "manga",
                manga: manga("link-manga", "https://example.test/link-manga.jpg"),
              },
            },
          ],
        },
      },
      {
        title: "Big",
        value: {
          type: "bigScroller",
          entries: [manga("big", "https://example.test/big.jpg")],
        },
      },
      {
        title: "List",
        value: {
          type: "mangaList",
          ranking: false,
          entries: [
            {
              title: "List Manga",
              imageUrl: "https://example.test/list-link.jpg",
              value: {
                type: "manga",
                manga: manga("list-manga", "https://example.test/list-manga.jpg"),
              },
            },
          ],
        },
      },
      {
        title: "Chapters",
        value: {
          type: "mangaChapterList",
          entries: [
            {
              manga: manga("chapter-manga", "https://example.test/chapter.jpg"),
              chapter: { key: "ch-1", title: "Chapter 1" },
            },
          ],
        },
      },
      {
        title: "Images",
        value: {
          type: "imageScroller",
          links: [
            {
              title: "Banner",
              imageUrl: "https://example.test/banner.jpg",
              value: { type: "url", url: "https://example.test" },
            },
          ],
        },
      },
    ],
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
      return [];
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
      return makeHome("Cached");
    },
    async getHomeWithPartials(onPartial) {
      onPartial(makeHome("Partial"));
      return makeHome("Final");
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

describe("mobile source home", () => {
  beforeEach(async () => {
    await defaultMobileSourceSessionCache.clear();
  });

  test("fetches home with partial updates and retains the cached executor session", async () => {
    let disposed = false;
    const partials: HomeLayout[] = [];
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
      fetchMobileSourceHome(installedSource(), {
        onPartial: (home) => partials.push(home),
        executor: {
          bridge,
          readBytes: async () => makeAixPackage(),
        },
      })
    ).resolves.toMatchObject({
      status: "ready",
      runtime: "native-aidoku",
      hasHomeProvider: true,
      onlySearch: false,
      home: {
        components: [{ title: "Final" }],
      },
    });
    expect(partials).toMatchObject([{ components: [{ title: "Partial" }] }]);
    expect(disposed).toBe(false); // cached session is retained, not disposed
  });

  test("reuses the cached executor session across repeated fetches", async () => {
    let loadCount = 0;
    const bridge: MobileAidokuExecutorBridge = {
      async loadSource() {
        loadCount += 1;
        return {
          status: "ready",
          runtime: "native-aidoku",
          source: makeExecutorSource(),
        };
      },
    };

    const options = {
      executor: {
        bridge,
        readBytes: async () => makeAixPackage(),
      },
    };

    const first = await fetchMobileSourceHome(installedSource(), options);
    const second = await fetchMobileSourceHome(installedSource(), options);
    expect(first.status).toBe("ready");
    expect(second.status).toBe("ready");
    expect(loadCount).toBe(1); // second fetch hit the session cache
  });

  test("applies source image request metadata across home layout images", async () => {
    const bridge: MobileAidokuExecutorBridge = {
      async loadSource() {
        return {
          status: "ready",
          runtime: "native-aidoku",
          source: makeExecutorSource(undefined, {
            async getHomeWithPartials() {
              return makeHomeWithImages();
            },
            async modifyImageRequest(url) {
              return {
                url: `${url}?token=home`,
                headers: { Referer: "https://example.test" },
              };
            },
          }),
        };
      },
    };

    const result = await fetchMobileSourceHome(installedSource(), {
      executor: {
        bridge,
        readBytes: async () => makeAixPackage(),
      },
    });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;

    expect(result.home).toMatchObject({
      components: [
        {
          value: {
            type: "scroller",
            entries: [
              {
                imageUrl: "https://example.test/link.jpg?token=home",
                imageHeaders: { Referer: "https://example.test" },
                value: {
                  manga: {
                    cover: "https://example.test/link-manga.jpg?token=home",
                    coverHeaders: { Referer: "https://example.test" },
                  },
                },
              },
            ],
          },
        },
        {
          value: {
            type: "bigScroller",
            entries: [
              {
                cover: "https://example.test/big.jpg?token=home",
                coverHeaders: { Referer: "https://example.test" },
              },
            ],
          },
        },
        {
          value: {
            type: "mangaList",
            entries: [
              {
                imageUrl: "https://example.test/list-link.jpg?token=home",
                imageHeaders: { Referer: "https://example.test" },
                value: {
                  manga: {
                    cover: "https://example.test/list-manga.jpg?token=home",
                    coverHeaders: { Referer: "https://example.test" },
                  },
                },
              },
            ],
          },
        },
        {
          value: {
            type: "mangaChapterList",
            entries: [
              {
                manga: {
                  cover: "https://example.test/chapter.jpg?token=home",
                  coverHeaders: { Referer: "https://example.test" },
                },
              },
            ],
          },
        },
        {
          value: {
            type: "imageScroller",
            links: [
              {
                imageUrl: "https://example.test/banner.jpg?token=home",
                imageHeaders: { Referer: "https://example.test" },
              },
            ],
          },
        },
      ],
    });
  });

  test("skips home loading when the source has no home provider", async () => {
    let loadedHome = false;
    const bridge: MobileAidokuExecutorBridge = {
      async loadSource() {
        return {
          status: "ready",
          runtime: "native-aidoku",
          source: makeExecutorSource(undefined, {
            async hasHomeProvider() {
              return false;
            },
            async getHomeWithPartials() {
              loadedHome = true;
              return makeHome("Should not load");
            },
          }),
        };
      },
    };

    await expect(
      fetchMobileSourceHome(installedSource(), {
        executor: {
          bridge,
          readBytes: async () => makeAixPackage(),
        },
      }),
    ).resolves.toMatchObject({
      status: "ready",
      runtime: "native-aidoku",
      hasHomeProvider: false,
      onlySearch: false,
      home: null,
    });
    expect(loadedHome).toBe(false);
  });

  test("skips home loading when the source is search-only", async () => {
    let loadedHome = false;
    const bridge: MobileAidokuExecutorBridge = {
      async loadSource() {
        return {
          status: "ready",
          runtime: "native-aidoku",
          source: makeExecutorSource(undefined, {
            async isOnlySearch() {
              return true;
            },
            async getHomeWithPartials() {
              loadedHome = true;
              return makeHome("Should not load");
            },
          }),
        };
      },
    };

    await expect(
      fetchMobileSourceHome(installedSource(), {
        executor: {
          bridge,
          readBytes: async () => makeAixPackage(),
        },
      }),
    ).resolves.toMatchObject({
      status: "ready",
      runtime: "native-aidoku",
      hasHomeProvider: true,
      onlySearch: true,
      home: null,
    });
    expect(loadedHome).toBe(false);
  });

  test("returns blocked home when the executor cannot load", async () => {
    await expect(
      fetchMobileSourceHome(installedSource(), {
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
