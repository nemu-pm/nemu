import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { strToU8, zipSync } from "fflate";
import type { InstalledSource } from "@/data/schema";
import {
  detectProcessedImageMimeType,
  MOBILE_READER_PROCESSED_IMAGE_MAX_BYTES,
  mapAidokuPageToReaderPage,
  refreshMobileReaderPages,
  resolveMobileReaderChapterIndex,
} from "./mobileSourcePages";
import { defaultMobileSourceSessionCache } from "./mobileSourceExecutorCache";
import type {
  MobileAidokuExecutorBridge,
  MobileAidokuExecutorSource,
} from "./mobileSourceExecutor";

const VALID_PNG_BYTES = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10,
  0, 0, 0, 13, 73, 72, 68, 82,
  0, 0, 0, 2, 0, 0, 0, 3,
]);
const VALID_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAIAAAAD";
const VALID_PNG_DATA_URI = `data:image/png;base64,${VALID_PNG_BASE64}`;

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
      return { key: manga.key, title: manga.key };
    },
    async getChapterList() {
      return [
        { key: "c1", chapterNumber: 1, title: "Start" },
        { key: "c3", chapterNumber: 3, title: "Latest" },
        { key: "c2", chapterNumber: 2, title: "Selected", lang: "ja" },
      ];
    },
    async getPageList(_manga, chapter) {
      return [
        { index: 0, url: `https://example.test/${chapter.key}/001.jpg` },
        { index: 1, url: `https://example.test/${chapter.key}/002.jpg` },
      ];
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
      return { url, headers: { Referer: "https://example.test" } };
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

function fetchResponse(response: Response): typeof fetch {
  return Object.assign(async () => response, {
    preconnect: () => undefined,
  }) as typeof fetch;
}

describe("mobile source reader pages", () => {
  test("detects processed image formats from their byte signatures", () => {
    expect(
      detectProcessedImageMimeType(
        new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
      ),
    ).toBe("image/png");
    expect(
      detectProcessedImageMimeType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])),
    ).toBe("image/jpeg");
    expect(
      detectProcessedImageMimeType(
        new Uint8Array([
          0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
        ]),
      ),
    ).toBe("image/webp");
    expect(detectProcessedImageMimeType(new Uint8Array([1, 2, 3]))).toBeNull();
  });

  beforeEach(async () => {
    await defaultMobileSourceSessionCache.clear();
  });

  afterEach(async () => {
    await defaultMobileSourceSessionCache.clear();
  });

  test("maps Aidoku page URLs and base64 data into renderable reader pages", () => {
    expect(mapAidokuPageToReaderPage({ index: 3, url: "https://example.test/p.jpg" }, 0)).toEqual({
      id: "3:https://example.test/p.jpg",
      index: 3,
      imageUri: "https://example.test/p.jpg",
      imageUriOwnership: "source",
      headers: undefined,
      text: undefined,
      context: undefined,
    });
    expect(
      mapAidokuPageToReaderPage(
        { index: 4, url: "https://example.test/p2.jpg" },
        0,
        { url: "https://proxy.test/p2.jpg", headers: { Referer: "https://example.test" } }
      )
    ).toMatchObject({
      id: "4:https://proxy.test/p2.jpg",
      imageUri: "https://proxy.test/p2.jpg",
      imageUriOwnership: "source",
      headers: { Referer: "https://example.test" },
    });
    expect(
      mapAidokuPageToReaderPage({ index: 0, base64: VALID_PNG_BASE64 }, 0),
    ).toMatchObject({
      id: "b:0:0",
      index: 0,
      imageUri: VALID_PNG_DATA_URI,
      imageUriOwnership: "app",
    });
    const rejectedDataPage = mapAidokuPageToReaderPage(
      { index: 1, base64: "data:text/html;base64,PHNjcmlwdD4=" },
      1,
    );
    expect(rejectedDataPage).toMatchObject({
      id: "1:1",
      index: 1,
    });
    expect(rejectedDataPage.imageUri).toBeUndefined();
    expect(rejectedDataPage.imageUriOwnership).toBeUndefined();
    const mismatchedMimePage = mapAidokuPageToReaderPage(
      { index: 2, base64: "data:image/png;base64,/9j/4A==" },
      2,
    );
    expect(mismatchedMimePage.imageUri).toBeUndefined();
    expect(mismatchedMimePage.imageUriOwnership).toBeUndefined();
    const oversizedDimensionPage = mapAidokuPageToReaderPage(
      { index: 3, base64: "iVBORw0KGgoAAAANSUhEUgAAQAEAAAAB" },
      3,
    );
    expect(oversizedDimensionPage.imageUri).toBeUndefined();
    expect(oversizedDimensionPage.imageUriOwnership).toBeUndefined();
  });

  test("fetches pages using the matched source chapter and retains the cached session", async () => {
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

    const result = await refreshMobileReaderPages(
      installedSource(),
      "blue-lock",
      { id: "c2", chapterNumber: 2 },
      {
        executor: {
          bridge,
          readBytes: async () => makeAixPackage(),
        },
        now: () => 1234,
      },
    );
    expect(result).toMatchObject({
      status: "ready",
      runtime: "native-aidoku",
      chapter: { id: "c2", title: "Selected", chapterNumber: 2, lang: "ja" },
      fetchedAt: 1234,
      chapters: [
        { id: "c3", title: "Latest", chapterNumber: 3 },
        { id: "c2", title: "Selected", chapterNumber: 2, lang: "ja" },
        { id: "c1", title: "Start", chapterNumber: 1 },
      ],
      pages: [
        {
          id: "0:https://example.test/c2/001.jpg",
          index: 0,
          imageUri: "https://example.test/c2/001.jpg",
          headers: undefined,
          imageProcessing: "pending",
        },
        {
          id: "1:https://example.test/c2/002.jpg",
          index: 1,
          imageUri: "https://example.test/c2/002.jpg",
          headers: undefined,
          imageProcessing: "pending",
        },
      ],
    });
    if (result.status !== "ready" || !result.pageProcessor) {
      throw new Error("expected a lazy page processor");
    }
    expect((await result.pageProcessor.processWindow(0))?.pages).toMatchObject([
      {
        headers: { Referer: "https://example.test" },
        imageProcessing: "fallback",
      },
      {
        headers: { Referer: "https://example.test" },
        imageProcessing: "fallback",
      },
    ]);
    expect(disposed).toBe(false);
    await defaultMobileSourceSessionCache.clear();
    expect(disposed).toBe(true);
  });

  test("starts the requested page list before the full chapter list resolves", async () => {
    let chapterListResolved = false;
    let pageListStartedBeforeChapterListResolved = false;
    const bridge: MobileAidokuExecutorBridge = {
      async loadSource() {
        return {
          status: "ready",
          runtime: "native-aidoku",
          source: makeExecutorSource(undefined, {
            async getChapterList() {
              await Promise.resolve();
              chapterListResolved = true;
              return [{ key: "c2", chapterNumber: 2 }];
            },
            async getPageList(_manga, chapter) {
              pageListStartedBeforeChapterListResolved = !chapterListResolved;
              return [
                {
                  index: 0,
                  url: `https://example.test/${chapter.key}/001.jpg`,
                },
              ];
            },
          }),
        };
      },
    };

    const result = await refreshMobileReaderPages(
      installedSource(),
      "blue-lock",
      { id: "c2", chapterNumber: 2 },
      { executor: { bridge, readBytes: async () => makeAixPackage() } },
    );

    expect(result.status).toBe("ready");
    expect(pageListStartedBeforeChapterListResolved).toBe(true);
  });

  test("hands over the first paint before the chapter index resolves", async () => {
    let chapterListSettled = false;
    const bridge: MobileAidokuExecutorBridge = {
      async loadSource() {
        return {
          status: "ready",
          runtime: "native-aidoku",
          source: makeExecutorSource(undefined, {
            async getChapterList() {
              await new Promise((resolve) => setTimeout(resolve, 20));
              chapterListSettled = true;
              return [{ key: "c2", chapterNumber: 2, title: "Selected" }];
            },
          }),
        };
      },
    };

    const firstPaints: {
      pages: number;
      chapterId: string;
      fetchedAt: number;
      chapterListSettled: boolean;
    }[] = [];
    const result = await refreshMobileReaderPages(
      installedSource(),
      "blue-lock",
      { id: "c2", chapterNumber: 2 },
      {
        executor: { bridge, readBytes: async () => makeAixPackage() },
        now: () => 1234,
        onPagesReady: (firstPaint) => {
          firstPaints.push({
            pages: firstPaint.pages.length,
            chapterId: firstPaint.chapter.id,
            fetchedAt: firstPaint.fetchedAt,
            chapterListSettled,
          });
        },
      },
    );

    // The page list is handed over while the chapter index is still in flight.
    expect(firstPaints).toEqual([
      {
        pages: 2,
        chapterId: "c2",
        fetchedAt: 1234,
        chapterListSettled: false,
      },
    ]);
    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error("expected ready");
    // Both halves describe the same fetch, so the reader's restore identity
    // does not change when the index lands.
    expect(result.fetchedAt).toBe(1234);
    expect(result.pages).toHaveLength(2);
    expect(result.chapters.map((item) => item.id)).toEqual(["c2"]);
  });

  test("keeps the pages when the chapter index request fails", async () => {
    const bridge: MobileAidokuExecutorBridge = {
      async loadSource() {
        return {
          status: "ready",
          runtime: "native-aidoku",
          source: makeExecutorSource(undefined, {
            async getChapterList() {
              throw new Error("chapter index unavailable");
            },
          }),
        };
      },
    };

    const result = await refreshMobileReaderPages(
      installedSource(),
      "blue-lock",
      { id: "c2", chapterNumber: 2 },
      { executor: { bridge, readBytes: async () => makeAixPackage() } },
    );

    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error("expected ready");
    expect(result.pages).toHaveLength(2);
    // No adjacent-chapter navigation, but the chapter still reads.
    expect(result.chapters).toEqual([]);
    expect(result.chapter.id).toBe("c2");
  });

  test("trusts only validated resolvePageImage data as app-owned", async () => {
    const bridge: MobileAidokuExecutorBridge = {
      async loadSource() {
        return {
          status: "ready",
          runtime: "native-aidoku",
          source: makeExecutorSource(undefined, {
            async getPageList() {
              return [
                { index: 0, url: "https://example.test/resolved.jpg" },
              ];
            },
            async resolvePageImage() {
              return VALID_PNG_BASE64;
            },
          }),
        };
      },
    };

    const result = await refreshMobileReaderPages(
      installedSource(),
      "blue-lock",
      { id: "c2", chapterNumber: 2 },
      { executor: { bridge, readBytes: async () => makeAixPackage() } },
    );
    if (result.status !== "ready" || !result.pageProcessor) {
      throw new Error("expected a page processor");
    }

    expect((await result.pageProcessor.processWindow(0))?.pages[0]).toMatchObject({
      imageUri: VALID_PNG_DATA_URI,
      imageUriOwnership: "app",
      imageProcessing: "ready",
    });
  });

  test("processes context pages with the source image processor", async () => {
    const bridge: MobileAidokuExecutorBridge = {
      async loadSource() {
        return {
          status: "ready",
          runtime: "native-aidoku",
          source: makeExecutorSource(undefined, {
            async getPageList() {
              return [
                {
                  index: 0,
                  url: "https://example.test/scrambled.jpg",
                  context: { mode: "descramble" },
                },
              ];
            },
            async hasImageProcessor() {
              return true;
            },
            async processPageImage(imageData, context, requestUrl, requestHeaders, responseCode, responseHeaders) {
              expect(imageData).toEqual(new Uint8Array([1, 2, 3]));
              expect(context).toEqual({ mode: "descramble" });
              expect(requestUrl).toBe("https://example.test/scrambled.jpg");
              expect(requestHeaders).toEqual({ Referer: "https://example.test" });
              expect(responseCode).toBe(200);
              expect(responseHeaders).toEqual({ "content-type": "image/jpeg" });
              return VALID_PNG_BYTES.slice();
            },
          }),
        };
      },
    };

    const result = await refreshMobileReaderPages(
      installedSource(),
      "blue-lock",
      { id: "c2", chapterNumber: 2 },
      {
        executor: {
          bridge,
          readBytes: async () => makeAixPackage(),
        },
        processPageImages: true,
        fetchImpl: fetchResponse(
          new Response(new Uint8Array([1, 2, 3]), {
            status: 200,
            headers: { "content-type": "image/jpeg" },
          }),
        ),
      }
    );

    expect(result).toMatchObject({
      status: "ready",
      pages: [
        {
          id: "0:https://example.test/scrambled.jpg",
          index: 0,
          imageProcessing: "pending",
          context: { mode: "descramble" },
        },
      ],
    });
    if (result.status !== "ready") throw new Error("expected ready pages");
    const processed = await result.pageProcessor?.processWindow(0);
    expect(processed?.pages).toMatchObject([
      {
        id: "0:https://example.test/scrambled.jpg",
        index: 0,
        imageUri: VALID_PNG_DATA_URI,
        imageUriOwnership: "app",
        headers: undefined,
        imageProcessing: "ready",
        context: { mode: "descramble" },
      },
    ]);
  });

  test("falls back before base64-expanding an oversized processor result", async () => {
    const bridge: MobileAidokuExecutorBridge = {
      async loadSource() {
        return {
          status: "ready",
          runtime: "native-aidoku",
          source: makeExecutorSource(undefined, {
            async getPageList() {
              return [
                {
                  index: 0,
                  url: "https://example.test/oversized.jpg",
                  context: { mode: "descramble" },
                },
              ];
            },
            async hasImageProcessor() {
              return true;
            },
            async processPageImage() {
              return new Uint8Array(
                MOBILE_READER_PROCESSED_IMAGE_MAX_BYTES + 1,
              );
            },
          }),
        };
      },
    };

    const result = await refreshMobileReaderPages(
      installedSource(),
      "blue-lock",
      { id: "c2", chapterNumber: 2 },
      {
        executor: { bridge, readBytes: async () => makeAixPackage() },
        processPageImages: true,
        fetchImpl: Object.assign(
          async () =>
            new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
          { preconnect: () => undefined },
        ) as typeof fetch,
      },
    );
    if (result.status !== "ready" || !result.pageProcessor) {
      throw new Error("expected a page processor");
    }

    expect((await result.pageProcessor.processWindow(0))?.pages[0]).toMatchObject({
      imageUri: "https://example.test/oversized.jpg",
      imageProcessing: "fallback",
    });
    expect(result.pageProcessor.cacheByteSize?.()).toBe(0);
  });

  test("does not trust processor output with unsafe decoded dimensions", async () => {
    const unsafePng = new Uint8Array([
      137, 80, 78, 71, 13, 10, 26, 10,
      0, 0, 0, 13, 73, 72, 68, 82,
      0, 0, 0x40, 0x01, 0, 0, 0, 1,
    ]);
    const bridge: MobileAidokuExecutorBridge = {
      async loadSource() {
        return {
          status: "ready",
          runtime: "native-aidoku",
          source: makeExecutorSource(undefined, {
            async getPageList() {
              return [
                {
                  index: 0,
                  url: "https://example.test/unsafe-dimensions.jpg",
                  context: { mode: "descramble" },
                },
              ];
            },
            async hasImageProcessor() {
              return true;
            },
            async processPageImage() {
              return unsafePng;
            },
          }),
        };
      },
    };

    const result = await refreshMobileReaderPages(
      installedSource(),
      "blue-lock",
      { id: "c2", chapterNumber: 2 },
      {
        executor: { bridge, readBytes: async () => makeAixPackage() },
        processPageImages: true,
        fetchImpl: Object.assign(
          async () =>
            new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
          { preconnect: () => undefined },
        ) as typeof fetch,
      },
    );
    if (result.status !== "ready" || !result.pageProcessor) {
      throw new Error("expected a page processor");
    }

    expect((await result.pageProcessor.processWindow(0))?.pages[0]).toMatchObject({
      imageUri: "https://example.test/unsafe-dimensions.jpg",
      imageUriOwnership: "source",
      imageProcessing: "fallback",
    });
    expect(result.pageProcessor.cacheByteSize?.()).toBe(0);
  });

  test("accepts the exact aggregate byte limit and evicts the next data URI", async () => {
    const processedUri = VALID_PNG_DATA_URI;
    const bridge: MobileAidokuExecutorBridge = {
      async loadSource() {
        return {
          status: "ready",
          runtime: "native-aidoku",
          source: makeExecutorSource(undefined, {
            async getPageList() {
              return [0, 1].map((index) => ({
                index,
                url: `https://example.test/${index}.jpg`,
                context: { mode: "descramble" },
              }));
            },
            async hasImageProcessor() {
              return true;
            },
            async processPageImage() {
              return VALID_PNG_BYTES.slice();
            },
          }),
        };
      },
    };
    const result = await refreshMobileReaderPages(
      installedSource(),
      "blue-lock",
      { id: "c2", chapterNumber: 2 },
      {
        executor: { bridge, readBytes: async () => makeAixPackage() },
        processPageImages: true,
        pageProcessingWindowRadius: 0,
        pageProcessingCacheSize: 7,
        pageProcessingCacheMaxBytes: processedUri.length * 2,
        fetchImpl: Object.assign(
          async () =>
            new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
          { preconnect: () => undefined },
        ) as typeof fetch,
      },
    );
    if (result.status !== "ready" || !result.pageProcessor) {
      throw new Error("expected a page processor");
    }

    expect((await result.pageProcessor.processWindow(0))?.pages[0]).toMatchObject({
      imageUri: processedUri,
      imageProcessing: "ready",
    });
    const second = await result.pageProcessor.processWindow(1);
    expect(result.pageProcessor.cacheSize()).toBe(1);
    expect(result.pageProcessor.cacheByteSize?.()).toBe(processedUri.length * 2);
    expect(second?.pages[0]?.imageProcessing).toBe("pending");
    expect(second?.pages[1]).toMatchObject({
      imageUri: processedUri,
      imageProcessing: "ready",
    });
  });

  test("defers processing until requested and keeps a bounded near-page window", async () => {
    let fetchCalls = 0;
    let requestRewriteCalls = 0;
    const bridge: MobileAidokuExecutorBridge = {
      async loadSource() {
        return {
          status: "ready",
          runtime: "native-aidoku",
          source: makeExecutorSource(undefined, {
            async getPageList() {
              return Array.from({ length: 10 }, (_, index) => ({
                index,
                url: `https://example.test/${index}.jpg`,
                context: { mode: "descramble" },
              }));
            },
            async hasImageProcessor() {
              return true;
            },
            async modifyImageRequest(url) {
              requestRewriteCalls += 1;
              return { url, headers: { Referer: "https://example.test" } };
            },
            async processPageImage() {
              return VALID_PNG_BYTES.slice();
            },
          }),
        };
      },
    };
    const neighborsGate = Promise.withResolvers<void>();
    const fetchImpl = Object.assign(
      async () => {
        fetchCalls += 1;
        if (fetchCalls > 1) await neighborsGate.promise;
        return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      },
      { preconnect: () => undefined },
    ) as typeof fetch;

    const result = await refreshMobileReaderPages(
      installedSource(),
      "blue-lock",
      { id: "c2", chapterNumber: 2 },
      {
        executor: { bridge, readBytes: async () => makeAixPackage() },
        processPageImages: true,
        pageProcessingWindowRadius: 1,
        pageProcessingCacheSize: 3,
        fetchImpl,
      },
    );
    if (result.status !== "ready" || !result.pageProcessor) {
      throw new Error("expected a page processor");
    }
    expect(fetchCalls).toBe(0);
    expect(requestRewriteCalls).toBe(0);
    expect(result.pages.every((page) => page.imageProcessing === "pending")).toBe(true);

    const firstVisible = Promise.withResolvers<
      NonNullable<Awaited<ReturnType<typeof result.pageProcessor.processWindow>>>
    >();
    const firstPending = result.pageProcessor.processWindow(5, {
      onUpdate: firstVisible.resolve,
    });
    const firstVisibleResult = await firstVisible.promise;
    expect(firstVisibleResult.processedIndexes).toEqual([5]);
    expect(firstVisibleResult.pages[5]?.imageProcessing).toBe("ready");
    neighborsGate.resolve();
    const first = await firstPending;
    expect(first?.processedIndexes).toEqual([5, 4, 6]);
    expect(fetchCalls).toBe(3);
    expect(requestRewriteCalls).toBe(3);
    expect(result.pageProcessor.cacheSize()).toBe(3);

    const second = await result.pageProcessor.processWindow(8);
    expect(second?.processedIndexes).toEqual([8, 7, 9]);
    expect(fetchCalls).toBe(6);
    expect(requestRewriteCalls).toBe(6);
    expect(result.pageProcessor.cacheSize()).toBe(3);
    expect(second?.pages[5]?.imageProcessing).toBe("pending");
    expect(second?.pages[8]?.imageProcessing).toBe("ready");
  });

  test("skips stale page work after it waits in the per-source session queue", async () => {
    const firstEntered = Promise.withResolvers<void>();
    const releaseFirst = Promise.withResolvers<void>();
    const rewrittenIndexes: number[] = [];
    const bridge: MobileAidokuExecutorBridge = {
      async loadSource() {
        return {
          status: "ready",
          runtime: "native-aidoku",
          source: makeExecutorSource(undefined, {
            async getPageList() {
              return [0, 1, 2].map((index) => ({
                index,
                url: `https://example.test/${index}.jpg`,
              }));
            },
            async modifyImageRequest(url) {
              const index = Number(url.match(/\/(\d+)\.jpg$/)?.[1]);
              rewrittenIndexes.push(index);
              if (index === 0) {
                firstEntered.resolve();
                await releaseFirst.promise;
              }
              return { url, headers: {} };
            },
          }),
        };
      },
    };
    const result = await refreshMobileReaderPages(
      installedSource(),
      "blue-lock",
      { id: "c2", chapterNumber: 2 },
      {
        executor: { bridge, readBytes: async () => makeAixPackage() },
        pageProcessingWindowRadius: 0,
      },
    );
    if (result.status !== "ready" || !result.pageProcessor) {
      throw new Error("expected a page processor");
    }

    const first = result.pageProcessor.processWindow(0);
    await firstEntered.promise;
    const staleQueued = result.pageProcessor.processWindow(1);
    const latest = result.pageProcessor.processWindow(2);
    releaseFirst.resolve();

    expect(await first).toBeNull();
    expect(await staleQueued).toBeNull();
    expect((await latest)?.processedIndexes).toEqual([2]);
    expect(rewrittenIndexes).toEqual([0, 2]);
  });


  test("drops stale page-processing generations", async () => {
    const firstFetch = Promise.withResolvers<void>();
    let fetchCalls = 0;
    const bridge: MobileAidokuExecutorBridge = {
      async loadSource() {
        return {
          status: "ready",
          runtime: "native-aidoku",
          source: makeExecutorSource(undefined, {
            async getPageList() {
              return Array.from({ length: 4 }, (_, index) => ({
                index,
                url: `https://example.test/${index}.jpg`,
                context: { mode: "descramble" },
              }));
            },
            async hasImageProcessor() {
              return true;
            },
            async processPageImage() {
              return VALID_PNG_BYTES.slice();
            },
          }),
        };
      },
    };
    const fetchImpl = Object.assign(
      async () => {
        fetchCalls += 1;
        if (fetchCalls === 1) {
          await firstFetch.promise;
        }
        return new Response(new Uint8Array([1]), { status: 200 });
      },
      { preconnect: () => undefined },
    ) as typeof fetch;
    const result = await refreshMobileReaderPages(
      installedSource(),
      "blue-lock",
      { id: "c2", chapterNumber: 2 },
      {
        executor: { bridge, readBytes: async () => makeAixPackage() },
        processPageImages: true,
        pageProcessingWindowRadius: 0,
        pageProcessingCacheSize: 1,
        fetchImpl,
      },
    );
    if (result.status !== "ready" || !result.pageProcessor) {
      throw new Error("expected a page processor");
    }

    const stale = result.pageProcessor.processWindow(0);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const current = result.pageProcessor.processWindow(3);
    firstFetch.resolve();
    expect(await stale).toBeNull();
    expect((await current)?.pages[3]?.imageProcessing).toBe("ready");
  });

  test("falls back to the source image request when page processing fails", async () => {
    const bridge: MobileAidokuExecutorBridge = {
      async loadSource() {
        return {
          status: "ready",
          runtime: "native-aidoku",
          source: makeExecutorSource(undefined, {
            async getPageList() {
              return [
                {
                  index: 0,
                  url: "https://example.test/scrambled.jpg",
                  context: { mode: "descramble" },
                },
              ];
            },
            async hasImageProcessor() {
              return true;
            },
            async processPageImage() {
              return null;
            },
          }),
        };
      },
    };

    const result = await refreshMobileReaderPages(
      installedSource(),
      "blue-lock",
      { id: "c2", chapterNumber: 2 },
      {
        executor: {
          bridge,
          readBytes: async () => makeAixPackage(),
        },
        fetchImpl: fetchResponse(
          new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
        ),
        processPageImages: true,
      }
    );

    if (result.status !== "ready" || !result.pageProcessor) {
      throw new Error("expected a lazy page processor");
    }
    expect(result.pages[0]?.imageProcessing).toBe("pending");
    expect((await result.pageProcessor.processWindow(0))?.pages).toMatchObject([
      {
        id: "0:https://example.test/scrambled.jpg",
        imageUri: "https://example.test/scrambled.jpg",
        headers: { Referer: "https://example.test" },
        context: { mode: "descramble" },
        imageProcessing: "fallback",
      },
    ]);
  });

  test("keeps reader pages loadable when image request metadata fails", async () => {
    const bridge: MobileAidokuExecutorBridge = {
      async loadSource() {
        return {
          status: "ready",
          runtime: "native-aidoku",
          source: makeExecutorSource(undefined, {
            async modifyImageRequest() {
              throw new Error("request metadata failed");
            },
          }),
        };
      },
    };

    const result = await refreshMobileReaderPages(
      installedSource(),
      "blue-lock",
      { id: "c2", chapterNumber: 2 },
      {
        executor: {
          bridge,
          readBytes: async () => makeAixPackage(),
        },
      }
    );

    if (result.status !== "ready" || !result.pageProcessor) {
      throw new Error("expected a lazy page processor");
    }
    expect((await result.pageProcessor.processWindow(0))?.pages).toMatchObject([
      {
        id: "0:https://example.test/c2/001.jpg",
        imageUri: "https://example.test/c2/001.jpg",
        headers: undefined,
        imageProcessing: "fallback",
      },
      {
        id: "1:https://example.test/c2/002.jpg",
        imageUri: "https://example.test/c2/002.jpg",
        headers: undefined,
        imageProcessing: "fallback",
      },
    ]);
  });

  test("issues the page list before the chapter index", async () => {
    // iOS runs sandbox operations on one serial queue, so the request issued
    // first owns it. The page list is the only half that gates the first paint.
    const issued: string[] = [];
    const bridge: MobileAidokuExecutorBridge = {
      async loadSource() {
        return {
          status: "ready",
          runtime: "native-aidoku",
          source: makeExecutorSource(undefined, {
            async getChapterList() {
              issued.push("chapters");
              return [{ key: "c2", chapterNumber: 2 }];
            },
            async getPageList(_manga, chapter) {
              issued.push("pages");
              return [
                { index: 0, url: `https://example.test/${chapter.key}/001.jpg` },
              ];
            },
          }),
        };
      },
    };

    const result = await refreshMobileReaderPages(
      installedSource(),
      "blue-lock",
      { id: "c2", chapterNumber: 2 },
      { executor: { bridge, readBytes: async () => makeAixPackage() } },
    );

    expect(result.status).toBe("ready");
    expect(issued).toEqual(["pages", "chapters"]);
  });

  test("reports a resolved chapter index as ready", async () => {
    const bridge: MobileAidokuExecutorBridge = {
      async loadSource() {
        return {
          status: "ready",
          runtime: "native-aidoku",
          source: makeExecutorSource(),
        };
      },
    };

    const result = await refreshMobileReaderPages(
      installedSource(),
      "blue-lock",
      { id: "c2", chapterNumber: 2 },
      { executor: { bridge, readBytes: async () => makeAixPackage() } },
    );

    expect(result).toMatchObject({
      status: "ready",
      chapterIndexStatus: "ready",
    });
    expect(
      result.status === "ready" ? result.chapters.length : 0,
    ).toBeGreaterThan(0);
  });

  test("an empty chapter index is still ready, not unavailable", async () => {
    const bridge: MobileAidokuExecutorBridge = {
      async loadSource() {
        return {
          status: "ready",
          runtime: "native-aidoku",
          source: makeExecutorSource(undefined, {
            async getChapterList() {
              return [];
            },
          }),
        };
      },
    };

    const result = await refreshMobileReaderPages(
      installedSource(),
      "blue-lock",
      { id: "c2", chapterNumber: 2 },
      { executor: { bridge, readBytes: async () => makeAixPackage() } },
    );

    expect(result).toMatchObject({
      status: "ready",
      chapters: [],
      chapterIndexStatus: "ready",
    });
  });

  test("marks a failed chapter index unavailable instead of an empty list", async () => {
    // The reader persists ready refreshes into a 7-day page-list cache; an
    // index failure must be distinguishable from a genuinely empty index.
    const bridge: MobileAidokuExecutorBridge = {
      async loadSource() {
        return {
          status: "ready",
          runtime: "native-aidoku",
          source: makeExecutorSource(undefined, {
            async getChapterList() {
              throw new Error("chapter index unavailable");
            },
          }),
        };
      },
    };

    const result = await refreshMobileReaderPages(
      installedSource(),
      "blue-lock",
      { id: "c2", chapterNumber: 2 },
      { executor: { bridge, readBytes: async () => makeAixPackage() } },
    );

    expect(result).toMatchObject({
      status: "ready",
      chapters: [],
      chapterIndexStatus: "unavailable",
    });
    // The pages still paint: a failed index never fails the refresh.
    expect(result.status === "ready" ? result.pages.length : 0).toBe(2);
  });

  test("returns blocked pages when the executor cannot load", async () => {
    await expect(
      refreshMobileReaderPages(installedSource(), "blue-lock", { id: "c1" }, {
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

describe("resolveMobileReaderChapterIndex", () => {
  const chapters = [{ id: "c1" }, { id: "c2" }];
  const cached = [{ id: "c0" }];

  test("a ready index always wins, even when it is legitimately empty", () => {
    expect(
      resolveMobileReaderChapterIndex({
        chapterIndexStatus: "ready",
        chapters,
        persistedChapters: cached,
      }),
    ).toBe(chapters);
    expect(
      resolveMobileReaderChapterIndex({
        chapterIndexStatus: "ready",
        chapters: [],
        persistedChapters: cached,
      }),
    ).toEqual([]);
  });

  test("an unavailable index keeps the last known chapters", () => {
    // Regression: the cache preserved them but the in-memory state took the
    // empty list, so adjacent-chapter navigation vanished for the session.
    expect(
      resolveMobileReaderChapterIndex({
        chapterIndexStatus: "unavailable",
        chapters: [],
        previousChapters: chapters,
        persistedChapters: cached,
      }),
    ).toBe(chapters);
    expect(
      resolveMobileReaderChapterIndex({
        chapterIndexStatus: "unavailable",
        chapters: [],
        persistedChapters: cached,
      }),
    ).toBe(cached);
  });

  test("empty fallbacks are skipped so first paint cannot pin an empty index", () => {
    // The reader blanks `chapters` on first paint, before the index lands.
    expect(
      resolveMobileReaderChapterIndex({
        chapterIndexStatus: "unavailable",
        chapters: [],
        previousChapters: [],
        persistedChapters: cached,
      }),
    ).toBe(cached);
    expect(
      resolveMobileReaderChapterIndex({
        chapterIndexStatus: "unavailable",
        chapters: [],
        previousChapters: [],
        persistedChapters: [],
      }),
    ).toBeUndefined();
  });
});
