// Async source wrapper for Keiyoushi WASM sources using Web Worker + Comlink
import * as Comlink from "comlink";
import type {
  SourceInfo,
  MangaDto,
  ChapterDto,
  PageDto,
  MangasPageDto,
  KeiyoushiManifest,
} from "./types";
import type { WorkerSourceApi } from "./source.worker";

export interface AsyncKeiyoushiSource {
  id: string;
  manifest: KeiyoushiManifest;
  getSourceInfo(): Promise<SourceInfo | null>;
  getPopularManga(page: number): Promise<MangasPageDto>;
  getLatestUpdates(page: number): Promise<MangasPageDto>;
  searchManga(page: number, query: string): Promise<MangasPageDto>;
  getMangaDetails(mangaUrl: string): Promise<MangaDto | null>;
  getChapterList(mangaUrl: string): Promise<ChapterDto[]>;
  getPageList(chapterUrl: string): Promise<PageDto[]>;
  getImageUrl(pageUrl: string): Promise<string>;
  getImage(pageUrl: string, pageImageUrl: string): Promise<string>;
  terminate(): void;
}

/**
 * Create an async Keiyoushi source that runs in a Web Worker
 */
export async function createAsyncKeiyoushiSource(
  wasmUrl: string,
  manifest: KeiyoushiManifest,
  sourceIndex = 0
): Promise<AsyncKeiyoushiSource> {
  // Create worker
  const worker = new Worker(
    new URL("./source.worker.ts", import.meta.url),
    { type: "module" }
  );

  // Wrap with Comlink
  const workerSource = Comlink.wrap<WorkerSourceApi>(worker);

  // Load the source
  const loaded = await workerSource.load(wasmUrl, manifest);
  if (!loaded) {
    worker.terminate();
    throw new Error(`Failed to load Keiyoushi source: ${manifest.id}`);
  }

  // Set source index (for multi-source extensions like MangaDex)
  await workerSource.setSourceIndex(sourceIndex);

  return {
    id: manifest.id,
    manifest,

    async getSourceInfo(): Promise<SourceInfo | null> {
      return workerSource.getSourceInfo(sourceIndex);
    },

    async getPopularManga(page: number): Promise<MangasPageDto> {
      return workerSource.getPopularManga(page);
    },

    async getLatestUpdates(page: number): Promise<MangasPageDto> {
      return workerSource.getLatestUpdates(page);
    },

    async searchManga(page: number, query: string): Promise<MangasPageDto> {
      return workerSource.searchManga(page, query);
    },

    async getMangaDetails(mangaUrl: string): Promise<MangaDto | null> {
      return workerSource.getMangaDetails(mangaUrl);
    },

    async getChapterList(mangaUrl: string): Promise<ChapterDto[]> {
      return workerSource.getChapterList(mangaUrl);
    },

    async getPageList(chapterUrl: string): Promise<PageDto[]> {
      return workerSource.getPageList(chapterUrl);
    },

    async getImageUrl(pageUrl: string): Promise<string> {
      return workerSource.getImageUrl(pageUrl);
    },

    async getImage(pageUrl: string, pageImageUrl: string): Promise<string> {
      return workerSource.getImage(pageUrl, pageImageUrl);
    },

    terminate(): void {
      worker.terminate();
    },
  };
}

