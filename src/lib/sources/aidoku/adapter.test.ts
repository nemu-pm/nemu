import { afterEach, describe, expect, it, mock } from "bun:test";
import type { CacheStore } from "@/data/cache";

const loadSourceMock = mock(async () => fakeAsyncSource);
const getAgentStatusMock = mock(async () => ({ available: false }));
const hasAgentMock = mock(async () => false);
const hasAgentSyncMock = mock(() => false);
const agentProxyFetchMock = mock(async () => new Response());
const setAgentCfProgressCallbackMock = mock(() => {});
const solveCfChallengeMock = mock(async () => false);

mock.module("@nemu.pm/aidoku-runtime", () => ({
  loadSource: loadSourceMock,
  FilterType: {
    Text: 0,
    Select: 1,
    Sort: 2,
    Check: 3,
    Group: 4,
    Genre: 5,
  },
}));

mock.module("@/lib/agent", () => ({
  getAgentStatus: getAgentStatusMock,
  hasAgent: hasAgentMock,
  hasAgentSync: hasAgentSyncMock,
  agentProxyFetch: agentProxyFetchMock,
  setAgentCfProgressCallback: setAgentCfProgressCallbackMock,
  solveCfChallenge: solveCfChallengeMock,
}));

type FakeAsyncSource = {
  id: string;
  manifest: {
    info: {
      id: string;
      name: string;
      version: number;
      url?: string;
      urls?: string[];
      languages?: string[];
    };
  };
  settingsJson?: unknown[];
  getSearchMangaList: ReturnType<typeof mock>;
  getMangaDetails: ReturnType<typeof mock>;
  getChapterList: ReturnType<typeof mock>;
  getPageList: ReturnType<typeof mock>;
  getFilters: ReturnType<typeof mock>;
  getListings: ReturnType<typeof mock>;
  getMangaListForListing: ReturnType<typeof mock>;
  hasListingProvider: ReturnType<typeof mock>;
  hasHomeProvider: ReturnType<typeof mock>;
  hasListings: ReturnType<typeof mock>;
  isOnlySearch: ReturnType<typeof mock>;
  handlesBasicLogin: ReturnType<typeof mock>;
  handlesWebLogin: ReturnType<typeof mock>;
  getHome: ReturnType<typeof mock>;
  getHomeWithPartials: ReturnType<typeof mock>;
  modifyImageRequest: ReturnType<typeof mock>;
  hasImageProcessor: ReturnType<typeof mock>;
  processPageImage: ReturnType<typeof mock>;
  updateSettings: ReturnType<typeof mock>;
  dispose: ReturnType<typeof mock>;
};

let fakeAsyncSource = createFakeAsyncSource();
const originalFetch = globalThis.fetch;

function createCacheStore(): CacheStore {
  const values = new Map<string, unknown>();

  return {
    async get(key) {
      return (values.get(key) as ArrayBuffer | undefined) ?? null;
    },
    async set(key, data) {
      values.set(key, data);
    },
    async getJson<T>(key: string) {
      return (values.get(key) as T | undefined) ?? null;
    },
    async setJson<T>(key: string, data: T) {
      values.set(key, data);
    },
    async delete(key) {
      values.delete(key);
    },
    async clear() {
      values.clear();
    },
  };
}

function createFakeAsyncSource(): FakeAsyncSource {
  return {
    id: "test.source",
    manifest: {
      info: {
        id: "test.source",
        name: "Test Source",
        version: 1,
        url: "https://source.example",
        urls: ["https://source.example"],
        languages: ["en"],
      },
    },
    settingsJson: [],
    getSearchMangaList: mock(async () => ({ entries: [], hasNextPage: false })),
    getMangaDetails: mock(async (manga) => manga),
    getChapterList: mock(async () => [{ key: "chapter-1" }]),
    getPageList: mock(async () => [
      {
        index: 0,
        url: "/uploads/pages/page-1.jpg",
        context: { width: "800", height: "1200" },
      },
    ]),
    getFilters: mock(async () => []),
    getListings: mock(async () => []),
    getMangaListForListing: mock(async () => ({ entries: [], hasNextPage: false })),
    hasListingProvider: mock(async () => false),
    hasHomeProvider: mock(async () => false),
    hasListings: mock(async () => false),
    isOnlySearch: mock(async () => true),
    handlesBasicLogin: mock(async () => false),
    handlesWebLogin: mock(async () => false),
    getHome: mock(async () => null),
    getHomeWithPartials: mock(async () => null),
    modifyImageRequest: mock(async () => ({
      url: "https://images.example/pages/page-1.jpg",
      headers: { Referer: "https://source.example/manga" },
    })),
    hasImageProcessor: mock(async () => false),
    processPageImage: mock(async () => null),
    updateSettings: mock(() => {}),
    dispose: mock(() => {}),
  };
}

afterEach(() => {
  fakeAsyncSource = createFakeAsyncSource();
  loadSourceMock.mockClear();
  getAgentStatusMock.mockClear();
  hasAgentMock.mockClear();
  hasAgentSyncMock.mockClear();
  agentProxyFetchMock.mockClear();
  setAgentCfProgressCallbackMock.mockClear();
  solveCfChallengeMock.mockClear();
  globalThis.fetch = originalFetch;
});

describe("createAidokuMangaSource", () => {
  it("uses modified image request URLs and passes page context", async () => {
    const fetchedUrls: string[] = [];
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      fetchedUrls.push(String(input));
      return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), {
        headers: { "Content-Type": "image/jpeg" },
      });
    }) as unknown as typeof fetch;

    const { createAidokuMangaSource } = await import("./adapter");
    const { source } = await createAidokuMangaSource(
      new ArrayBuffer(0),
      "registry:test.source",
      createCacheStore()
    );

    const [page] = await source.getPages("manga-1", "chapter-1");
    await page.getImage();

    expect(fakeAsyncSource.modifyImageRequest).toHaveBeenCalledWith(
      "/uploads/pages/page-1.jpg",
      { width: "800", height: "1200" }
    );

    const proxyRequestUrl = new URL(fetchedUrls[0]);
    expect(proxyRequestUrl.searchParams.get("url")).toBe(
      "https://images.example/pages/page-1.jpg"
    );
  });

  it("resolves relative image request URLs against the manifest base URL", async () => {
    fakeAsyncSource.modifyImageRequest = mock(async (url: string) => ({
      url,
      headers: {},
    }));

    const fetchedUrls: string[] = [];
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      fetchedUrls.push(String(input));
      return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), {
        headers: { "Content-Type": "image/jpeg" },
      });
    }) as unknown as typeof fetch;

    const { createAidokuMangaSource } = await import("./adapter");
    const { source } = await createAidokuMangaSource(
      new ArrayBuffer(0),
      "registry:test.source",
      createCacheStore()
    );

    const [page] = await source.getPages("manga-1", "chapter-1");
    await page.getImage();

    const proxyRequestUrl = new URL(fetchedUrls[0]);
    expect(proxyRequestUrl.searchParams.get("url")).toBe(
      "https://source.example/uploads/pages/page-1.jpg"
    );
  });
});
