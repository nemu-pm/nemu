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
  fetchImage(pageUrl: string, pageImageUrl: string): Promise<string>;
  getHeaders(): Promise<Record<string, string>>;
  
  // Preferences methods
  initPreferences(prefsName: string, values: Record<string, unknown>): Promise<void>;
  flushPrefChanges(): Promise<Array<{ name: string; key: string; value: unknown }>>;
  getSettingsSchema(): Promise<string | null>;
  
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
 * Create an async Tachiyomi source for a specific sourceId.
 * sourceId is required - caller must select which source to use.
 */
export async function createAsyncTachiyomiSource(
  jsUrl: string,
  manifest: TachiyomiManifest,
  sourceId: string
): Promise<AsyncTachiyomiSource> {
  const ext = await getOrLoadExtension(jsUrl, manifest);
  
  const sources = ext.manifest.sources ?? [];
  const sourceInfo = sources.find(s => s.id === sourceId);
  if (!sourceInfo) {
    throw new Error(`Source not found: ${sourceId} in ${manifest.name}`);
  }

  // All methods pass sourceId explicitly to worker - no state management needed
  return {
    sourceId,
    sourceInfo,
    manifest: ext.manifest,

    // Filter methods
    async getFilterList(): Promise<TachiyomiFilter[]> {
      return ext.workerApi.getFilterList(sourceId);
    },

    async resetFilters(): Promise<boolean> {
      return ext.workerApi.resetFilters(sourceId);
    },

    async applyFilterState(filterStateJson: string): Promise<boolean> {
      return ext.workerApi.applyFilterState(sourceId, filterStateJson);
    },

    // Browse methods
    async getPopularManga(page: number): Promise<MangasPageDto> {
      return ext.workerApi.getPopularManga(sourceId, page);
    },

    async getLatestUpdates(page: number): Promise<MangasPageDto> {
      return ext.workerApi.getLatestUpdates(sourceId, page);
    },

    // Search methods
    async searchManga(page: number, query: string): Promise<MangasPageDto> {
      return ext.workerApi.searchManga(sourceId, page, query);
    },

    async searchMangaWithFilters(page: number, query: string, filterStateJson: string): Promise<MangasPageDto> {
      return ext.workerApi.searchMangaWithFilters(sourceId, page, query, filterStateJson);
    },

    // Content methods
    async getMangaDetails(mangaUrl: string): Promise<MangaDto | null> {
      return ext.workerApi.getMangaDetails(sourceId, mangaUrl);
    },

    async getChapterList(mangaUrl: string): Promise<ChapterDto[]> {
      return ext.workerApi.getChapterList(sourceId, mangaUrl);
    },

    async getPageList(chapterUrl: string): Promise<PageDto[]> {
      return ext.workerApi.getPageList(sourceId, chapterUrl);
    },

    async fetchImage(pageUrl: string, pageImageUrl: string): Promise<string> {
      return ext.workerApi.fetchImage(sourceId, pageUrl, pageImageUrl);
    },

    async getHeaders(): Promise<Record<string, string>> {
      return ext.workerApi.getHeaders(sourceId);
    },

    // Preferences methods
    async initPreferences(prefsName: string, values: Record<string, unknown>): Promise<void> {
      await ext.workerApi.initPreferences(prefsName, values);
    },

    async flushPrefChanges(): Promise<Array<{ name: string; key: string; value: unknown }>> {
      return ext.workerApi.flushPrefChanges();
    },

    async getSettingsSchema(): Promise<string | null> {
      return ext.workerApi.getSettingsSchema(sourceId);
    },

    terminate(): void {
      loadedExtensions.delete(jsUrl);
      ext.worker.terminate();
    },
  };
}
