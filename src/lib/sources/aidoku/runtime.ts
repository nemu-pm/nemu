// Aidoku WASM Runtime - loads and executes Aidoku source modules (new aidoku-rs ABI)
import { GlobalStore } from "./global-store";
import type { Manga, Chapter, Page, MangaPageResult, Filter, FilterValue, SourceManifest, MangaStatus, ContentRating, Viewer, GenreState } from "./types";
import { createStdImports } from "./imports/std";
import { createNetImports } from "./imports/net";
import { createHtmlImports } from "./imports/html";
import { createJsonImports } from "./imports/json";
import { createDefaultsImports } from "./imports/defaults";
import { createEnvImports } from "./imports/env";
import {
  encodeString,
  encodeEmptyVec,
  encodeManga,
  encodeChapter,
  decodeMangaPageResult,
  decodeManga,
  decodePageList,
  decodeFilterList,
  type DecodedManga,
  type DecodedFilter,
} from "./postcard";
import { FilterType } from "./types";

export interface AidokuSource {
  id: string;
  manifest: SourceManifest;
  initialize(): void;
  getSearchMangaList(query: string | null, page: number, filters: FilterValue[]): MangaPageResult;
  getMangaDetails(manga: Manga): Manga;
  getChapterList(manga: Manga): Chapter[];
  getPageList(manga: Manga, chapter: Chapter): Page[];
  getFilters(): Filter[];
  modifyImageRequest(url: string): { url: string; headers: Record<string, string> };
}

