// Aidoku WASM Runtime - loads and executes Aidoku source modules (new aidoku-rs ABI)
import { GlobalStore } from "./global-store";
import type { Manga, Chapter, Page, MangaPageResult, Filter, FilterValue, SourceManifest, MangaStatus, ContentRating, Viewer, GenreState } from "./types";
import { createStdImports } from "./imports/std";
import { createNetImports } from "./imports/net";
import { createHtmlImports } from "./imports/html";
import { createJsonImports } from "./imports/json";
import { createDefaultsImports } from "./imports/defaults";
import { createEnvImports } from "./imports/env";
import { createAidokuImports } from "./imports/aidoku";
import { createCanvasImports, createHostImage, getHostImageData } from "./imports/canvas";
import { createJsImports } from "./imports/js";
import {
  encodeString,
  encodeEmptyVec,
  encodeManga,
  encodeChapter,
  encodeImageResponse,
  encodePageContext,
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
  /** Whether this source has a page image processor (for descrambling) */
  hasImageProcessor: boolean;
  initialize(): void;
  getSearchMangaList(query: string | null, page: number, filters: FilterValue[]): MangaPageResult;
  getMangaDetails(manga: Manga): Manga;
  getChapterList(manga: Manga): Chapter[];
  getPageList(manga: Manga, chapter: Chapter): Page[];
  getFilters(): Filter[];
  modifyImageRequest(url: string): { url: string; headers: Record<string, string> };
  /**
   * Process a page image (e.g., descramble).
   * Only works if hasImageProcessor is true.
   * @param imageData Raw image bytes
   * @param context Page context (e.g., width/height for descrambling)
   * @param requestUrl The URL the image was fetched from
   * @param requestHeaders Headers used in the request
   * @param responseCode HTTP response code
   * @param responseHeaders HTTP response headers
   * @returns Processed image bytes, or null if processing failed
   */
  processPageImage(
    imageData: Uint8Array,
    context: Record<string, string> | null,
    requestUrl: string,
    requestHeaders: Record<string, string>,
    responseCode: number,
    responseHeaders: Record<string, string>
  ): Promise<Uint8Array | null>;
}

export interface LoadSourceOptions {
  /** Initial settings to apply before source initialization */
  initialSettings?: Record<string, unknown>;
}

