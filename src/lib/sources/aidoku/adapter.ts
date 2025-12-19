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
  SourceManifest,
} from "./types";
import { createAsyncSource } from "./async-source";
import { proxyUrl } from "@/config";

/**
 * Create a MangaSource from an Aidoku WASM source
 * @param wasmUrlOrBytes - URL to fetch WASM from, or ArrayBuffer of WASM bytes
 */
export async function createAidokuMangaSource(
  wasmUrlOrBytes: string | ArrayBuffer,
  manifest: SourceManifest
): Promise<MangaSource> {
  const asyncSource = await createAsyncSource(wasmUrlOrBytes, manifest);
  return new AidokuMangaSourceAdapter(asyncSource, manifest);
}

class AidokuMangaSourceAdapter implements MangaSource {
  readonly id: string;
  readonly name: string;

  private asyncSource: AsyncAidokuSource;
  private currentSearch: { query: string; page: number } | null = null;

  constructor(asyncSource: AsyncAidokuSource, manifest: SourceManifest) {
    this.asyncSource = asyncSource;
    this.id = manifest.info.id;
    this.name = manifest.info.name;
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
    // Create minimal manga object with just the key - WASM only uses key
    const minimalManga: AidokuManga = { key: mangaId };
    const result = await this.asyncSource.getMangaDetails(minimalManga);
    return this.convertManga(result);
  }

  async getChapters(mangaId: string): Promise<Chapter[]> {
    const minimalManga: AidokuManga = { key: mangaId };
    const chapters = await this.asyncSource.getChapterList(minimalManga);
    return chapters.map(this.convertChapter);
  }

  async getPages(mangaId: string, chapterId: string): Promise<Page[]> {
    const minimalManga: AidokuManga = { key: mangaId };
    const minimalChapter: AidokuChapter = { key: chapterId };
    const rawPages = await this.asyncSource.getPageList(
      minimalManga,
      minimalChapter
    );

    // Wrap each page with getImage() that fetches via proxy
    return rawPages.map((page, index) => ({
      index,
      getImage: () => this.fetchImage(page.url || ""),
    }));
  }

  private async fetchImage(url: string): Promise<Blob> {
    if (!url) {
      throw new Error("Page URL is empty");
    }

    // Get headers from source (referer, user-agent, etc.)
    const { headers } = await this.asyncSource.modifyImageRequest(url);

    // Fetch via proxy with headers
    const response = await fetch(proxyUrl(url), {
      headers: Object.fromEntries(
        Object.entries(headers).map(([k, v]) => [`x-proxy-${k}`, v])
      ),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }

    return response.blob();
  }

  dispose(): void {
    this.asyncSource.terminate();
    this.currentSearch = null;
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