export async function loadSource(wasmUrlOrBytes: string | ArrayBuffer, manifest: SourceManifest): Promise<AidokuSource> {
  const store = new GlobalStore(manifest.info.id);

  // Get WASM binary - either from URL or directly from ArrayBuffer
  let wasmBytes: ArrayBuffer;
  if (typeof wasmUrlOrBytes === "string") {
    const response = await fetch(wasmUrlOrBytes);
    wasmBytes = await response.arrayBuffer();
  } else {
    wasmBytes = wasmUrlOrBytes;
  }

  // Create import object with all namespaces
  const importObject: WebAssembly.Imports = {
    env: createEnvImports(store),
    std: createStdImports(store),
    net: createNetImports(store),
    html: createHtmlImports(store),
    json: createJsonImports(store),
    defaults: createDefaultsImports(store),
  };

  // Compile and instantiate WASM module
  const module = await WebAssembly.compile(wasmBytes);
  const instance = await WebAssembly.instantiate(module, importObject);

  // Get memory and set it in the store
  const memory = instance.exports.memory as WebAssembly.Memory;
  store.setMemory(memory);

  // Get exported functions (new ABI uses different names)
  const exports = instance.exports as Record<string, WebAssembly.ExportValue>;
  
  console.log("[Aidoku] Available WASM exports:", Object.keys(exports));

  // The new aidoku-rs exports these functions
  const start = exports.start as (() => void) | undefined;
  const getSearchMangaList = exports.get_search_manga_list as ((queryDescriptor: number, page: number, filtersDescriptor: number) => number) | undefined;
  const getMangaUpdate = exports.get_manga_update as ((mangaDescriptor: number, needsDetails: number, needsChapters: number) => number) | undefined;
  const wasmGetPageList = exports.get_page_list as ((mangaDescriptor: number, chapterDescriptor: number) => number) | undefined;
  const getImageRequest = exports.get_image_request as ((urlDescriptor: number, contextDescriptor: number) => number) | undefined;
  const getFilterList = exports.get_filters as (() => number) | undefined;
  const freeResult = exports.free_result as ((ptr: number) => void) | undefined;

  // Helper to read postcard result from WASM memory
  function readResult(ptr: number): Uint8Array | null {
    if (ptr <= 0) {
      console.log("[Aidoku] readResult: invalid ptr", ptr);
      return null;
    }
    
    try {
      const view = new DataView(memory.buffer);
      const len = view.getInt32(ptr, true);
      
      console.log("[Aidoku] readResult: ptr=", ptr, "len=", len);
      
      if (len <= 8) return null;
      
      // Data starts after the 8-byte header (len + capacity)
      const data = new Uint8Array(memory.buffer, ptr + 8, len - 8);
      return data.slice(); // Copy to avoid issues with memory changes
    } catch (e) {
      console.error("[Aidoku] readResult error:", e);
      return null;
    }
  }

  // Helper to convert decoded filter to Filter type
  function convertDecodedFilter(decoded: DecodedFilter): Filter {
    switch (decoded.type) {
      case FilterType.Title:
        return { type: FilterType.Title, name: decoded.name };
      case FilterType.Author:
        return { type: FilterType.Author, name: decoded.name };
      case FilterType.Select:
        return {
          type: FilterType.Select,
          name: decoded.name,
          options: decoded.options || [],
          default: typeof decoded.default === "number" ? decoded.default : 0,
        };
      case FilterType.Sort:
        return {
          type: FilterType.Sort,
          name: decoded.name,
          options: decoded.options || [],
          default:
            typeof decoded.default === "object" && "ascending" in (decoded.default as object)
              ? (decoded.default as { index: number; ascending: boolean })
              : { index: 0, ascending: false },
          canAscend: decoded.canAscend ?? false,
        };
      case FilterType.Check:
        return {
          type: FilterType.Check,
          name: decoded.name,
          default: typeof decoded.default === "boolean" ? decoded.default : false,
        };
      case FilterType.Group:
        return {
          type: FilterType.Group,
          name: decoded.name,
          filters: (decoded.filters || []).map(convertDecodedFilter),
        };
      case FilterType.Genre:
        return {
          type: FilterType.Genre,
          name: decoded.name,
          options: decoded.options || [],
          canExclude: decoded.canExclude ?? false,
          default: Array.isArray(decoded.default)
            ? decoded.default.map((g) => ({ index: g.index, state: g.state as GenreState }))
            : [],
        };
      default:
        // Fallback for unknown types
        return { type: FilterType.Title, name: decoded.name };
    }
  }

  return {
    id: manifest.info.id,
    manifest,

    initialize() {
      if (start) {
        try {
          console.log("[Aidoku] Calling start()");
          start();
          console.log("[Aidoku] start() completed");
        } catch (e) {
          console.error("[Aidoku] Initialize error:", e);
        }
      } else {
        console.log("[Aidoku] No start() export found");
      }
    },

    getSearchMangaList(query: string | null, page: number, _filters: FilterValue[]): MangaPageResult {
      if (!getSearchMangaList) {
        console.log("[Aidoku] No get_search_manga_list export found");
        return { entries: [], hasNextPage: false };
      }

      const scope = store.createScope();
      try {
        console.log("[Aidoku] getSearchMangaList query=", query, "page=", page);
        
        // Query should be RAW UTF-8 bytes (not postcard-encoded!)
        // aidoku-rs uses read_string() which expects raw UTF-8
        let queryDescriptor = -1;
        if (query !== null && query !== "") {
          const queryBytes = new TextEncoder().encode(query); // RAW UTF-8!
          queryDescriptor = scope.storeValue(queryBytes);
          console.log("[Aidoku] Query descriptor=", queryDescriptor, "bytes=", Array.from(queryBytes));
        }

        // Filters are postcard-encoded empty Vec
        const filtersBytes = encodeEmptyVec();
        const filtersDescriptor = scope.storeValue(filtersBytes);
        console.log("[Aidoku] Filters descriptor=", filtersDescriptor);

        // Call WASM function
        console.log("[Aidoku] Calling get_search_manga_list(", queryDescriptor, ",", page, ",", filtersDescriptor, ")");
        const resultPtr = getSearchMangaList(queryDescriptor, page, filtersDescriptor);
        console.log("[Aidoku] Result pointer=", resultPtr);

        // Read result from WASM memory
        const resultBytes = readResult(resultPtr);

        // Free result memory
        if (freeResult && resultPtr > 0) {
          freeResult(resultPtr);
        }

        if (!resultBytes) {
          console.log("[Aidoku] No result bytes");
          return { entries: [], hasNextPage: false };
        }

        console.log("[Aidoku] Result bytes length=", resultBytes.length);
        console.log("[Aidoku] First 50 bytes:", Array.from(resultBytes.slice(0, 50)));

        // Decode result
        const decoded = decodeMangaPageResult(resultBytes);
        console.log("[Aidoku] Decoded result:", decoded);

        // Convert to our Manga type
        const entries: Manga[] = decoded.entries.map((m: DecodedManga) => ({
          sourceId: manifest.info.id, // sourceId comes from manifest, not data
          id: m.key,
          key: m.key,
          title: m.title || undefined,
          authors: m.authors || undefined,
          artists: m.artists || undefined,
          description: m.description || undefined,
          tags: m.tags || undefined,
          cover: m.cover || undefined,
          url: m.url || undefined,
          status: m.status as MangaStatus | undefined,
          nsfw: m.contentRating as ContentRating | undefined,
          viewer: m.viewer as Viewer | undefined,
        }));

        return { entries, hasNextPage: decoded.hasNextPage };
      } catch (e) {
        console.error("[Aidoku] getSearchMangaList error:", e);
        return { entries: [], hasNextPage: false };
      } finally {
        scope.cleanup();
      }
    },

    getMangaDetails(manga: Manga): Manga {
      if (!getMangaUpdate) return manga;

      const scope = store.createScope();
      try {
        console.log("[Aidoku] getMangaDetails for", manga.key);
        
        // Encode manga and store
        const mangaBytes = encodeManga(manga);
        const mangaDescriptor = scope.storeValue(mangaBytes);
        
        // Call WASM (needsDetails=1, needsChapters=0)
        const resultPtr = getMangaUpdate(mangaDescriptor, 1, 0);
        const resultBytes = readResult(resultPtr);

        if (freeResult && resultPtr > 0) {
          freeResult(resultPtr);
        }

        if (!resultBytes) return manga;

        const [decoded] = decodeManga(resultBytes, 0);
        return {
          sourceId: manifest.info.id,
          id: decoded.key,
          key: decoded.key,
          title: decoded.title || undefined,
          authors: decoded.authors || undefined,
          artists: decoded.artists || undefined,
          description: decoded.description || undefined,
          tags: decoded.tags || undefined,
          cover: decoded.cover || undefined,
          url: decoded.url || undefined,
          status: decoded.status as MangaStatus | undefined,
          nsfw: decoded.contentRating as ContentRating | undefined,
          viewer: decoded.viewer as Viewer | undefined,
        };
      } catch (e) {
        console.error("[Aidoku] getMangaDetails error:", e);
        return manga;
      } finally {
        scope.cleanup();
      }
    },

    getChapterList(manga: Manga): Chapter[] {
      if (!getMangaUpdate) return [];

      const scope = store.createScope();
      try {
        console.log("[Aidoku] getChapterList for", manga.key);
        
        // Encode manga and store
        const mangaBytes = encodeManga(manga);
        const mangaDescriptor = scope.storeValue(mangaBytes);
        
        // Call WASM (needsDetails=0, needsChapters=1)
        const resultPtr = getMangaUpdate(mangaDescriptor, 0, 1);
        const resultBytes = readResult(resultPtr);

        if (freeResult && resultPtr > 0) {
          freeResult(resultPtr);
        }

        if (!resultBytes) return [];

        // Decode manga which now includes chapters
        const [decoded] = decodeManga(resultBytes, 0);
        
        if (!decoded.chapters) return [];
        
        // Convert decoded chapters to our Chapter type
        return decoded.chapters.map((c, index) => ({
          sourceId: manifest.info.id,
          id: c.key,
          key: c.key,
          mangaId: manga.key,
          title: c.title || undefined,
          chapterNumber: c.chapterNumber ?? undefined,
          volumeNumber: c.volumeNumber ?? undefined,
          dateUploaded: c.dateUploaded ? c.dateUploaded * 1000 : undefined,
          scanlator: c.scanlators?.join(", ") || undefined,
          url: c.url || undefined,
          lang: c.language || "zh",
          sourceOrder: index,
        }));
      } catch (e) {
        console.error("[Aidoku] getChapterList error:", e);
        return [];
      } finally {
        scope.cleanup();
      }
    },

    getPageList(manga: Manga, chapter: Chapter): Page[] {
      if (!wasmGetPageList) return [];

      const scope = store.createScope();
      try {
        console.log("[Aidoku] getPageList for chapter", chapter.key);
        console.log("[Aidoku] Chapter data:", JSON.stringify(chapter, null, 2));
        
        // Encode manga and chapter
        const mangaBytes = encodeManga(manga);
        const mangaDescriptor = scope.storeValue(mangaBytes);
        
        const chapterBytes = encodeChapter(chapter);
        console.log("[Aidoku] Chapter encoded:", chapterBytes.length, "bytes");
        console.log("[Aidoku] Chapter hex:", Array.from(chapterBytes.slice(0, 100)).map(b => b.toString(16).padStart(2, '0')).join(' '));
        const chapterDescriptor = scope.storeValue(chapterBytes);
        
        // Call WASM
        const resultPtr = wasmGetPageList(mangaDescriptor, chapterDescriptor);
        const resultBytes = readResult(resultPtr);

        if (freeResult && resultPtr > 0) {
          freeResult(resultPtr);
        }

        if (!resultBytes) return [];

        console.log("[Aidoku] Page list bytes:", resultBytes.length);
        
        // Decode Vec<Page>
        const decodedPages = decodePageList(resultBytes);
        console.log("[Aidoku] Decoded pages:", decodedPages.length);
        
        // Convert to our Page type
        return decodedPages.map((p, index) => ({
          index,
          url: p.url || undefined,
          base64: undefined,
          text: p.text || undefined,
        }));
      } catch (e) {
        console.error("[Aidoku] getPageList error:", e);
        return [];
      } finally {
        scope.cleanup();
      }
    },

    getFilters(): Filter[] {
      if (!getFilterList) return [];

      try {
        const resultPtr = getFilterList();
        const resultBytes = readResult(resultPtr);

        if (freeResult && resultPtr > 0) {
          freeResult(resultPtr);
        }

        if (!resultBytes) return [];

        // Decode filters from postcard
        const decodedFilters = decodeFilterList(resultBytes);

        // Convert decoded filters to Filter type
        return decodedFilters.map(convertDecodedFilter);
      } catch (e) {
        console.error("[Aidoku] getFilterList error:", e);
        return [];
      }
    },

    modifyImageRequest(url: string): { url: string; headers: Record<string, string> } {
      console.log("[Aidoku] modifyImageRequest called with:", url);
      
      if (!getImageRequest) {
        console.log("[Aidoku] modifyImageRequest: no getImageRequest export");
        return { url, headers: {} };
      }

      const scope = store.createScope();
      try {
        // Encode URL and store
        const urlBytes = encodeString(url);
        const urlDescriptor = scope.storeValue(urlBytes);
        
        // No context
        const contextDescriptor = -1;
        
        // Call WASM - returns a pointer to serialized result
        const resultPtr = getImageRequest(urlDescriptor, contextDescriptor);
        console.log("[Aidoku] modifyImageRequest resultPtr:", resultPtr);
        
        if (resultPtr < 0) {
          console.log("[Aidoku] modifyImageRequest: error code", resultPtr);
          return { url, headers: {} };
        }
        
        // Read the serialized result from WASM memory
        // Format: [len: i32 LE][cap: i32 LE][postcard data...]
        const view = new DataView(memory.buffer);
        const len = view.getInt32(resultPtr, true);
        console.log("[Aidoku] modifyImageRequest result len:", len);
        
        if (len <= 8) {
          return { url, headers: {} };
        }
        
        // The data after header is the postcard-encoded request ID (i32 as zigzag varint)
        // Read varint from position 8
        const dataStart = resultPtr + 8;
        let requestId = 0;
        let shift = 0;
        let pos = 0;
        while (true) {
          const byte = view.getUint8(dataStart + pos);
          requestId |= (byte & 0x7f) << shift;
          pos++;
          if ((byte & 0x80) === 0) break;
          shift += 7;
        }
        // Decode zigzag: (n >>> 1) ^ -(n & 1)
        requestId = (requestId >>> 1) ^ -(requestId & 1);
        console.log("[Aidoku] modifyImageRequest requestId:", requestId);
        
        // Free the result memory
        if (freeResult) {
          freeResult(resultPtr);
        }
        
        // Now look up the request by its ID and clean it up after use
        const request = store.requests.get(requestId);
        console.log("[Aidoku] modifyImageRequest request:", request);
        
        if (request) {
          const result = {
            url: request.url || url,
            headers: request.headers || {},
          };
          // Clean up the request after extracting data
          store.removeRequest(requestId);
          console.log("[Aidoku] modifyImageRequest returning:", result);
          return result;
        }
        
        return { url, headers: {} };
      } catch (e) {
        console.error("[Aidoku] modifyImageRequest error:", e);
        return { url, headers: {} };
      } finally {
        scope.cleanup();
      }
    },
  };
}
