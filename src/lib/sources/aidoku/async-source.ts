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
  SourceManifest,
} from "./types";
import type {
  WorkerSourceApi,
  SerializableManga,
  SerializableChapter,
  SerializablePage,
} from "./source.worker";

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

export interface CreateAsyncSourceOptions {
  /** Initial settings to apply before source initialization */
  initialSettings?: Record<string, unknown>;
}

/**
 * Create an async source that runs in a Web Worker
 * @param wasmUrlOrBytes - URL to fetch WASM from, or ArrayBuffer of WASM bytes
 */
export async function createAsyncSource(
  wasmUrlOrBytes: string | ArrayBuffer,
  manifest: SourceManifest,
  options?: CreateAsyncSourceOptions
): Promise<AsyncAidokuSource> {
  // Create a new worker for this source
  const worker = new Worker(
    new URL("./source.worker.ts", import.meta.url),
    { type: "module" }
  );

  // Wrap with Comlink
  const workerSource = Comlink.wrap<WorkerSourceApi>(worker);

  // Load the source in the worker
  // If ArrayBuffer, transfer it for efficiency
  const loaded =
    typeof wasmUrlOrBytes === "string"
      ? await workerSource.load(wasmUrlOrBytes, manifest, options?.initialSettings)
      : await workerSource.load(
          Comlink.transfer(wasmUrlOrBytes, [wasmUrlOrBytes]),
          manifest,
          options?.initialSettings
        );
  if (!loaded) {
    worker.terminate();
    throw new Error(`Failed to load source: ${manifest.info.id}`);
  }

  // Return async wrapper
  return {
    id: manifest.info.id,
    manifest,

    async getSearchMangaList(
      query: string | null,
      page: number,
      filters: FilterValue[]
    ): Promise<MangaPageResult> {
      const result = await workerSource.getSearchMangaList(query, page, filters);
      return {
        entries: result.entries.map(deserializeManga),
        hasNextPage: result.hasNextPage,
      };
    },

    async getMangaDetails(manga: Manga): Promise<Manga> {
      const result = await workerSource.getMangaDetails(serializeManga(manga));
      return deserializeManga(result);
    },

    async getChapterList(manga: Manga): Promise<Chapter[]> {
      const chapters = await workerSource.getChapterList(serializeManga(manga));
      return chapters.map(deserializeChapter);
    },

    async getPageList(manga: Manga, chapter: Chapter): Promise<Page[]> {
      const pages = await workerSource.getPageList(
        serializeManga(manga),
        serializeChapter(chapter)
      );
      return pages.map(deserializePage);
    },

    async getFilters(): Promise<Filter[]> {
      return workerSource.getFilters();
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
      return workerSource.processPageImage(
        imageData,
        context,
        requestUrl,
        requestHeaders,
        responseCode,
        responseHeaders
      );
    },

    terminate(): void {
      worker.terminate();
    },
  };
}

// Serialization helpers for transferring data to/from worker
function serializeManga(manga: Manga): SerializableManga {
  return {
    sourceId: manga.sourceId,
    id: manga.id,
    key: manga.key,
    title: manga.title,
    authors: manga.authors,
    artists: manga.artists,
    description: manga.description,
    tags: manga.tags,
    cover: manga.cover,
    url: manga.url,
    // Cast enum types to numbers for serialization
    status: manga.status as number | undefined,
    nsfw: manga.nsfw as number | undefined,
    viewer: manga.viewer as number | undefined,
  };
}

function deserializeManga(manga: SerializableManga): Manga {
  return {
    sourceId: manga.sourceId,
    id: manga.id,
    key: manga.key,
    title: manga.title,
    authors: manga.authors,
    artists: manga.artists,
    description: manga.description,
    tags: manga.tags,
    cover: manga.cover,
    url: manga.url,
    // Cast numbers back to enum types
    status: manga.status as Manga["status"],
    nsfw: manga.nsfw as Manga["nsfw"],
    viewer: manga.viewer as Manga["viewer"],
  };
}

function serializeChapter(chapter: Chapter): SerializableChapter {
  return {
    sourceId: chapter.sourceId,
    id: chapter.id,
    key: chapter.key,
    mangaId: chapter.mangaId,
    title: chapter.title,
    chapterNumber: chapter.chapterNumber,
    volumeNumber: chapter.volumeNumber,
    dateUploaded: chapter.dateUploaded,
    scanlator: chapter.scanlator,
    url: chapter.url,
    lang: chapter.lang,
    sourceOrder: chapter.sourceOrder,
  };
}

function deserializeChapter(chapter: SerializableChapter): Chapter {
  return {
    sourceId: chapter.sourceId,
    id: chapter.id,
    key: chapter.key,
    mangaId: chapter.mangaId,
    title: chapter.title,
    chapterNumber: chapter.chapterNumber,
    volumeNumber: chapter.volumeNumber,
    dateUploaded: chapter.dateUploaded,
    scanlator: chapter.scanlator,
    url: chapter.url,
    lang: chapter.lang,
    sourceOrder: chapter.sourceOrder,
  };
}

function deserializePage(page: SerializablePage): Page {
  return {
    index: page.index,
    url: page.url,
    base64: page.base64,
    text: page.text,
    context: page.context,
  };
}
