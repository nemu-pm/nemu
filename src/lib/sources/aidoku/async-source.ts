// Async source wrapper using Web Worker and Comlink
// Provides non-blocking API for WASM source operations
import * as Comlink from "comlink";
import type {
  Manga,
  Chapter,
  Page,
  MangaPageResult,
  Filter,
  FilterValue,
  Listing,
  SourceManifest,
  HomeLayout,
} from "./types";
import type {
  WorkerSourceApi,
} from "./source.worker";
import { getSourceSettingsStore } from "../../../stores/source-settings";
import { extractDefaults } from "@/lib/settings";

/**
 * Async source interface - mirrors AidokuSource but with async methods
 */
export interface AsyncAidokuSource {
  id: string;
  manifest: SourceManifest;
  getSearchMangaList(
    query: string | null,
    page: number,
    filters: FilterValue[]
  ): Promise<MangaPageResult>;
  getMangaDetails(manga: Manga): Promise<Manga>;
  getChapterList(manga: Manga): Promise<Chapter[]>;
  getPageList(manga: Manga, chapter: Chapter): Promise<Page[]>;
  getFilters(): Promise<Filter[]>;
  getListings(): Promise<Listing[]>;
  getMangaListForListing(listing: Listing, page: number): Promise<MangaPageResult>;
  hasListingProvider(): Promise<boolean>;
  hasHomeProvider(): Promise<boolean>;
  getHome(): Promise<HomeLayout | null>;
  /** Get home with progressive partial updates streamed via callback */
  getHomeWithPartials(onPartial: (layout: HomeLayout) => void): Promise<HomeLayout | null>;
  modifyImageRequest(
    url: string
  ): Promise<{ url: string; headers: Record<string, string> }>;
  hasImageProcessor(): Promise<boolean>;
  processPageImage(
    imageData: Uint8Array,
    context: Record<string, string> | null,
    requestUrl: string,
    requestHeaders: Record<string, string>,
    responseCode: number,
    responseHeaders: Record<string, string>
  ): Promise<Uint8Array | null>;
  terminate(): void;
}

/**
 * Get merged settings (defaults + user values) for a source
 */
function getMergedSettings(sourceKey: string): Record<string, unknown> {
  const state = getSourceSettingsStore().getState();
  const schema = state.schemas.get(sourceKey);
  const defaults = schema ? extractDefaults(schema) : {};
  const userValues = state.values.get(sourceKey) ?? {};
  return { ...defaults, ...userValues };
}

/**
 * Create an async source that runs in a Web Worker
 * @param wasmUrlOrBytes - URL to fetch WASM from, or ArrayBuffer of WASM bytes
 * @param sourceKey - Unique identifier (registryId:sourceId) for settings/storage
 */
export async function createAsyncSource(
  wasmUrlOrBytes: string | ArrayBuffer,
  manifest: SourceManifest,
  sourceKey: string
): Promise<AsyncAidokuSource> {
  // Create a new worker for this source
  const worker = new Worker(
    new URL("./source.worker.ts", import.meta.url),
    { type: "module" }
  );

  // Wrap with Comlink
  const workerSource = Comlink.wrap<WorkerSourceApi>(worker);

  // Get initial settings from main thread's store
  const initialSettings = getMergedSettings(sourceKey);

  // Load the source in the worker with initial settings
  const loaded =
    typeof wasmUrlOrBytes === "string"
      ? await workerSource.load(wasmUrlOrBytes, manifest, sourceKey, initialSettings)
      : await workerSource.load(
          Comlink.transfer(wasmUrlOrBytes, [wasmUrlOrBytes]),
          manifest,
          sourceKey,
          initialSettings
        );
  if (!loaded) {
    worker.terminate();
    throw new Error(`Failed to load source: ${sourceKey}`);
  }

  // Subscribe to settings changes and push to worker
  const unsubscribe = getSourceSettingsStore().subscribe((state, prevState) => {
    const newValues = state.values.get(sourceKey);
    const oldValues = prevState.values.get(sourceKey);
    // Only push if this source's values changed
    if (newValues !== oldValues) {
      const merged = getMergedSettings(sourceKey);
      workerSource.updateSettings(merged);
    }
  });

  // Return async wrapper
  return {
    id: manifest.info.id,
    manifest,

    async getSearchMangaList(
      query: string | null,
      page: number,
      filters: FilterValue[]
    ): Promise<MangaPageResult> {
      return workerSource.getSearchMangaList(query, page, filters);
    },

    async getMangaDetails(manga: Manga): Promise<Manga> {
      return workerSource.getMangaDetails(manga);
    },

    async getChapterList(manga: Manga): Promise<Chapter[]> {
      return workerSource.getChapterList(manga);
    },

    async getPageList(manga: Manga, chapter: Chapter): Promise<Page[]> {
      return workerSource.getPageList(manga, chapter);
    },

    async getFilters(): Promise<Filter[]> {
      console.log("[AsyncSource] getFilters called");
      const result = await workerSource.getFilters();
      console.log("[AsyncSource] getFilters result:", result);
      return result;
    },

    async getListings(): Promise<Listing[]> {
      return workerSource.getListings();
    },

    async getMangaListForListing(listing: Listing, page: number): Promise<MangaPageResult> {
      return workerSource.getMangaListForListing(listing, page);
    },

    async hasListingProvider(): Promise<boolean> {
      return workerSource.hasListingProvider();
    },

    async hasHomeProvider(): Promise<boolean> {
      return workerSource.hasHomeProvider();
    },

    async getHome(): Promise<HomeLayout | null> {
      return workerSource.getHome();
    },

    async getHomeWithPartials(onPartial: (layout: HomeLayout) => void): Promise<HomeLayout | null> {
      // Wrap callback with Comlink.proxy so it can be invoked from the worker
      return workerSource.getHomeWithPartials(Comlink.proxy(onPartial));
    },

    async modifyImageRequest(
      url: string
    ): Promise<{ url: string; headers: Record<string, string> }> {
      return workerSource.modifyImageRequest(url);
    },

    async hasImageProcessor(): Promise<boolean> {
      return workerSource.hasImageProcessor();
    },

    async processPageImage(
      imageData: Uint8Array,
      context: Record<string, string> | null,
      requestUrl: string,
      requestHeaders: Record<string, string>,
      responseCode: number,
      responseHeaders: Record<string, string>
    ): Promise<Uint8Array | null> {
      // Transfer underlying buffer to avoid an extra copy across the worker boundary.
      // Note: this detaches `imageData.buffer` in the caller.
      return workerSource.processPageImage(
        Comlink.transfer(imageData, [imageData.buffer]),
        context,
        requestUrl,
        requestHeaders,
        responseCode,
        responseHeaders
      );
    },

    terminate(): void {
      unsubscribe();
      worker.terminate();
    },
  };
}
