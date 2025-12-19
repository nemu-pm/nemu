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
  SourceManifest,
} from "./types";

// Serializable versions of types for Comlink transfer
// These match the actual types from types.ts
export interface SerializableManga {
  sourceId?: string;
  id?: string;
  key: string;
  title?: string;
  authors?: string[];
  artists?: string[];
  description?: string;
  tags?: string[];
  cover?: string;
  url?: string;
  status?: number;
  nsfw?: number;
  viewer?: number;
}

export interface SerializableChapter {
  sourceId?: string;
  id?: string;
  key: string;
  mangaId?: string;
  title?: string;
  chapterNumber?: number;
  volumeNumber?: number;
  dateUploaded?: number;
  scanlator?: string;
  url?: string;
  lang?: string;
  sourceOrder?: number;
}

export interface SerializablePage {
  index: number;
  url?: string;
  base64?: string;
  text?: string;
}

export interface SerializableMangaPageResult {
  entries: SerializableManga[];
  hasNextPage: boolean;
}

export interface SerializableImageRequest {
  url: string;
  headers: Record<string, string>;
}

/**
 * Worker-side source wrapper that can be exposed via Comlink
 */
class WorkerSource {
  private source: AidokuSource | null = null;
  private sourceId: string = "";

  async load(wasmUrlOrBytes: string | ArrayBuffer, manifest: SourceManifest): Promise<boolean> {
    try {
      console.log("[Worker] Loading source:", manifest.info.id);
      this.source = await loadSource(wasmUrlOrBytes, manifest);
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
  ): SerializableMangaPageResult {
    if (!this.source) {
      return { entries: [], hasNextPage: false };
    }

    const result = this.source.getSearchMangaList(query, page, filters);
    return this.serializeMangaPageResult(result);
  }

  getMangaDetails(manga: SerializableManga): SerializableManga {
    if (!this.source) {
      return manga;
    }

    const result = this.source.getMangaDetails(this.deserializeManga(manga));
    return this.serializeManga(result);
  }

  getChapterList(manga: SerializableManga): SerializableChapter[] {
    if (!this.source) {
      return [];
    }

    const chapters = this.source.getChapterList(this.deserializeManga(manga));
    return chapters.map((c) => this.serializeChapter(c));
  }

  getPageList(
    manga: SerializableManga,
    chapter: SerializableChapter
  ): SerializablePage[] {
    if (!this.source) {
      return [];
    }

    const pages = this.source.getPageList(
      this.deserializeManga(manga),
      this.deserializeChapter(chapter)
    );
    return pages.map((p) => this.serializePage(p));
  }

  getFilters(): Filter[] {
    if (!this.source) {
      return [];
    }

    return this.source.getFilters();
  }

  modifyImageRequest(url: string): SerializableImageRequest {
    if (!this.source) {
      return { url, headers: {} };
    }

    return this.source.modifyImageRequest(url);
  }

  // Serialization helpers
  private serializeManga(manga: Manga): SerializableManga {
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

  private serializeMangaPageResult(
    result: MangaPageResult
  ): SerializableMangaPageResult {
    return {
      entries: result.entries.map((m) => this.serializeManga(m)),
      hasNextPage: result.hasNextPage,
    };
  }

  private serializeChapter(chapter: Chapter): SerializableChapter {
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

  private serializePage(page: Page): SerializablePage {
    return {
      index: page.index,
      url: page.url,
      base64: page.base64,
      text: page.text,
    };
  }

  private deserializeManga(manga: SerializableManga): Manga {
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

  private deserializeChapter(chapter: SerializableChapter): Chapter {
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
}

// Create and expose the worker source
const workerSource = new WorkerSource();
Comlink.expose(workerSource);

// Type for the exposed worker API
export type WorkerSourceApi = WorkerSource;
