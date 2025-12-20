/**
 * Adapter that wraps AsyncAidokuSource to implement MangaSource interface
 */
import type {
  MangaSource,
  SearchResult,
  Manga,
  Chapter,
  Page,
} from "../types";
import type { AsyncAidokuSource } from "./async-source";
import type {
  Manga as AidokuManga,
  Chapter as AidokuChapter,
  Page as AidokuPage,
  SourceManifest,
} from "./types";
import { createAsyncSource } from "./async-source";
import { proxyUrl } from "@/config";
import pMemoize, { pMemoizeClear } from "p-memoize";

export interface CreateAidokuSourceOptions {
  /** Initial settings to apply before source initialization */
  initialSettings?: Record<string, unknown>;
}

/**
 * Create a MangaSource from an Aidoku WASM source
 * @param wasmUrlOrBytes - URL to fetch WASM from, or ArrayBuffer of WASM bytes
 */
export async function createAidokuMangaSource(
  wasmUrlOrBytes: string | ArrayBuffer,
  manifest: SourceManifest,
  options?: CreateAidokuSourceOptions
): Promise<MangaSource> {
  const asyncSource = await createAsyncSource(wasmUrlOrBytes, manifest, options);
  return new AidokuMangaSourceAdapter(asyncSource, manifest);
}

class AidokuMangaSourceAdapter implements MangaSource {
  readonly id: string;
  readonly name: string;

  private asyncSource: AsyncAidokuSource;
  private currentSearch: { query: string; page: number } | null = null;
  private _hasImageProcessor: boolean | null = null;
  
  // Memoized fetchers - handle caching + concurrent request deduplication
  private fetchChapters: (mangaId: string) => Promise<AidokuChapter[]>;
  private fetchMangaDetails: (mangaId: string) => Promise<AidokuManga>;
  private fetchRawPages: (mangaId: string, chapterId: string) => Promise<AidokuPage[]>;
  private fetchImageBlob: (url: string, context: Record<string, string> | null) => Promise<Blob>;

  constructor(asyncSource: AsyncAidokuSource, manifest: SourceManifest) {
    this.asyncSource = asyncSource;
    this.id = manifest.info.id;
    this.name = manifest.info.name;
    
    // p-memoize: caches results + dedupes concurrent calls with same key
    this.fetchChapters = pMemoize(
      (mangaId: string) => asyncSource.getChapterList({ key: mangaId })
    );
    
    this.fetchMangaDetails = pMemoize(
      (mangaId: string) => asyncSource.getMangaDetails({ key: mangaId })
    );
    
    this.fetchRawPages = pMemoize(
      async (mangaId: string, chapterId: string) => {
        const chapters = await this.fetchChapters(mangaId);
        const chapter = chapters.find(c => c.key === chapterId) || { key: chapterId };
        return asyncSource.getPageList({ key: mangaId }, chapter);
      },
      { cacheKey: ([mangaId, chapterId]) => `${mangaId}:${chapterId}` }
    );
    
    this.fetchImageBlob = pMemoize(
      async (url: string, context: Record<string, string> | null) => {
        const { headers } = await asyncSource.modifyImageRequest(url);
        const response = await fetch(proxyUrl(url), {
          headers: Object.fromEntries(
            Object.entries(headers).map(([k, v]) => [`x-proxy-${k}`, v])
          ),
        });
        if (!response.ok) {
          throw new Error(`Failed to fetch image: ${response.status}`);
        }
        
        // Check if we need to process (descramble) the image
        if (this._hasImageProcessor === null) {
          this._hasImageProcessor = await asyncSource.hasImageProcessor();
        }
        
        if (this._hasImageProcessor) {
          const imageBytes = new Uint8Array(await response.arrayBuffer());
          const processed = await asyncSource.processPageImage(
            imageBytes,
            context,
            url,
            headers,
            response.status,
            Object.fromEntries(response.headers.entries())
          );
          
          if (processed) {
            // Processed data is RGBA - convert to PNG for display
            return this.rgbaToBlob(processed, context);
          }
        }
        
        return response.blob();
      },
      // Cache key includes context since different contexts could produce different results
      { cacheKey: ([url, context]) => `${url}:${JSON.stringify(context)}` }
    );
  }

  // Convert RGBA data to PNG blob
  private async rgbaToBlob(rgba: Uint8Array, context: Record<string, string> | null): Promise<Blob> {
    // Get dimensions from context or calculate from data
    const width = context?.width ? parseInt(context.width, 10) : Math.sqrt(rgba.length / 4);
    const height = context?.height ? parseInt(context.height, 10) : Math.sqrt(rgba.length / 4);
    
    // Use OffscreenCanvas to create PNG
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Failed to get 2d context");
    }
    
    const imageData = new ImageData(new Uint8ClampedArray(rgba), width, height);
    ctx.putImageData(imageData, 0, 0);
    
    return canvas.convertToBlob({ type: "image/png" });
  }

  async search(query: string): Promise<SearchResult<Manga>> {
    this.currentSearch = { query, page: 1 };
    const result = await this.asyncSource.getSearchMangaList(query, 1, []);

    return {
      items: result.entries.map(this.convertManga),
      hasMore: result.hasNextPage,
      loadMore: result.hasNextPage ? () => this.loadMoreSearch() : undefined,
    };
  }

  private async loadMoreSearch(): Promise<SearchResult<Manga>> {
    if (!this.currentSearch) {
      return { items: [], hasMore: false };
    }

    this.currentSearch.page++;
    const result = await this.asyncSource.getSearchMangaList(
      this.currentSearch.query,
      this.currentSearch.page,
      []
    );

    return {
      items: result.entries.map(this.convertManga),
      hasMore: result.hasNextPage,
      loadMore: result.hasNextPage ? () => this.loadMoreSearch() : undefined,
    };
  }

  async getManga(mangaId: string): Promise<Manga> {
    const result = await this.fetchMangaDetails(mangaId);
    return this.convertManga(result);
  }

  async getChapters(mangaId: string): Promise<Chapter[]> {
    const chapters = await this.fetchChapters(mangaId);
    return chapters.map(this.convertChapter);
  }

  async getPages(mangaId: string, chapterId: string): Promise<Page[]> {
    const rawPages = await this.fetchRawPages(mangaId, chapterId);

    // Wrap each page with getImage() that uses memoized fetcher
    return rawPages.map((page, index) => ({
      index,
      getImage: () => {
        if (!page.url) throw new Error("Page URL is empty");
        return this.fetchImageBlob(page.url, page.context ?? null);
      },
    }));
  }

  dispose(): void {
    this.asyncSource.terminate();
    this.currentSearch = null;
    // Clear memoized caches to free memory
    pMemoizeClear(this.fetchChapters);
    pMemoizeClear(this.fetchMangaDetails);
    pMemoizeClear(this.fetchRawPages);
    pMemoizeClear(this.fetchImageBlob);
  }

  // Convert Aidoku types to MangaSource types
  private convertManga = (manga: AidokuManga): Manga => ({
    id: manga.key,
    title: manga.title || "",
    cover: manga.cover,
    authors: manga.authors,
    artists: manga.artists,
    description: manga.description,
    tags: manga.tags,
    status: manga.status,
    url: manga.url,
  });

  private convertChapter = (chapter: AidokuChapter): Chapter => ({
    id: chapter.key,
    title: chapter.title,
    chapterNumber: chapter.chapterNumber,
    volumeNumber: chapter.volumeNumber,
    dateUploaded: chapter.dateUploaded,
    scanlator: chapter.scanlator,
    url: chapter.url,
  });
}

