import { describe, expect, test } from "bun:test";
import { strToU8, zipSync } from "fflate";
import type { InstalledSource } from "@/data/schema";
import {
  mapAidokuChapterToSummary,
  mapAidokuMangaToMetadata,
  refreshMobileSourceChapters,
  refreshMobileSourceDetails,
  refreshMobileSourceLatestChapter,
  refreshMobileSourceMetadata,
  sortChapterSummaries,
} from "./mobileSourceDetails";
import type {
  MobileAidokuExecutorBridge,
  MobileAidokuExecutorSource,
} from "./mobileSourceExecutor";
import { createMobileSourceSessionCache } from "./mobileSourceExecutorCache";

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
      return {
        key: manga.key,
        title: "Blue Lock",
        cover: "https://example.test/cover.jpg",
        authors: ["Author"],
        artists: ["Artist", "Author"],
        description: "Football battle.",
        tags: ["Sports"],
      };
    },
    async getChapterList() {
      return [
        { key: "c1", chapterNumber: 1, title: "Start" },
        { key: "c3", chapterNumber: 3, title: "Latest" },
        { key: "c2", chapterNumber: 2, title: "Middle" },
      ];
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
    dispose() {
      onDispose?.();
    },
  };
}

describe("mobile source details refresh", () => {
  test("maps Aidoku manga details into local metadata", () => {
    expect(
      mapAidokuMangaToMetadata(
        {
          key: "blue-lock",
          title: "Blue Lock",
          authors: ["A"],
          artists: ["B", "A"],
        },
        "fallback"
      )
    ).toEqual({
      title: "Blue Lock",
      authors: ["A", "B"],
    });
  });

  test("sorts chapter summaries by latest chapter number first", () => {
    expect(
      sortChapterSummaries([
        { id: "c1", chapterNumber: 1 },
        { id: "c10", chapterNumber: 10 },
        { id: "c2", chapterNumber: 2 },
      ]).map((chapter) => chapter.id)
    ).toEqual(["c10", "c2", "c1"]);
  });

  test("preserves chapter language in mobile summaries", () => {
    expect(
      mapAidokuChapterToSummary({
        key: "c1",
        title: "Start",
        chapterNumber: 1,
        lang: "ja",
      })
    ).toEqual({
      id: "c1",
      title: "Start",
      chapterNumber: 1,
      lang: "ja",
    });
  });

  test("fetches manga details and chapters through the executor session", async () => {
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
      refreshMobileSourceDetails(installedSource(), "blue-lock", {
        executor: {
          bridge,
          readBytes: async () => makeAixPackage(),
        },
        sessionCache: createMobileSourceSessionCache(),
        now: () => 1234,
      })
    ).resolves.toMatchObject({
      status: "ready",
      runtime: "native-aidoku",
      fetchedAt: 1234,
      metadata: {
        title: "Blue Lock",
        authors: ["Author", "Artist"],
        description: "Football battle.",
      },
      latestChapter: {
        id: "c3",
        chapterNumber: 3,
      },
      chapters: [
        { id: "c3", chapterNumber: 3 },
        { id: "c2", chapterNumber: 2 },
        { id: "c1", chapterNumber: 1 },
      ],
    });
    expect(disposed).toBe(false); // cached session is retained, not disposed
  });

  test("fetches source metadata without fetching chapters for editor updates", async () => {
    let chapterListCalled = false;
    let disposed = false;
    const bridge: MobileAidokuExecutorBridge = {
      async loadSource() {
        const source = makeExecutorSource(() => {
          disposed = true;
        });
        return {
          status: "ready",
          runtime: "native-aidoku",
          source: {
            ...source,
            async getChapterList(manga) {
              chapterListCalled = true;
              return source.getChapterList(manga);
            },
          },
        };
      },
    };

    await expect(
      refreshMobileSourceMetadata(installedSource(), "blue-lock", {
        executor: {
          bridge,
          readBytes: async () => makeAixPackage(),
        },
        sessionCache: createMobileSourceSessionCache(),
        now: () => 2468,
      })
    ).resolves.toEqual({
      status: "ready",
      runtime: "native-aidoku",
      metadata: {
        title: "Blue Lock",
        cover: "https://example.test/cover.jpg",
        authors: ["Author", "Artist"],
        description: "Football battle.",
        tags: ["Sports"],
      },
      fetchedAt: 2468,
    });
    expect(chapterListCalled).toBe(false);
    expect(disposed).toBe(false); // cached session is retained, not disposed
  });

  test("returns blocked details when package validation or bridge loading blocks", async () => {
    await expect(
      refreshMobileSourceDetails(installedSource(), "blue-lock", {
        executor: {
          readBytes: async () => makeAixPackage(),
        },
        sessionCache: createMobileSourceSessionCache(),
      })
    ).resolves.toMatchObject({
      status: "blocked",
      reason: "native-bridge-missing",
    });
  });

  test("fetches only latest chapter for background library refresh", async () => {
    let mangaDetailsCalled = false;
    let disposed = false;
    const bridge: MobileAidokuExecutorBridge = {
      async loadSource() {
        const source = makeExecutorSource(() => {
          disposed = true;
        });
        return {
          status: "ready",
          runtime: "native-aidoku",
          source: {
            ...source,
            async getMangaDetails(manga) {
              mangaDetailsCalled = true;
              return source.getMangaDetails(manga);
            },
          },
        };
      },
    };

    await expect(
      refreshMobileSourceLatestChapter(installedSource(), "blue-lock", {
        executor: {
          bridge,
          readBytes: async () => makeAixPackage(),
        },
        sessionCache: createMobileSourceSessionCache(),
        now: () => 5678,
      })
    ).resolves.toEqual({
      status: "ready",
      runtime: "native-aidoku",
      latestChapter: { id: "c3", title: "Latest", chapterNumber: 3 },
      fetchedAt: 5678,
    });
    expect(mangaDetailsCalled).toBe(false);
    expect(disposed).toBe(false); // cached session is retained, not disposed
  });

  test("fetches chapter lists without fetching manga details", async () => {
    let mangaDetailsCalled = false;
    let disposed = false;
    const bridge: MobileAidokuExecutorBridge = {
      async loadSource() {
        const source = makeExecutorSource(() => {
          disposed = true;
        });
        return {
          status: "ready",
          runtime: "native-aidoku",
          source: {
            ...source,
            async getMangaDetails(manga) {
              mangaDetailsCalled = true;
              return source.getMangaDetails(manga);
            },
          },
        };
      },
    };

    await expect(
      refreshMobileSourceChapters(installedSource(), "blue-lock", {
        executor: {
          bridge,
          readBytes: async () => makeAixPackage(),
        },
        sessionCache: createMobileSourceSessionCache(),
        now: () => 4321,
      })
    ).resolves.toEqual({
      status: "ready",
      runtime: "native-aidoku",
      chapters: [
        { id: "c3", title: "Latest", chapterNumber: 3 },
        { id: "c2", title: "Middle", chapterNumber: 2 },
        { id: "c1", title: "Start", chapterNumber: 1 },
      ],
      latestChapter: { id: "c3", title: "Latest", chapterNumber: 3 },
      fetchedAt: 4321,
    });
    expect(mangaDetailsCalled).toBe(false);
    expect(disposed).toBe(false); // cached session is retained, not disposed
  });
});
