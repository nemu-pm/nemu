import { afterEach, describe, expect, it, mock } from "bun:test";
import type { CacheStore } from "@/data/cache";
import { CacheKeys } from "@/data/keys";

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
  hasCoverImageProcessor: ReturnType<typeof mock>;
  processCoverImage: ReturnType<typeof mock>;
  updateSettings: ReturnType<typeof mock>;
  dispose: ReturnType<typeof mock>;
};

let fakeAsyncSource = createFakeAsyncSource();
const originalFetch = globalThis.fetch;

function createCacheStore(seed?: Map<string, unknown>): CacheStore {
  const values = seed ?? new Map<string, unknown>();

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
    hasCoverImageProcessor: mock(async () => false),
    processCoverImage: mock(async () => null),
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

  it("runs covers through the source cover image processor", async () => {
    const processedBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    fakeAsyncSource.hasCoverImageProcessor = mock(async () => true);
    fakeAsyncSource.processCoverImage = mock(async () => processedBytes);
    fakeAsyncSource.modifyImageRequest = mock(async () => ({
      url: "https://images.example/covers/cover-1.jpg",
      headers: { Referer: "https://source.example/manga" },
    }));

    globalThis.fetch = mock(
      async () =>
        new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), {
          headers: { "Content-Type": "image/jpeg" },
        })
    ) as unknown as typeof fetch;

    const { createAidokuMangaSource } = await import("./adapter");
    const { source } = await createAidokuMangaSource(
      new ArrayBuffer(0),
      "registry:test.source",
      createCacheStore()
    );

    const blob = await source.fetchImage("/covers/cover-1.jpg");

    expect(fakeAsyncSource.processCoverImage).toHaveBeenCalledTimes(1);
    expect(fakeAsyncSource.processPageImage).not.toHaveBeenCalled();
    const [imageBytes, requestUrl, requestHeaders, responseCode] =
      fakeAsyncSource.processCoverImage.mock.calls[0];
    expect(imageBytes).toBeInstanceOf(Uint8Array);
    expect(requestUrl).toBe("https://images.example/covers/cover-1.jpg");
    expect(requestHeaders).toEqual({ Referer: "https://source.example/manga" });
    expect(responseCode).toBe(200);
    expect(blob.type).toBe("image/png");
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(processedBytes);
  });

  it("falls back to the raw cover bytes when the cover processor declines", async () => {
    fakeAsyncSource.hasCoverImageProcessor = mock(async () => true);
    fakeAsyncSource.processCoverImage = mock(async () => null);
    fakeAsyncSource.modifyImageRequest = mock(async () => ({
      url: "https://images.example/covers/cover-2.jpg",
      headers: {},
    }));

    globalThis.fetch = mock(
      async () =>
        new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), {
          headers: { "Content-Type": "image/jpeg" },
        })
    ) as unknown as typeof fetch;

    const { createAidokuMangaSource } = await import("./adapter");
    const { source } = await createAidokuMangaSource(
      new ArrayBuffer(0),
      "registry:test.source",
      createCacheStore()
    );

    const blob = await source.fetchImage("/covers/cover-2.jpg");

    expect(fakeAsyncSource.processCoverImage).toHaveBeenCalledTimes(1);
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(
      new Uint8Array([0xff, 0xd8, 0xff, 0xd9])
    );
  });

  it("leaves covers untouched when the source has no cover processor", async () => {
    fakeAsyncSource.hasCoverImageProcessor = mock(async () => false);
    fakeAsyncSource.modifyImageRequest = mock(async () => ({
      url: "https://images.example/covers/cover-3.jpg",
      headers: {},
    }));

    globalThis.fetch = mock(
      async () =>
        new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), {
          headers: { "Content-Type": "image/jpeg" },
        })
    ) as unknown as typeof fetch;

    const { createAidokuMangaSource } = await import("./adapter");
    const { source } = await createAidokuMangaSource(
      new ArrayBuffer(0),
      "registry:test.source",
      createCacheStore()
    );

    await source.fetchImage("/covers/cover-3.jpg");

    expect(fakeAsyncSource.processCoverImage).not.toHaveBeenCalled();
    expect(fakeAsyncSource.processPageImage).not.toHaveBeenCalled();
  });

  it("keeps pages on the page processor without consulting the cover processor", async () => {
    const processedBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    fakeAsyncSource.hasImageProcessor = mock(async () => true);
    fakeAsyncSource.processPageImage = mock(async () => processedBytes);
    fakeAsyncSource.hasCoverImageProcessor = mock(async () => true);

    globalThis.fetch = mock(
      async () =>
        new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), {
          headers: { "Content-Type": "image/jpeg" },
        })
    ) as unknown as typeof fetch;

    const { createAidokuMangaSource } = await import("./adapter");
    const { source } = await createAidokuMangaSource(
      new ArrayBuffer(0),
      "registry:test.source",
      createCacheStore()
    );

    const [page] = await source.getPages("manga-1", "chapter-1");
    const blob = await page.getImage();

    expect(fakeAsyncSource.processPageImage).toHaveBeenCalledTimes(1);
    expect(fakeAsyncSource.processCoverImage).not.toHaveBeenCalled();
    expect(fakeAsyncSource.hasCoverImageProcessor).not.toHaveBeenCalled();
    expect(blob.type).toBe("image/png");
  });

  it("keeps a context-less page off the cover processor", async () => {
    // `AidokuPage.context` is optional. A page without one must still be
    // routed by the page processor of a source that also exports
    // `process_cover_image`, never by the cover processor.
    const processedBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    fakeAsyncSource.getPageList = mock(async () => [
      { index: 0, url: "/uploads/pages/page-no-context.jpg" },
    ]);
    fakeAsyncSource.hasImageProcessor = mock(async () => true);
    fakeAsyncSource.processPageImage = mock(async () => processedBytes);
    fakeAsyncSource.hasCoverImageProcessor = mock(async () => true);
    fakeAsyncSource.processCoverImage = mock(async () => processedBytes);
    fakeAsyncSource.modifyImageRequest = mock(async () => ({
      url: "https://images.example/pages/page-no-context.jpg",
      headers: {},
    }));

    globalThis.fetch = mock(
      async () =>
        new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), {
          headers: { "Content-Type": "image/jpeg" },
        })
    ) as unknown as typeof fetch;

    const { createAidokuMangaSource } = await import("./adapter");
    const { source } = await createAidokuMangaSource(
      new ArrayBuffer(0),
      "registry:test.source",
      createCacheStore()
    );

    const [page] = await source.getPages("manga-1", "chapter-1");
    const blob = await page.getImage();

    expect(fakeAsyncSource.processPageImage).toHaveBeenCalledTimes(1);
    expect(fakeAsyncSource.processPageImage.mock.calls[0][1]).toBeNull();
    expect(fakeAsyncSource.processCoverImage).not.toHaveBeenCalled();
    expect(fakeAsyncSource.hasCoverImageProcessor).not.toHaveBeenCalled();
    expect(blob.type).toBe("image/png");
  });

  it("does not share one cache entry between a page and a cover of the same URL", async () => {
    // Same URL, no page context: only the declared kind separates the two, so
    // the cover must not be served the page's memoized/persisted bytes.
    const coverBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    fakeAsyncSource.getPageList = mock(async () => [
      { index: 0, url: "https://images.example/shared.jpg" },
    ]);
    fakeAsyncSource.hasImageProcessor = mock(async () => false);
    fakeAsyncSource.hasCoverImageProcessor = mock(async () => true);
    fakeAsyncSource.processCoverImage = mock(async () => coverBytes);
    fakeAsyncSource.modifyImageRequest = mock(async (url: string) => ({
      url,
      headers: {},
    }));

    globalThis.fetch = mock(
      async () =>
        new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), {
          headers: { "Content-Type": "image/jpeg" },
        })
    ) as unknown as typeof fetch;

    const { createAidokuMangaSource } = await import("./adapter");
    const { source } = await createAidokuMangaSource(
      new ArrayBuffer(0),
      "registry:test.source",
      createCacheStore()
    );

    const [page] = await source.getPages("manga-1", "chapter-1");
    const pageBlob = await page.getImage();
    const coverBlob = await source.fetchImage("https://images.example/shared.jpg");

    expect(new Uint8Array(await pageBlob.arrayBuffer())).toEqual(
      new Uint8Array([0xff, 0xd8, 0xff, 0xd9])
    );
    expect(fakeAsyncSource.processCoverImage).toHaveBeenCalledTimes(1);
    expect(coverBlob.type).toBe("image/png");
    expect(new Uint8Array(await coverBlob.arrayBuffer())).toEqual(coverBytes);
  });
  it("keeps serving pages cached under the pre-upgrade key", async () => {
    // The kind split must not orphan already-downloaded pages: a page's
    // persisted key stays the legacy un-prefixed `url:context` identity.
    const cachedBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const legacyKey = CacheKeys.image(
      `/uploads/pages/page-1.jpg:${JSON.stringify({
        width: "800",
        height: "1200",
      })}`
    );
    const seed = new Map<string, unknown>([[legacyKey, cachedBytes.buffer]]);

    globalThis.fetch = mock(async () => {
      throw new Error("network must not be used for a cached page");
    }) as unknown as typeof fetch;

    const { createAidokuMangaSource } = await import("./adapter");
    const { source } = await createAidokuMangaSource(
      new ArrayBuffer(0),
      "registry:test.source",
      createCacheStore(seed)
    );

    const [page] = await source.getPages("manga-1", "chapter-1");
    const blob = await page.getImage();

    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(cachedBytes);
    expect(fakeAsyncSource.modifyImageRequest).not.toHaveBeenCalled();
  });

  it("does not serve a cover from the legacy page cache entry", async () => {
    // Cover bytes can differ from page bytes for the same URL, so covers are
    // the only kind that moved to a prefixed key.
    const legacyKey = CacheKeys.image("https://images.example/shared.jpg:null");
    const seed = new Map<string, unknown>([
      [legacyKey, new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer],
    ]);
    const freshBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    fakeAsyncSource.modifyImageRequest = mock(async (url: string) => ({
      url,
      headers: {},
    }));

    globalThis.fetch = mock(
      async () =>
        new Response(freshBytes, { headers: { "Content-Type": "image/png" } })
    ) as unknown as typeof fetch;

    const { createAidokuMangaSource } = await import("./adapter");
    const { source } = await createAidokuMangaSource(
      new ArrayBuffer(0),
      "registry:test.source",
      createCacheStore(seed)
    );

    const blob = await source.fetchImage("https://images.example/shared.jpg");

    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(freshBytes);
  });

  it("falls back to the raw cover bytes when the cover processor throws", async () => {
    // A throwing processor used to reject out of fetchImage and blank the
    // whole grid; the unprocessed bytes are still a usable cover.
    fakeAsyncSource.hasCoverImageProcessor = mock(async () => true);
    fakeAsyncSource.processCoverImage = mock(async () => {
      throw new Error("processor exploded");
    });
    fakeAsyncSource.modifyImageRequest = mock(async () => ({
      url: "https://images.example/covers/cover-4.jpg",
      headers: {},
    }));

    globalThis.fetch = mock(
      async () =>
        new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), {
          headers: { "Content-Type": "image/jpeg" },
        })
    ) as unknown as typeof fetch;

    const { createAidokuMangaSource } = await import("./adapter");
    const { source } = await createAidokuMangaSource(
      new ArrayBuffer(0),
      "registry:test.source",
      createCacheStore()
    );

    const blob = await source.fetchImage("/covers/cover-4.jpg");

    expect(fakeAsyncSource.processCoverImage).toHaveBeenCalledTimes(1);
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(
      new Uint8Array([0xff, 0xd8, 0xff, 0xd9])
    );
  });

  it("falls back to the raw page bytes when the page processor throws", async () => {
    fakeAsyncSource.hasImageProcessor = mock(async () => true);
    fakeAsyncSource.processPageImage = mock(async () => {
      throw new Error("processor exploded");
    });

    globalThis.fetch = mock(
      async () =>
        new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), {
          headers: { "Content-Type": "image/jpeg" },
        })
    ) as unknown as typeof fetch;

    const { createAidokuMangaSource } = await import("./adapter");
    const { source } = await createAidokuMangaSource(
      new ArrayBuffer(0),
      "registry:test.source",
      createCacheStore()
    );

    const [page] = await source.getPages("manga-1", "chapter-1");
    const blob = await page.getImage();

    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(
      new Uint8Array([0xff, 0xd8, 0xff, 0xd9])
    );
  });

  it("lets a Cloudflare block from the cover processor propagate", async () => {
    // The bypass dialog is driven by this rejection reaching handleSourceError,
    // so a Cloudflare block must not be swallowed by the fallback.
    const blocked = new Error("blocked by challenge page");
    blocked.name = "CloudflareBlockedError";
    fakeAsyncSource.hasCoverImageProcessor = mock(async () => true);
    fakeAsyncSource.processCoverImage = mock(async () => {
      throw blocked;
    });
    fakeAsyncSource.modifyImageRequest = mock(async () => ({
      url: "https://images.example/covers/cover-5.jpg",
      headers: {},
    }));

    globalThis.fetch = mock(
      async () =>
        new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), {
          headers: { "Content-Type": "image/jpeg" },
        })
    ) as unknown as typeof fetch;

    const { createAidokuMangaSource } = await import("./adapter");
    const { source } = await createAidokuMangaSource(
      new ArrayBuffer(0),
      "registry:test.source",
      createCacheStore()
    );

    await expect(source.fetchImage("/covers/cover-5.jpg")).rejects.toThrow(
      "blocked by challenge page"
    );
  });
});
