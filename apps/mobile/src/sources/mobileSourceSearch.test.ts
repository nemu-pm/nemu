import { beforeEach, describe, expect, test } from "bun:test";
import { FilterType, type FilterValue } from "@nemu.pm/aidoku-runtime";
import { strToU8, zipSync } from "fflate";
import type { InstalledSource } from "@/data/schema";
import { getMobileStrings } from "@/lib/mobileI18n";
import {
  buildMobileLiveSearchProgressGroups,
  buildMobileSourceTitlePool,
  calculateMobileTitleSimilarity,
  getMobileSearchQueryForSource,
  mapAidokuMangaToLiveSearchManga,
  mapAidokuMangasToLiveSearchMangaWithImageRequests,
  presentMobileLiveSearchGroup,
  searchMobileSource,
  searchMobileSources,
  selectInstalledSourcesForSearch,
  sortMobileLiveSearchGroupsBySimilarity,
} from "./mobileSourceSearch";
import type {
  MobileAidokuExecutorBridge,
  MobileAidokuExecutorSource,
} from "./mobileSourceExecutor";
import { defaultMobileSourceSessionCache } from "./mobileSourceExecutorCache";

function makeAixPackage(sourceId = "en.example", language = "en"): Uint8Array {
  return zipSync({
    "Payload/source.json": strToU8(
      JSON.stringify({
        info: {
          id: sourceId,
          name: "Example",
          version: 2,
          languages: [language],
        },
      })
    ),
    "Payload/main.wasm": new Uint8Array([0, 97, 115, 109]),
  });
}

function installedSource(overrides: Partial<InstalledSource> = {}): InstalledSource {
  const sourceId = overrides.sourceId ?? "en.example";
  return {
    id: `aidoku-community:${sourceId}`,
    registryId: "aidoku-community",
    sourceId,
    name: "Example",
    icon: "https://example.test/icon.png",
    version: 2,
    packageUri: `file:///cache/${sourceId}.aix`,
    packageCacheKey: `aix:aidoku-community:${sourceId}`,
    packageMetadata: {
      sourceId,
      name: "Example",
      version: 2,
      languages: overrides.languages,
      listings: [],
      filters: [],
      settings: [],
      hasWasm: true,
    },
    ...overrides,
  };
}

