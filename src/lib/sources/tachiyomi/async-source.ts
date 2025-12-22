// Async source wrapper for Tachiyomi Kotlin/JS sources using Web Worker + Comlink
import * as Comlink from "comlink";
import type {
  TachiyomiSourceInfo,
  MangaDto,
  ChapterDto,
  PageDto,
  MangasPageDto,
  TachiyomiManifest,
  TachiyomiFilter,
} from "./types";
import type { WorkerSourceApi } from "./source.worker";

export interface AsyncTachiyomiSource {
  sourceId: string;
  sourceInfo: TachiyomiSourceInfo;
  manifest: TachiyomiManifest;
  
  // Filter methods
  getFilterList(): Promise<TachiyomiFilter[]>;
  resetFilters(): Promise<boolean>;
  applyFilterState(filterStateJson: string): Promise<boolean>;
  
  // Browse methods
  getPopularManga(page: number): Promise<MangasPageDto>;
  getLatestUpdates(page: number): Promise<MangasPageDto>;
  
  // Search methods
  searchManga(page: number, query: string): Promise<MangasPageDto>;
  searchMangaWithFilters(page: number, query: string, filterStateJson: string): Promise<MangasPageDto>;
  
  // Content methods
  getMangaDetails(mangaUrl: string): Promise<MangaDto | null>;
  getChapterList(mangaUrl: string): Promise<ChapterDto[]>;
  getPageList(chapterUrl: string): Promise<PageDto[]>;
  
  /**
   * Fetch image through source's OkHttp client (with interceptors).
   * Returns base64-encoded image bytes.
   * Required for sources with image descrambling/processing.
   */
  fetchImage(pageUrl: string, pageImageUrl: string): Promise<string>;
  
  terminate(): void;
}

// Shared worker instance per extension (multiple sources share one worker)
interface LoadedExtension {
  worker: Worker;
  workerApi: Comlink.Remote<WorkerSourceApi>;
  manifest: TachiyomiManifest;
}

const loadedExtensions = new Map<string, LoadedExtension>();

/**
 * Load extension into worker (shared per jsUrl)
 */
async function getOrLoadExtension(
  jsUrl: string,
  manifest: TachiyomiManifest
): Promise<LoadedExtension> {
  const existing = loadedExtensions.get(jsUrl);
  if (existing) return existing;

  const worker = new Worker(
    new URL("./source.worker.ts", import.meta.url),
    { type: "module" }
  );

  const workerApi = Comlink.wrap<WorkerSourceApi>(worker);

  const loaded = await workerApi.load(jsUrl, manifest);
  if (!loaded) {
    worker.terminate();
    throw new Error(`Failed to load Tachiyomi extension: ${manifest.name}`);
  }

  // Get updated manifest with sources
  const updatedManifest = await workerApi.getManifest();
  if (!updatedManifest) {
    worker.terminate();
    throw new Error(`Failed to get manifest: ${manifest.name}`);
  }

  const ext: LoadedExtension = { worker, workerApi, manifest: updatedManifest };
  loadedExtensions.set(jsUrl, ext);
  return ext;
}

/**
 * Create an async Tachiyomi source for a specific sourceId
 */
export async function createAsyncTachiyomiSource(
  jsUrl: string,
  manifest: TachiyomiManifest,
  sourceId: string
): Promise<AsyncTachiyomiSource> {
  const ext = await getOrLoadExtension(jsUrl, manifest);
  
  const sourceInfo = ext.manifest.sources?.find(s => s.id === sourceId);
  if (!sourceInfo) {
    throw new Error(`Source not found: ${sourceId} in ${manifest.name}`);
  }

  // Set source context for this instance
  await ext.workerApi.setSourceId(sourceId);

  return {
    sourceId,
    sourceInfo,
    manifest: ext.manifest,

    // ============ Filter Methods ============

    async getFilterList(): Promise<TachiyomiFilter[]> {
      return ext.workerApi.getFilterList(sourceId);
    },

    async resetFilters(): Promise<boolean> {
      return ext.workerApi.resetFilters(sourceId);
    },

    async applyFilterState(filterStateJson: string): Promise<boolean> {
      return ext.workerApi.applyFilterState(sourceId, filterStateJson);
    },

    // ============ Browse Methods ============

    async getPopularManga(page: number): Promise<MangasPageDto> {
      await ext.workerApi.setSourceId(sourceId); // Ensure correct source
      return ext.workerApi.getPopularManga(page);
    },

    async getLatestUpdates(page: number): Promise<MangasPageDto> {
      await ext.workerApi.setSourceId(sourceId);
      return ext.workerApi.getLatestUpdates(page);
    },

    // ============ Search Methods ============

    async searchManga(page: number, query: string): Promise<MangasPageDto> {
      await ext.workerApi.setSourceId(sourceId);
      return ext.workerApi.searchManga(page, query);
    },

    async searchMangaWithFilters(page: number, query: string, filterStateJson: string): Promise<MangasPageDto> {
      await ext.workerApi.setSourceId(sourceId);
      return ext.workerApi.searchMangaWithFilters(page, query, filterStateJson);
    },

    // ============ Content Methods ============

    async getMangaDetails(mangaUrl: string): Promise<MangaDto | null> {
      await ext.workerApi.setSourceId(sourceId);
      return ext.workerApi.getMangaDetails(mangaUrl);
    },

    async getChapterList(mangaUrl: string): Promise<ChapterDto[]> {
      await ext.workerApi.setSourceId(sourceId);
      return ext.workerApi.getChapterList(mangaUrl);
    },

    async getPageList(chapterUrl: string): Promise<PageDto[]> {
      await ext.workerApi.setSourceId(sourceId);
      return ext.workerApi.getPageList(chapterUrl);
    },

    async fetchImage(pageUrl: string, pageImageUrl: string): Promise<string> {
      await ext.workerApi.setSourceId(sourceId);
      return ext.workerApi.fetchImage(pageUrl, pageImageUrl);
    },

    terminate(): void {
      // Only terminate if no other sources using this worker
      // For now, just remove from cache
      loadedExtensions.delete(jsUrl);
      ext.worker.terminate();
    },
  };
}

/**
 * Get all available sources from a loaded extension
 */
export async function getExtensionSources(
  jsUrl: string,
  manifest: TachiyomiManifest
): Promise<TachiyomiSourceInfo[]> {
  const ext = await getOrLoadExtension(jsUrl, manifest);
  return ext.manifest.sources ?? [];
}

/**
 * Create an async Tachiyomi source with automatic source selection.
 * Loads the extension and picks the best source (English preferred, then first available).
 */
export async function createAsyncTachiyomiSourceWithDefaults(
  jsUrl: string,
  manifest: TachiyomiManifest
): Promise<AsyncTachiyomiSource> {
  const ext = await getOrLoadExtension(jsUrl, manifest);
  const sources = ext.manifest.sources ?? [];
  
  if (sources.length === 0) {
    throw new Error(`No sources found in extension: ${manifest.name}`);
  }
  
  // Pick English source if available, otherwise first
  const selectedSource = sources.find(s => s.lang === "en") ?? sources[0];
  
  return createAsyncTachiyomiSource(jsUrl, ext.manifest, selectedSource.id);
}
