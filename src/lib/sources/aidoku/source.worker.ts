// Web Worker for running Aidoku WASM sources off the main thread
// This allows sync XHR in net.ts to block the worker instead of the UI
import * as Comlink from "comlink";
import { loadSource, type AidokuSource } from "./runtime";
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

export interface ImageRequest {
  url: string;
  headers: Record<string, string>;
}

/**
 * Worker-side source wrapper that can be exposed via Comlink
 */
class WorkerSource {
  private source: AidokuSource | null = null;
  private sourceId: string = "";
  // Local settings storage - pushed from main thread, read by WASM
  private settings: Record<string, unknown> = {};

  /**
   * Get a setting value (used by WASM defaults.get)
   */
  getSetting(key: string): unknown {
    return this.settings[key];
  }

  /**
   * Update settings from main thread (called when user changes settings)
   */
  updateSettings(settings: Record<string, unknown>): void {
    this.settings = settings;
    console.log("[Worker] Settings updated:", Object.keys(settings).length, "keys");
  }

  async load(
    wasmUrlOrBytes: string | ArrayBuffer,
    manifest: SourceManifest,
    sourceKey: string,
    initialSettings: Record<string, unknown>
  ): Promise<boolean> {
    try {
      console.log("[Worker] Loading source:", sourceKey);
      
      // Store initial settings from main thread
      this.settings = initialSettings;
      console.log("[Worker] Initial settings:", Object.keys(initialSettings));
      
      // Pass settings getter to runtime so WASM can read from our local store
      const settingsGetter = (key: string) => this.getSetting(key);
      
      this.source = await loadSource(wasmUrlOrBytes, manifest, sourceKey, settingsGetter);
      this.source.initialize();
      this.sourceId = manifest.info.id;
      console.log("[Worker] Source loaded successfully");
      return true;
    } catch (e) {
      console.error("[Worker] Failed to load source:", e);
      return false;
    }
  }

  isLoaded(): boolean {
    return this.source !== null;
  }

  getId(): string {
    return this.sourceId;
  }

  getManifest(): SourceManifest | null {
    return this.source?.manifest ?? null;
  }

  getSearchMangaList(
    query: string | null,
    page: number,
    filters: FilterValue[]
  ): MangaPageResult {
    if (!this.source) {
      return { entries: [], hasNextPage: false };
    }

    return this.source.getSearchMangaList(query, page, filters);
  }

  getMangaDetails(manga: Manga): Manga {
    if (!this.source) {
      return manga;
    }

    return this.source.getMangaDetails(manga);
  }

  getChapterList(manga: Manga): Chapter[] {
    if (!this.source) {
      return [];
    }

    return this.source.getChapterList(manga);
  }

  getPageList(
    manga: Manga,
    chapter: Chapter
  ): Page[] {
    if (!this.source) {
      return [];
    }

    return this.source.getPageList(manga, chapter);
  }

  getFilters(): Filter[] {
    console.log("[Worker] getFilters called, source:", !!this.source);
    if (!this.source) {
      return [];
    }

    const result = this.source.getFilters();
    console.log("[Worker] getFilters result:", result);
    return result;
  }

  getListings(): Listing[] {
    if (!this.source) {
      return [];
    }

    return this.source.getListings();
  }

  getMangaListForListing(listing: Listing, page: number): MangaPageResult {
    if (!this.source) {
      return { entries: [], hasNextPage: false };
    }

    return this.source.getMangaListForListing(listing, page);
  }

  hasListingProvider(): boolean {
    return this.source?.hasListingProvider ?? false;
  }

  hasHomeProvider(): boolean {
    return this.source?.hasHome ?? false;
  }

  getHome(): HomeLayout | null {
    if (!this.source) {
      return null;
    }
    return this.source.getHome();
  }

  /**
   * Get home with progressive partial updates.
   * The onPartial callback is invoked for each partial result during WASM execution.
   */
  getHomeWithPartials(onPartial: (layout: HomeLayout) => void): HomeLayout | null {
    if (!this.source) {
      return null;
    }
    return this.source.getHomeWithPartials(onPartial);
  }

  modifyImageRequest(url: string): ImageRequest {
    if (!this.source) {
      return { url, headers: {} };
    }

    return this.source.modifyImageRequest(url);
  }

  hasImageProcessor(): boolean {
    return this.source?.hasImageProcessor ?? false;
  }

  async processPageImage(
    imageData: Uint8Array,
    context: Record<string, string> | null,
    requestUrl: string,
    requestHeaders: Record<string, string>,
    responseCode: number,
    responseHeaders: Record<string, string>
  ): Promise<Uint8Array | null> {
    if (!this.source) {
      return null;
    }

    return this.source.processPageImage(
      imageData,
      context,
      requestUrl,
      requestHeaders,
      responseCode,
      responseHeaders
    );
  }

}

// Create and expose the worker source
const workerSource = new WorkerSource();
Comlink.expose(workerSource);

// Type for the exposed worker API
export type WorkerSourceApi = WorkerSource;