function makeExecutorSource(
  onSearch?: (input: {
    query: string | null;
    page: number;
    filters: FilterValue[];
  }) => void
): MobileAidokuExecutorSource {
  return {
    id: "en.example",
    async getSearchMangaList(query, page, filters) {
      onSearch?.({ query, page, filters });
      return {
        entries: [
          {
            key: `manga-${page}`,
            title: query ? `Result ${query}` : "Result",
            cover: "https://example.test/cover.jpg",
            authors: ["Author"],
            artists: ["Artist", "Author"],
            tags: ["Action"],
          },
        ],
        hasNextPage: page < 2,
      };
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

describe("mobile source search", () => {
  beforeEach(async () => {
    await defaultMobileSourceSessionCache.clear();
  });
  test("maps Aidoku manga into mobile live search cards", () => {
    expect(
      mapAidokuMangaToLiveSearchManga({
        key: "one",
        title: "One",
        authors: ["A"],
        artists: ["B", "A"],
      })
    ).toEqual({
      id: "one",
      title: "One",
      authors: ["A", "B"],
    });
  });

  test("selects installed sources using the saved search source selection", () => {
    const sources = [
      installedSource({ id: "aidoku-community:en.alpha", sourceId: "en.alpha" }),
      installedSource({ id: "aidoku-community:en.beta", sourceId: "en.beta" }),
    ];

    expect(selectInstalledSourcesForSearch(sources, ["aidoku-community:en.beta"])).toEqual([
      sources[1],
    ]);
    expect(selectInstalledSourcesForSearch(sources, null)).toEqual(sources);
  });

  test("never executes unsupported installed source kinds", () => {
    const supported = installedSource({
      id: "aidoku-community:en.alpha",
      sourceId: "en.alpha",
    });
    const unsupported = installedSource({
      id: "tachiyomi:en.beta",
      registryId: "tachiyomi",
      sourceKind: "tachiyomi",
      sourceId: "en.beta",
    });

    expect(selectInstalledSourcesForSearch([supported, unsupported], null)).toEqual([
      supported,
    ]);
    expect(
      selectInstalledSourcesForSearch([supported, unsupported], [unsupported.id]),
    ).toEqual([]);
  });

  test("blocks unsupported sources at the single-source execution boundary", async () => {
    const source = installedSource({
      id: "tachiyomi:en.beta",
      registryId: "tachiyomi",
      sourceKind: "tachiyomi",
      sourceId: "en.beta",
    });

    const group = await searchMobileSource(source, "blue");
    expect(group).toMatchObject({
      status: "blocked",
      reason: "unsupported-source",
      source: { unsupported: true },
    });
    const presentation = presentMobileLiveSearchGroup(
      group,
      getMobileStrings("en"),
    );
    expect(presentation).toMatchObject({
      status: "blocked",
      title: "Source not supported on mobile",
    });
    expect(presentation.status === "blocked" ? presentation.detail : "").not.toContain(
      "[tachiyomi-unsupported]",
    );
  });

  test("selects installed sources when saved selection uses a source alias", () => {
    const source = installedSource({
      id: "aidoku-community:registry-id",
      sourceId: "manifest.id",
    });

    expect(selectInstalledSourcesForSearch([source], ["aidoku-community:manifest.id"])).toEqual([
      source,
    ]);
  });

  test("scores normalized title similarity", () => {
    expect(calculateMobileTitleSimilarity("Blue Lock", "blue lock")).toBe(1);
    expect(calculateMobileTitleSimilarity("ブルー・ロック", "ブルーロック")).toBeGreaterThan(0.8);
    expect(calculateMobileTitleSimilarity("Blue Lock", "Blue Period")).toBeLessThan(0.6);
    expect(calculateMobileTitleSimilarity("", "Blue Lock")).toBe(0);
  });

  test("builds source title pools from localized title aliases", () => {
    expect(
      buildMobileSourceTitlePool([
        "Blue Lock",
        "ブルーロック",
        "蓝色监狱",
        "Blue Lock",
        " ",
      ])
    ).toEqual({
      en: ["Blue Lock"],
      ja: ["ブルーロック"],
      zh: ["蓝色监狱"],
      all: ["Blue Lock", "ブルーロック", "蓝色监狱"],
    });
  });

  test("chooses source search queries from title pool language", () => {
    const titlePool = {
      en: ["Blue Lock"],
      ja: ["ブルーロック"],
      zh: ["蓝色监狱"],
      all: ["Blue Lock", "ブルーロック", "蓝色监狱"],
    };

    expect(
      getMobileSearchQueryForSource(
        installedSource({ sourceId: "ja.example", languages: ["ja"] }),
        titlePool
      )
    ).toBe("ブルーロック");
    expect(
      getMobileSearchQueryForSource(
        installedSource({ sourceId: "zh.example", languages: ["zh-Hans"] }),
        titlePool
      )
    ).toBe("蓝色监狱");
    expect(
      getMobileSearchQueryForSource(
        installedSource({ sourceId: "en.example", languages: ["en"] }),
        titlePool
      )
    ).toBe("Blue Lock");
  });

  test("runs a page-one live source search and retains the cached executor session", async () => {
    let disposed = false;
    const bridge: MobileAidokuExecutorBridge = {
      async loadSource() {
        const source = makeExecutorSource();
        return {
          status: "ready",
          runtime: "native-aidoku",
          source: {
            ...source,
            dispose() {
              disposed = true;
            },
          },
        };
      },
    };

    await expect(
      searchMobileSource(installedSource(), "blue", {
        executor: {
          bridge,
          readBytes: async () => makeAixPackage(),
        },
      })
    ).resolves.toMatchObject({
      status: "ready",
      runtime: "native-aidoku",
      source: {
        id: "aidoku-community:en.example",
        name: "Example",
      },
      items: [
        {
          id: "manga-1",
          title: "Result blue",
          authors: ["Author", "Artist"],
        },
      ],
      hasMore: true,
    });
    expect(disposed).toBe(false); // cached session is retained, not disposed
  });

  test("applies source image request metadata to live search covers", async () => {
    const bridge: MobileAidokuExecutorBridge = {
      async loadSource() {
        const source = makeExecutorSource();
        return {
          status: "ready",
          runtime: "native-aidoku",
          source: {
            ...source,
            async modifyImageRequest(url) {
              return {
                url: `${url}?token=source`,
                headers: { Referer: "https://example.test" },
              };
            },
          },
        };
      },
    };

    await expect(
      searchMobileSource(installedSource(), "blue", {
        executor: {
          bridge,
          readBytes: async () => makeAixPackage(),
        },
      }),
    ).resolves.toMatchObject({
      status: "ready",
      items: [
        {
          cover: "https://example.test/cover.jpg?token=source",
          coverHeaders: { Referer: "https://example.test" },
        },
      ],
    });
  });

  test("keeps live search covers when source image request metadata fails", async () => {
    const bridge: MobileAidokuExecutorBridge = {
      async loadSource() {
        const source = makeExecutorSource();
        return {
          status: "ready",
          runtime: "native-aidoku",
          source: {
            ...source,
            async modifyImageRequest() {
              throw new Error("image rewrite failed");
            },
          },
        };
      },
    };

    await expect(
      searchMobileSource(installedSource(), "blue", {
        executor: {
          bridge,
          readBytes: async () => makeAixPackage(),
        },
      }),
    ).resolves.toMatchObject({
      status: "ready",
      items: [
        {
          cover: "https://example.test/cover.jpg",
        },
      ],
    });
  });

  test("bounds many slow cover rewrites and stops scheduling after cancellation", async () => {
    let calls = 0;
    const source = {
      modifyImageRequest: async () => {
        calls += 1;
        return new Promise<{ url: string; headers: Record<string, string> }>(
          () => undefined,
        );
      },
    };
    const mangas = Array.from({ length: 500 }, (_, index) => ({
      key: `manga-${index}`,
      title: `Manga ${index}`,
      cover: `https://example.test/${index}.jpg`,
    }));

    const startedAt = performance.now();
    const items = await mapAidokuMangasToLiveSearchMangaWithImageRequests(
      source,
      mangas,
      { imageRequestConcurrency: 4, imageRequestDeadlineMs: 10 },
    );

    expect(performance.now() - startedAt).toBeLessThan(250);
    expect(items).toHaveLength(500);
    expect(calls).toBe(4);

    const controller = new AbortController();
    controller.abort();
    calls = 0;
    await mapAidokuMangasToLiveSearchMangaWithImageRequests(source, mangas, {
      signal: controller.signal,
    });
    expect(calls).toBe(0);
  });

  test("falls back to safe cover rewrite limits for non-finite options", async () => {
    let calls = 0;
    const mangas = Array.from({ length: 5 }, (_, index) => ({
      key: `manga-${index}`,
      title: `Manga ${index}`,
      cover: `https://example.test/${index}.jpg`,
    }));

    const items = await mapAidokuMangasToLiveSearchMangaWithImageRequests(
      {
        async modifyImageRequest(url) {
          calls += 1;
          return { url: `${url}?rewritten=1`, headers: {} };
        },
      },
      mangas,
      {
        imageRequestConcurrency: Number.NaN,
        imageRequestDeadlineMs: Number.NaN,
      },
    );

    expect(calls).toBe(5);
    expect(items.every((item) => item.cover?.endsWith("?rewritten=1"))).toBe(
      true,
    );
  });

  test("orders live source search items by title similarity", async () => {
    const bridge: MobileAidokuExecutorBridge = {
      async loadSource() {
        return {
          status: "ready",
          runtime: "native-aidoku",
          source: {
            ...makeExecutorSource(),
            async getSearchMangaList() {
              return {
                entries: [
                  { key: "period", title: "Blue Period" },
                  { key: "lock", title: "Blue Lock" },
                  { key: "box", title: "Box Lock" },
                ],
                hasNextPage: false,
              };
            },
          },
        };
      },
    };

    const result = await searchMobileSource(installedSource(), "blue lock", {
      executor: {
        bridge,
        readBytes: async () => makeAixPackage(),
      },
    });

    expect(result.status).toBe("ready");
    expect(result.status === "ready" ? result.items.map((item) => item.id) : []).toEqual([
      "lock",
      "box",
      "period",
    ]);
  });

  test("orders live source groups by best title similarity", () => {
    const groups = sortMobileLiveSearchGroupsBySimilarity(
      [
        {
          status: "ready",
          source: {
            id: "aidoku-community:en.beta",
            registryId: "aidoku-community",
            rawSourceId: "en.beta",
            name: "Beta",
          },
          runtime: "native-aidoku",
          items: [{ id: "period", title: "Blue Period" }],
          hasMore: false,
        },
        {
          status: "blocked",
          source: {
            id: "aidoku-community:en.blocked",
            registryId: "aidoku-community",
            rawSourceId: "en.blocked",
            name: "Blocked",
          },
          reason: "missing",
          detail: "Missing package",
        },
        {
          status: "ready",
          source: {
            id: "aidoku-community:en.alpha",
            registryId: "aidoku-community",
            rawSourceId: "en.alpha",
            name: "Alpha",
          },
          runtime: "native-aidoku",
          items: [{ id: "lock", title: "Blue Lock" }],
          hasMore: false,
        },
      ],
      ["blue lock"]
    );

    expect(groups.map((group) => group.source.name)).toEqual(["Alpha", "Beta", "Blocked"]);
  });

  test("builds live source progress groups with pending sources still visible", () => {
    const sources = [
      installedSource({
        id: "aidoku-community:en.alpha",
        sourceId: "en.alpha",
        name: "Alpha",
      }),
      installedSource({
        id: "aidoku-community:en.beta",
        sourceId: "en.beta",
        name: "Beta",
      }),
      installedSource({
        id: "aidoku-community:en.gamma",
        sourceId: "en.gamma",
        name: "Gamma",
      }),
    ];

    const groups = buildMobileLiveSearchProgressGroups(
      sources,
      [
        {
          status: "ready",
          source: {
            id: "aidoku-community:en.beta",
            registryId: "aidoku-community",
            rawSourceId: "en.beta",
            name: "Beta",
          },
          runtime: "native-aidoku",
          items: [{ id: "blue-lock", title: "Blue Lock" }],
          hasMore: false,
        },
      ],
      ["Blue Lock"]
    );

    expect(groups.map((group) => `${group.status}:${group.source.id}`)).toEqual([
      "ready:aidoku-community:en.beta",
      "loading:aidoku-community:en.alpha",
      "loading:aidoku-community:en.gamma",
    ]);
  });

  test("keeps blocked source progress groups ahead of pending sources", () => {
    const sources = [
      installedSource({
        id: "aidoku-community:en.alpha",
        sourceId: "en.alpha",
        name: "Alpha",
      }),
      installedSource({
        id: "aidoku-community:en.beta",
        sourceId: "en.beta",
        name: "Beta",
      }),
      installedSource({
        id: "aidoku-community:en.gamma",
        sourceId: "en.gamma",
        name: "Gamma",
      }),
    ];

    const groups = buildMobileLiveSearchProgressGroups(
      sources,
      [
        {
          status: "blocked",
          source: {
            id: "aidoku-community:en.beta",
            registryId: "aidoku-community",
            rawSourceId: "en.beta",
            name: "Beta",
          },
          reason: "search-failed",
          detail: "Source search failed",
        },
      ],
      ["Blue Lock"],
    );

    expect(groups.map((group) => `${group.status}:${group.source.id}`)).toEqual([
      "blocked:aidoku-community:en.beta",
      "loading:aidoku-community:en.alpha",
      "loading:aidoku-community:en.gamma",
    ]);
  });

  test("searches each source with title-pool language query and sorts by the full pool", async () => {
    const observedSearches: Array<{ sourceKey: string; query: string | null }> = [];
    const bridge: MobileAidokuExecutorBridge = {
      async loadSource(input) {
        return {
          status: "ready",
          runtime: "native-aidoku",
          source: {
            ...makeExecutorSource(({ query }) => {
              observedSearches.push({ sourceKey: input.sourceKey, query });
            }),
            async getSearchMangaList(query) {
              observedSearches.push({ sourceKey: input.sourceKey, query });
              return {
                entries:
                  input.sourceKey.endsWith("::aidoku-community:ja.example")
                    ? [
                        { key: "ja-period", title: "ブルーピリオド" },
                        { key: "ja-lock", title: "ブルーロック" },
                      ]
                    : [
                        { key: "en-period", title: "Blue Period" },
                        { key: "en-lock", title: "Blue Lock" },
                      ],
                hasNextPage: false,
              };
            },
          },
        };
      },
    };
    const titlePool = {
      en: ["Blue Lock"],
      ja: ["ブルーロック"],
      zh: [],
      all: ["Blue Lock", "ブルーロック"],
    };

    const groups = await searchMobileSources(
      [
        installedSource({
          sourceId: "en.example",
          name: "English",
          languages: ["en"],
        }),
        installedSource({
          sourceId: "ja.example",
          name: "Japanese",
          languages: ["ja"],
        }),
      ],
      "Blue Lock",
      null,
      {
        titlePool,
        executor: {
          bridge,
          readBytes: async (key) =>
            key.endsWith(":ja.example")
              ? makeAixPackage("ja.example", "ja")
              : makeAixPackage("en.example", "en"),
        },
      }
    );

    expect(observedSearches).toEqual([
      { sourceKey: "local::aidoku-community:en.example", query: "Blue Lock" },
      { sourceKey: "local::aidoku-community:ja.example", query: "ブルーロック" },
    ]);
    expect(
      groups.map((group) =>
        group.status === "ready" ? group.items.map((item) => item.id) : []
      )
    ).toEqual([
      ["en-lock", "en-period"],
      ["ja-lock", "ja-period"],
    ]);
  });

  test("keeps successful source search groups when another source fails", async () => {
    const bridge: MobileAidokuExecutorBridge = {
      async loadSource(input) {
        return {
          status: "ready",
          runtime: "native-aidoku",
          source: {
            ...makeExecutorSource(),
            async getSearchMangaList(query) {
              if (input.sourceKey.endsWith("::aidoku-community:bad.example")) {
                throw new Error("source search failed");
              }
              return {
                entries: [
                  {
                    key: "lock",
                    title: query ? `Result ${query}` : "Result",
                  },
                ],
                hasNextPage: false,
              };
            },
          },
        };
      },
    };

    const groups = await searchMobileSources(
      [
        installedSource({
          sourceId: "good.example",
          name: "Good",
          languages: ["en"],
        }),
        installedSource({
          sourceId: "bad.example",
          name: "Bad",
          languages: ["en"],
        }),
      ],
      "Blue Lock",
      null,
      {
        executor: {
          bridge,
          readBytes: async (key) =>
            key.endsWith(":bad.example")
              ? makeAixPackage("bad.example", "en")
              : makeAixPackage("good.example", "en"),
        },
      }
    );

    expect(groups).toMatchObject([
      {
        status: "ready",
        source: { name: "Good" },
        items: [{ id: "lock", title: "Result Blue Lock" }],
      },
      {
        status: "blocked",
        source: { name: "Bad" },
        reason: "search-failed",
        detail: "source search failed",
      },
    ]);
  });

  test("passes page and filters into a live source search", async () => {
    const observedSearches: Array<{
      query: string | null;
      page: number;
      filters: FilterValue[];
    }> = [];
    const filters: FilterValue[] = [
      {
        type: FilterType.Select,
        name: "Format",
        value: "Manga",
      },
    ];
    const bridge: MobileAidokuExecutorBridge = {
      async loadSource() {
        return {
          status: "ready",
          runtime: "native-aidoku",
          source: makeExecutorSource((input) => observedSearches.push(input)),
        };
      },
    };

    await expect(
      searchMobileSource(installedSource(), " ", {
        page: 3,
        filters,
        executor: {
          bridge,
          readBytes: async () => makeAixPackage(),
        },
      })
    ).resolves.toMatchObject({
      status: "ready",
      items: [{ id: "manga-3" }],
    });
    expect(observedSearches).toEqual([
      {
        query: null,
        page: 3,
        filters,
      },
    ]);
  });

  test("returns blocked groups when the executor cannot load", async () => {
    await expect(
      searchMobileSources([installedSource()], "blue", null, {
        executor: {
          readBytes: async () => makeAixPackage(),
        },
      })
    ).resolves.toMatchObject([
      {
        status: "blocked",
        reason: "native-bridge-missing",
      },
    ]);
  });
});