export async function loadSource(wasmUrlOrBytes: string | ArrayBuffer, manifest: SourceManifest, options?: LoadSourceOptions): Promise<AidokuSource> {
  const store = new GlobalStore(manifest.info.id);

  // Apply initial settings if provided
  console.log(`[Aidoku] loadSource options:`, options);
  if (options?.initialSettings && Object.keys(options.initialSettings).length > 0) {
    store.importSettings(options.initialSettings);
    console.log(`[Aidoku] Applied ${Object.keys(options.initialSettings).length} initial settings:`, options.initialSettings);
  } else {
    console.log(`[Aidoku] No initial settings provided`);
  }

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
    aidoku: createAidokuImports(store),
    canvas: createCanvasImports(store),
    js: createJsImports(store),
  };

  // Compile and instantiate WASM module
  const module = await WebAssembly.compile(wasmBytes);
  const instance = await WebAssembly.instantiate(module, importObject);

  // Get memory and set it in the store
  const memory = instance.exports.memory as WebAssembly.Memory;
  store.setMemory(memory);

  // Get exported functions
  const exports = instance.exports as Record<string, WebAssembly.ExportValue>;
  
  console.log("[Aidoku] Available WASM exports:", Object.keys(exports));

  // Detect ABI version based on available exports
  // NEW ABI (aidoku-rs): get_search_manga_list, get_manga_update
  // OLD ABI (legacy): get_manga_list, get_manga_details, get_chapter_list
  const isNewAbi = "get_search_manga_list" in exports || "get_manga_update" in exports;
  console.log("[Aidoku] Using ABI:", isNewAbi ? "NEW (aidoku-rs)" : "OLD (legacy)");

  // NEW ABI exports
  const start = exports.start as (() => void) | undefined;
  const getSearchMangaList = exports.get_search_manga_list as ((queryDescriptor: number, page: number, filtersDescriptor: number) => number) | undefined;
  const getMangaUpdate = exports.get_manga_update as ((mangaDescriptor: number, needsDetails: number, needsChapters: number) => number) | undefined;
  const getImageRequest = exports.get_image_request as ((urlDescriptor: number, contextDescriptor: number) => number) | undefined;
  const processPageImageExport = exports.process_page_image as ((responseDescriptor: number, contextDescriptor: number) => number) | undefined;
  const getFilterList = exports.get_filters as (() => number) | undefined;
  const freeResult = exports.free_result as ((ptr: number) => void) | undefined;

  // OLD ABI exports
  const oldGetMangaList = exports.get_manga_list as ((filterDescriptor: number, page: number) => number) | undefined;
  const oldGetMangaDetails = exports.get_manga_details as ((mangaDescriptor: number) => number) | undefined;
  const oldGetChapterList = exports.get_chapter_list as ((mangaDescriptor: number) => number) | undefined;
  const oldGetPageList = exports.get_page_list as ((chapterDescriptor: number) => number) | undefined;
  const oldModifyImageRequest = exports.modify_image_request as ((requestDescriptor: number) => void) | undefined;

  // get_page_list exists in both ABIs but with different signatures
  const wasmGetPageList = isNewAbi
    ? (exports.get_page_list as ((mangaDescriptor: number, chapterDescriptor: number) => number) | undefined)
    : undefined;

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
    hasImageProcessor: !!processPageImageExport,

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

    getSearchMangaList(query: string | null, page: number, filters: FilterValue[]): MangaPageResult {
      // OLD ABI
      if (!isNewAbi && oldGetMangaList) {
        const scope = store.createScope();
        try {
          console.log("[Aidoku] OLD ABI getSearchMangaList query=", query, "page=", page);
          
          // Swift FilterType enum values (different from TypeScript FilterType!)
          // See: vendor/Aidoku/Aidoku/Shared/Old Models/Filter.swift
          const SwiftFilterType = {
            base: 0, group: 1, text: 2, check: 3, select: 4,
            sort: 5, sortSelection: 6, title: 7, author: 8, genre: 9,
          };
          
          // Convert FilterValue[] to Swift filter format
          const swiftFilters: unknown[] = filters.map((f) => {
            // Map TypeScript FilterType to Swift FilterType
            switch (f.type) {
              case FilterType.Title:
                return { type: SwiftFilterType.title, name: f.name || "Title", value: f.value };
              case FilterType.Author:
                return { type: SwiftFilterType.author, name: f.name || "Author", value: f.value };
              case FilterType.Select:
                return { type: SwiftFilterType.select, name: f.name, value: f.value };
              case FilterType.Sort:
                // SortFilter has value as SortSelection { index, ascending }
                return { type: SwiftFilterType.sort, name: f.name, value: f.value };
              case FilterType.Check:
                return { type: SwiftFilterType.check, name: f.name, value: f.value };
              case FilterType.Group:
                return { type: SwiftFilterType.group, name: f.name, filters: [] }; // TODO: recursive
              case FilterType.Genre:
                // GenreFilter has value as GenreSelection[] - each with { index, state }
                return { type: SwiftFilterType.genre, name: f.name, value: f.value };
              default:
                return { type: SwiftFilterType.base, name: f.name, value: f.value };
            }
          });
          
          // Add TitleFilter if query provided and not already in filters
          if (query !== null && query !== "" && !filters.some(f => f.type === FilterType.Title)) {
            swiftFilters.unshift({ type: SwiftFilterType.title, name: "Title", value: query });
          }
          
          const filtersDescriptor = scope.storeValue(swiftFilters);
          
          // Call WASM - returns descriptor to MangaPageResult object
          const resultDescriptor = oldGetMangaList(filtersDescriptor, page);
          console.log("[Aidoku] OLD ABI result descriptor=", resultDescriptor);
          
          if (resultDescriptor < 0) {
            return { entries: [], hasNextPage: false };
          }
          
          // Read result as MangaPageResult object from store
          const result = store.readStdValue(resultDescriptor) as { entries?: unknown[]; hasNextPage?: boolean } | null;
          store.removeStdValue(resultDescriptor);
          
          if (!result) {
            return { entries: [], hasNextPage: false };
          }
          
          // Extract manga array from result
          const mangaArray = result.entries || [];
          const entries: Manga[] = mangaArray.map((m: unknown) => {
            const manga = m as Record<string, unknown>;
            return {
              sourceId: manifest.info.id,
              id: String(manga.key || manga.id || ""),
              key: String(manga.key || manga.id || ""),
              title: manga.title as string | undefined,
              authors: manga.author ? [manga.author as string] : (manga.authors as string[] | undefined),
              artists: manga.artist ? [manga.artist as string] : (manga.artists as string[] | undefined),
              description: manga.description as string | undefined,
              tags: manga.tags as string[] | undefined,
              cover: manga.cover as string | undefined,
              url: manga.url as string | undefined,
              status: manga.status as MangaStatus | undefined,
              nsfw: (manga.nsfw ?? manga.contentRating) as ContentRating | undefined,
              viewer: manga.viewer as Viewer | undefined,
            };
          });
          
          return { entries, hasNextPage: result.hasNextPage ?? false };
        } catch (e) {
          console.error("[Aidoku] OLD ABI getSearchMangaList error:", e);
          return { entries: [], hasNextPage: false };
        } finally {
          scope.cleanup();
        }
      }

      // NEW ABI
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
      // OLD ABI
      if (!isNewAbi && oldGetMangaDetails) {
        const scope = store.createScope();
        try {
          console.log("[Aidoku] OLD ABI getMangaDetails for", manga.key);
          
          // Create manga object for OLD ABI
          // Note: Swift sources read "id" for manga identification, fallback to "key"
          const mangaObj = {
            key: manga.key,
            id: manga.id ?? manga.key, // Use key as id fallback
            title: manga.title,
            cover: manga.cover,
            author: manga.authors?.[0],
            artist: manga.artists?.[0],
            description: manga.description,
            url: manga.url,
            status: manga.status,
            nsfw: manga.nsfw,
            viewer: manga.viewer,
            tags: manga.tags,
          };
          const mangaDescriptor = scope.storeValue(mangaObj);
          
          // Call WASM - returns new manga descriptor
          const resultDescriptor = oldGetMangaDetails(mangaDescriptor);
          console.log("[Aidoku] OLD ABI get_manga_details returned descriptor=", resultDescriptor);
          
          if (resultDescriptor < 0) return manga;
          
          // Read the new manga object from store
          const result = store.readStdValue(resultDescriptor) as Record<string, unknown> | null;
          store.removeStdValue(resultDescriptor);
          
          if (!result) return manga;
          
          return {
            sourceId: manifest.info.id,
            id: String(result.key || result.id || manga.id),
            key: String(result.key || result.id || manga.key),
            title: (result.title as string) || manga.title,
            authors: result.author ? [result.author as string] : (result.authors as string[]) || manga.authors,
            artists: result.artist ? [result.artist as string] : (result.artists as string[]) || manga.artists,
            description: (result.description as string) || manga.description,
            tags: (result.tags as string[]) || manga.tags,
            cover: (result.cover as string) || manga.cover,
            url: (result.url as string) || manga.url,
            status: (result.status as MangaStatus) ?? manga.status,
            nsfw: ((result.nsfw ?? result.contentRating) as ContentRating) ?? manga.nsfw,
            viewer: (result.viewer as Viewer) ?? manga.viewer,
          };
        } catch (e) {
          console.error("[Aidoku] OLD ABI getMangaDetails error:", e);
          return manga;
        } finally {
          scope.cleanup();
        }
      }

      // NEW ABI
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
      // OLD ABI
      if (!isNewAbi && oldGetChapterList) {
        const scope = store.createScope();
        try {
          console.log("[Aidoku] OLD ABI getChapterList for", manga.key);
          
          // Create manga object for OLD ABI
          // Note: Swift sources read "id" for manga identification, fallback to "key"
          const mangaObj = {
            key: manga.key,
            id: manga.id ?? manga.key,
            title: manga.title,
            cover: manga.cover,
          };
          const mangaDescriptor = scope.storeValue(mangaObj);
          
          // Call WASM - returns array descriptor
          const resultDescriptor = oldGetChapterList(mangaDescriptor);
          
          if (resultDescriptor < 0) return [];
          
          // Read chapter array from store
          const chapters = store.readStdValue(resultDescriptor) as unknown[] | null;
          store.removeStdValue(resultDescriptor);
          
          if (!chapters || !Array.isArray(chapters)) return [];
          
          return chapters.map((c, index) => {
            const chapter = c as Record<string, unknown>;
            return {
              sourceId: manifest.info.id,
              id: String(chapter.key || chapter.id || ""),
              key: String(chapter.key || chapter.id || ""),
              mangaId: manga.key,
              title: chapter.title as string | undefined,
              chapterNumber: chapter.chapter as number | undefined,
              volumeNumber: chapter.volume as number | undefined,
              dateUploaded: chapter.dateUploaded ? (chapter.dateUploaded as number) * 1000 : undefined,
              scanlator: chapter.scanlator as string | undefined,
              url: chapter.url as string | undefined,
              lang: (chapter.lang as string) || "zh",
              sourceOrder: index,
            };
          });
        } catch (e) {
          console.error("[Aidoku] OLD ABI getChapterList error:", e);
          return [];
        } finally {
          scope.cleanup();
        }
      }

      // NEW ABI
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
      // OLD ABI
      if (!isNewAbi && oldGetPageList) {
        const scope = store.createScope();
        try {
          console.log("[Aidoku] OLD ABI getPageList for chapter", chapter.key);
          
          // Create chapter object for OLD ABI
          // Note: Swift sources read "id" for identification, fallback to "key"
          const chapterObj = {
            key: chapter.key,
            id: chapter.id ?? chapter.key,
            mangaId: manga.id ?? manga.key,
            title: chapter.title,
            chapter: chapter.chapterNumber,
            volume: chapter.volumeNumber,
          };
          const chapterDescriptor = scope.storeValue(chapterObj);
          
          // Call WASM - returns array descriptor
          const resultDescriptor = oldGetPageList(chapterDescriptor);
          
          if (resultDescriptor < 0) return [];
          
          // Read page array from store
          const pages = store.readStdValue(resultDescriptor) as unknown[] | null;
          store.removeStdValue(resultDescriptor);
          
          if (!pages || !Array.isArray(pages)) return [];
          
          return pages.map((p, index) => {
            const page = p as Record<string, unknown>;
            return {
              index: (page.index as number) ?? index,
              url: page.imageUrl as string | undefined ?? page.url as string | undefined,
              base64: page.base64 as string | undefined,
              text: page.text as string | undefined,
            };
          });
        } catch (e) {
          console.error("[Aidoku] OLD ABI getPageList error:", e);
          return [];
        } finally {
          scope.cleanup();
        }
      }

      // NEW ABI
      if (!wasmGetPageList) return [];

      const scope = store.createScope();
      try {
        console.log("[Aidoku] getPageList for chapter", chapter.key);
        
        // Encode manga and chapter
        const mangaBytes = encodeManga(manga);
        const mangaDescriptor = scope.storeValue(mangaBytes);
        
        const chapterBytes = encodeChapter(chapter);
        const chapterDescriptor = scope.storeValue(chapterBytes);
        
        // Call WASM
        const resultPtr = wasmGetPageList(mangaDescriptor, chapterDescriptor);
        const resultBytes = readResult(resultPtr);

        if (freeResult && resultPtr > 0) {
          freeResult(resultPtr);
        }

        if (!resultBytes) return [];
        
        // Decode Vec<Page>
        const decodedPages = decodePageList(resultBytes);
        
        // Convert to our Page type
        return decodedPages.map((p, index) => ({
          index,
          url: p.url || undefined,
          base64: undefined,
          text: p.text || undefined,
          context: p.context || undefined,
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
      // OLD ABI: modify_image_request(requestDescriptor) -> void
      // Creates a request, passes descriptor, WASM modifies in place
      if (oldModifyImageRequest) {
        // Create request object with URL and default headers
        const requestId = store.createRequest();
        const request = store.requests.get(requestId);
        if (!request) {
          return { url, headers: {} };
        }
        
        request.url = url;
        // Add default User-Agent like Swift does
        request.headers["User-Agent"] = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
        
        // Add stored cookies like Swift does (HTTPCookieStorage)
        const storedCookies = store.getCookiesForUrl(url);
        if (storedCookies) {
          request.headers["Cookie"] = storedCookies;
        }
        
        try {
          // Call WASM - modifies request in place
          oldModifyImageRequest(requestId);
          
          // Read the modified request
          const modifiedRequest = store.requests.get(requestId);
          if (modifiedRequest) {
            const result = {
              url: modifiedRequest.url || url,
              headers: modifiedRequest.headers || {},
            };
            store.removeRequest(requestId);
            return result;
          }
        } catch (e) {
          console.error("[Aidoku] OLD ABI modifyImageRequest error:", e);
        }
        
        store.removeRequest(requestId);
        return { url, headers: {} };
      }
      
      // NEW ABI: get_image_request(urlDescriptor, contextDescriptor) -> resultPtr
      if (!getImageRequest) {
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
        
        if (resultPtr < 0) {
          return { url, headers: {} };
        }
        
        // Read the serialized result from WASM memory
        // Format: [len: i32 LE][cap: i32 LE][postcard data...]
        const view = new DataView(memory.buffer);
        const len = view.getInt32(resultPtr, true);
        
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
        
        // Free the result memory
        if (freeResult) {
          freeResult(resultPtr);
        }
        
        // Now look up the request by its ID and clean it up after use
        const request = store.requests.get(requestId);
        
        if (request) {
          const result = {
            url: request.url || url,
            headers: request.headers || {},
          };
          // Clean up the request after extracting data
          store.removeRequest(requestId);
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

    async processPageImage(
      imageData: Uint8Array,
      context: Record<string, string> | null,
      requestUrl: string,
      requestHeaders: Record<string, string>,
      responseCode: number,
      responseHeaders: Record<string, string>
    ): Promise<Uint8Array | null> {
      if (!processPageImageExport) {
        return null;
      }

      const scope = store.createScope();
      try {
        // Create image resource directly (with async decode)
        const imageResult = await createHostImage(store, imageData);
        if (!imageResult) {
          return null;
        }
        const { rid: imageRid } = imageResult;
        
        // Encode ImageResponse and store it
        const responseBytes = encodeImageResponse(
          responseCode,
          responseHeaders,
          requestUrl,
          requestHeaders,
          imageRid
        );
        const responseDescriptor = scope.storeValue(responseBytes);
        
        // Encode context and store it (or -1 for None)
        let contextDescriptor = -1;
        if (context !== null) {
          const contextHashMapBytes = encodePageContext(context).slice(1);
          contextDescriptor = scope.storeValue(contextHashMapBytes);
        }
        
        // Call WASM process_page_image
        const resultPtr = processPageImageExport(responseDescriptor, contextDescriptor);
        
        if (resultPtr < 0) {
          return null;
        }
        
        // Read the result - it's an ImageRef rid (zigzag varint encoded)
        const resultBytes = readResult(resultPtr);
        
        if (freeResult && resultPtr > 0) {
          freeResult(resultPtr);
        }
        
        if (!resultBytes || resultBytes.length === 0) {
          return null;
        }
        
        // Decode the result ImageRef rid (zigzag varint)
        let resultRid = 0;
        let shift = 0;
        let pos = 0;
        while (pos < resultBytes.length) {
          const byte = resultBytes[pos];
          resultRid |= (byte & 0x7f) << shift;
          pos++;
          if ((byte & 0x80) === 0) break;
          shift += 7;
        }
        resultRid = (resultRid >>> 1) ^ -(resultRid & 1);
        
        // Get processed image data
        return getHostImageData(store, resultRid);
      } catch {
        return null;
      } finally {
        scope.cleanup();
      }
    },
  };
}
