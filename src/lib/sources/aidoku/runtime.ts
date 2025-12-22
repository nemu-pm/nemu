// Aidoku WASM Runtime - loads and executes Aidoku source modules (new aidoku-rs ABI)
import { GlobalStore } from "./global-store";
import type { Manga, Chapter, Page, MangaPageResult, Filter, FilterValue, SourceManifest, MangaStatus, ContentRating, Viewer, GenreState, Listing, HomeLayout, HomeComponent, HomeComponentValue, HomeLink, HomeLinkValue, HomeFilterItem, MangaWithChapter } from "./types";
import { createStdImports } from "./imports/std";
import { createNetImports } from "./imports/net";
import { createHtmlImports } from "./imports/html";
import { createJsonImports } from "./imports/json";
import { createDefaultsImports } from "./imports/defaults";
import { createEnvImports } from "./imports/env";
import { createAidokuImports } from "./imports/aidoku";
import { createCanvasImports, createHostImage, getHostImageData } from "./imports/canvas";
import { createJsImports } from "./imports/js";
import { normalizeSourceLang } from "../language";
import {
  encodeString,
  encodeEmptyVec,
  encodeManga,
  encodeChapter,
  encodeImageResponse,
  encodeHashMap,
  encodeFilterValues,
  decodeMangaPageResult,
  decodeManga,
  decodePageList,
  decodeFilterList,
  decodeString,
  decodeVec,
  decodeVarint,
  type DecodedManga,
  type DecodedFilter,
} from "./postcard";
import { FilterType } from "./types";
import {
  readResultPayload,
  decodeRidFromPayload,
  RuntimeMode,
  detectRuntimeMode,
} from "./result-decoder";

export interface AidokuSource {
  id: string;
  manifest: SourceManifest;
  /** Runtime mode: legacy (Swift-era) or aidoku-rs (modern) */
  mode: RuntimeMode;
  /** Whether this source has a page image processor (for descrambling) */
  hasImageProcessor: boolean;
  /** Whether this source provides custom image requests */
  hasImageRequestProvider: boolean;
  /** Whether this source provides a home layout */
  hasHome: boolean;
  /** Whether this source provides listing-based browsing */
  hasListingProvider: boolean;
  /** Whether this source provides dynamic listings */
  hasDynamicListings: boolean;
  initialize(): void;
  getSearchMangaList(query: string | null, page: number, filters: FilterValue[]): MangaPageResult;
  getMangaDetails(manga: Manga): Manga;
  getChapterList(manga: Manga): Chapter[];
  getPageList(manga: Manga, chapter: Chapter): Page[];
  getFilters(): Filter[];
  /** Get manga list for a specific listing (for ListingProvider sources) */
  getMangaListForListing(listing: Listing, page: number): MangaPageResult;
  /** Get home layout (for Home sources) */
  getHome(): HomeLayout | null;
  /** Get home layout with progressive partial updates (for Home sources) */
  getHomeWithPartials(onPartial: (layout: HomeLayout) => void): HomeLayout | null;
  /** Get dynamic listings (for DynamicListings sources) */
  getListings(): Listing[];
  modifyImageRequest(url: string, context?: Record<string, string> | null): { url: string; headers: Record<string, string> };
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

// HomeLayout is now imported from types.ts

/** Function to get a setting value from main thread's store */
export type SettingsGetter = (key: string) => unknown;

/**
 * Load an Aidoku WASM source
 * @param sourceKey - Unique identifier in format "registryId:sourceId" for settings/storage
 * @param settingsGetter - Function to get settings (reads from main thread via worker)
 */
export async function loadSource(
  wasmUrlOrBytes: string | ArrayBuffer,
  manifest: SourceManifest,
  sourceKey: string,
  settingsGetter: SettingsGetter
): Promise<AidokuSource> {
  const store = new GlobalStore(sourceKey);

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
    defaults: createDefaultsImports(store, settingsGetter),
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

  // Detect runtime mode (B0: explicit mode flag)
  const mode = detectRuntimeMode(exports);
  const isNewAbi = mode === RuntimeMode.AidokuRs;
  console.log("[Aidoku] Runtime mode:", mode);

  // NEW ABI exports
  const start = exports.start as (() => void) | undefined;
  const getSearchMangaList = exports.get_search_manga_list as ((queryDescriptor: number, page: number, filtersDescriptor: number) => number) | undefined;
  const getMangaUpdate = exports.get_manga_update as ((mangaDescriptor: number, needsDetails: number, needsChapters: number) => number) | undefined;
  const getImageRequest = exports.get_image_request as ((urlDescriptor: number, contextDescriptor: number) => number) | undefined;
  const processPageImageExport = exports.process_page_image as ((responseDescriptor: number, contextDescriptor: number) => number) | undefined;
  const getFilterList = exports.get_filters as (() => number) | undefined;
  const freeResult = exports.free_result as ((ptr: number) => void) | undefined;
  
  // B11: Additional aidoku-rs exports
  const getHome = exports.get_home as (() => number) | undefined;
  const getMangaList = exports.get_manga_list as ((listingDescriptor: number, page: number) => number) | undefined;
  const getListings = exports.get_listings as (() => number) | undefined;
  // These exports exist but are not used in the current implementation
  void (exports.get_settings as (() => number) | undefined);
  void (exports.get_base_url as (() => number) | undefined);
  void (exports.handle_notification as ((stringDescriptor: number) => number) | undefined);
  void (exports.handle_deep_link as ((urlDescriptor: number) => number) | undefined);

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

  // Implementation of getHome with optional partial streaming callback
  function getHomeImpl(onPartial: (layout: HomeLayout) => void): HomeLayout | null {
    if (!getHome) {
      return null;
    }

    try {
      // Clear any previous partial results
      store.partialHomeResultBytes = [];
      
      // Accumulated components map (keyed by title for deduplication)
      const partialComponentsMap = new Map<string, HomeComponent>();
      
      // Set up callback to stream partials to caller
      store.onPartialHomeBytes = (partialBytes: Uint8Array) => {
        try {
          if (partialBytes && partialBytes.length > 0) {
            // HomePartialResult is an enum: Layout=0, Component=1
            const variant = partialBytes[0];
            if (variant === 0) {
              // Layout - decode full layout (skip the variant byte)
              const layout = decodeHomeLayout(partialBytes.slice(1), manifest.info.id);
              for (const component of layout.components) {
                const key = component.title ?? `_idx_${partialComponentsMap.size}`;
                partialComponentsMap.set(key, component);
              }
              console.log(`[Aidoku] Partial layout with ${layout.components.length} components`);
            } else if (variant === 1) {
              // Component - decode single component (skip the variant byte)
              const [component] = decodeHomeComponent(partialBytes, 1, manifest.info.id);
              const key = component.title ?? `_idx_${partialComponentsMap.size}`;
              partialComponentsMap.set(key, component);
              console.log(`[Aidoku] Partial component: ${component.title}`);
            }
            
            // Emit accumulated layout to caller (Swift behavior: each partial contains all so far)
            const accumulatedComponents = Array.from(partialComponentsMap.values());
            if (accumulatedComponents.length > 0) {
              onPartial({ components: accumulatedComponents });
            }
          }
        } catch (e) {
          console.warn("[Aidoku] Failed to decode partial result:", e);
        }
      };
      
      // Call WASM getHome - this will trigger onPartialHomeBytes callbacks synchronously
      const resultPtr = getHome();
      const resultBytes = readResult(resultPtr);

      if (freeResult && resultPtr > 0) {
        freeResult(resultPtr);
      }
      
      // Clean up callback
      store.onPartialHomeBytes = null;
      
      // Clear partial results after processing
      store.partialHomeResultBytes = [];

      // Convert map to array (order preserved as insertion order)
      const partialComponents = Array.from(partialComponentsMap.values());

      // Decode final result
      let finalLayout: HomeLayout = { components: [] };
      if (resultBytes && resultBytes.length > 0) {
        finalLayout = decodeHomeLayout(resultBytes, manifest.info.id);
      }

      // Merge: partial components have priority (they're the actual content)
      // If partial components exist and final is empty, use partials
      // If both exist, partials are the actual content
      if (partialComponents.length > 0) {
        // Use partial components, they're the real data
        return { components: partialComponents };
      }

      // Fall back to final result if no partials
      return finalLayout.components.length > 0 ? finalLayout : null;
    } catch (e) {
      console.error("[Aidoku] getHome error:", e);
      store.onPartialHomeBytes = null;
      return null;
    }
  }

  return {
    id: manifest.info.id,
    manifest,
    mode,
    hasImageProcessor: !!processPageImageExport,
    hasImageRequestProvider: !!getImageRequest,
    hasHome: !!getHome,
    hasListingProvider: !!getMangaList && isNewAbi,
    hasDynamicListings: !!getListings,

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
          
          // Recursive helper to convert FilterValue[] to Swift filter format
          const convertToSwiftFilter = (f: FilterValue): unknown => {
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
              case FilterType.Group: {
                // Recursive conversion of group filters
                return { 
                  type: SwiftFilterType.group, 
                  name: f.name, 
                  filters: f.filters ? f.filters.map(convertToSwiftFilter) : []
                };
              }
              case FilterType.Genre:
                // GenreFilter has value as GenreSelection[] - each with { index, state }
                return { type: SwiftFilterType.genre, name: f.name, value: f.value };
              default:
                return { type: SwiftFilterType.base, name: f.name, value: f.value };
            }
          };
          
          // Convert all filters
          const swiftFilters: unknown[] = filters.map(convertToSwiftFilter);
          
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
        console.log("[Aidoku] getSearchMangaList query=", query, "page=", page, "filters=", filters);
        
        // Query should be RAW UTF-8 bytes (not postcard-encoded!)
        // aidoku-rs uses read_string() which expects raw UTF-8
        let queryDescriptor = -1;
        if (query !== null && query !== "") {
          const queryBytes = new TextEncoder().encode(query); // RAW UTF-8!
          queryDescriptor = scope.storeValue(queryBytes);
          console.log("[Aidoku] Query descriptor=", queryDescriptor, "bytes=", Array.from(queryBytes));
        }

        // Encode filters as Vec<FilterValue>
        const filtersBytes = filters.length > 0 
          ? encodeFilterValues(filters)
          : encodeEmptyVec();
        const filtersDescriptor = scope.storeValue(filtersBytes);
        console.log("[Aidoku] Filters descriptor=", filtersDescriptor, "count=", filters.length);

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
              lang: normalizeSourceLang(chapter.lang as string),
              sourceOrder: index,
              locked: chapter.locked as boolean | undefined,
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
          lang: normalizeSourceLang(c.language),
          sourceOrder: index,
          locked: c.locked || undefined,
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
      console.log("[Runtime] getFilters called, hasExport:", !!getFilterList);
      if (!getFilterList) return [];

      try {
        const resultPtr = getFilterList();
        console.log("[Runtime] getFilterList returned ptr:", resultPtr);
        const resultBytes = readResult(resultPtr);
        console.log("[Runtime] readResult bytes:", resultBytes?.length);

        if (freeResult && resultPtr > 0) {
          freeResult(resultPtr);
        }

        if (!resultBytes) return [];

        // Decode filters from postcard
        const decodedFilters = decodeFilterList(resultBytes);
        console.log("[Runtime] decoded filters:", decodedFilters.length);

        // Convert decoded filters to Filter type
        return decodedFilters.map(convertDecodedFilter);
      } catch (e) {
        console.error("[Aidoku] getFilterList error:", e);
        return [];
      }
    },

    modifyImageRequest(url: string, context?: Record<string, string> | null): { url: string; headers: Record<string, string> } {
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
      // B9: Uses shared decodeRidFromPayload helper
      if (!getImageRequest) {
        // No custom image request handler - add default headers like Swift does
        const defaultHeaders: Record<string, string> = {
          "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        };
        const storedCookies = store.getCookiesForUrl(url);
        if (storedCookies) {
          defaultHeaders["Cookie"] = storedCookies;
        }
        return { url, headers: defaultHeaders };
      }

      const scope = store.createScope();
      try {
        // Encode URL as postcard string for aidoku-rs
        const urlBytes = encodeString(url);
        const urlDescriptor = scope.storeValue(urlBytes);
        
        // Encode context if provided (B10: correct PageContext encoding)
        // aidoku-rs expects PageContext = HashMap<String, String> when descriptor >= 0
        let contextDescriptor = -1;
        if (context !== null && context !== undefined) {
          // Store raw HashMap bytes (not Option<HashMap>), as aidoku-rs reads T when descriptor >= 0
          const contextBytes = encodeHashMap(context);
          contextDescriptor = scope.storeValue(contextBytes);
        }
        
        // Call WASM - returns a pointer to serialized result
        const resultPtr = getImageRequest(urlDescriptor, contextDescriptor);
        
        if (resultPtr < 0) {
          return { url, headers: {} };
        }
        
        // B9: Use shared helper to read result payload
        const payload = readResultPayload(memory, resultPtr);
        
        // Free the result memory
        if (freeResult) {
          freeResult(resultPtr);
        }
        
        if (!payload) {
          return { url, headers: {} };
        }
        
        // Decode the request RID from payload
        const requestId = decodeRidFromPayload(payload);
        
        if (requestId === null) {
          return { url, headers: {} };
        }
        
        // Look up the request by its RID and clean it up after use
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
        
        // B10: Encode context correctly
        // aidoku-rs reads PageContext (HashMap<String,String>) when context_descriptor >= 0
        // It does NOT expect Option<T>, just T directly
        let contextDescriptor = -1;
        if (context !== null) {
          // Store raw HashMap bytes, not Option<HashMap>
          const contextHashMapBytes = encodeHashMap(context);
          contextDescriptor = scope.storeValue(contextHashMapBytes);
        }
        
        // Call WASM process_page_image
        const resultPtr = processPageImageExport(responseDescriptor, contextDescriptor);
        
        if (resultPtr < 0) {
          return null;
        }
        
        // B9: Use shared helper to read result payload
        const payload = readResultPayload(memory, resultPtr);
        
        if (freeResult && resultPtr > 0) {
          freeResult(resultPtr);
        }
        
        if (!payload || payload.length === 0) {
          return null;
        }
        
        // Decode the result ImageRef rid using shared helper
        const resultRid = decodeRidFromPayload(payload);
        
        if (resultRid === null) {
          return null;
        }
        
        // Get processed image data
        return getHostImageData(store, resultRid);
      } catch {
        return null;
      } finally {
        scope.cleanup();
      }
    },

    // B11: getMangaListForListing - for ListingProvider sources
    getMangaListForListing(listing: Listing, page: number): MangaPageResult {
      if (!getMangaList || !isNewAbi) {
        return { entries: [], hasNextPage: false };
      }

      const scope = store.createScope();
      try {
        // Encode listing as postcard (id, name, kind)
        const listingBytes = encodeListing(listing);
        const listingDescriptor = scope.storeValue(listingBytes);
        
        const resultPtr = getMangaList(listingDescriptor, page);
        const resultBytes = readResult(resultPtr);

        if (freeResult && resultPtr > 0) {
          freeResult(resultPtr);
        }

        if (!resultBytes) {
          return { entries: [], hasNextPage: false };
        }

        const decoded = decodeMangaPageResult(resultBytes);
        const entries: Manga[] = decoded.entries.map((m: DecodedManga) => ({
          sourceId: manifest.info.id,
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
        console.error("[Aidoku] getMangaListForListing error:", e);
        return { entries: [], hasNextPage: false };
      } finally {
        scope.cleanup();
      }
    },

    // B11: getHome - for Home sources (non-streaming version)
    getHome(): HomeLayout | null {
      // Call the implementation with an empty callback
      return getHomeImpl(() => {});
    },

    // B11b: getHomeWithPartials - for Home sources with progressive streaming
    getHomeWithPartials(onPartial: (layout: HomeLayout) => void): HomeLayout | null {
      return getHomeImpl(onPartial);
    },

    // B11: getListings - for DynamicListings sources
    getListings(): Listing[] {
      if (!getListings) {
        return [];
      }

      try {
        const resultPtr = getListings();
        const resultBytes = readResult(resultPtr);

        if (freeResult && resultPtr > 0) {
          freeResult(resultPtr);
        }

        if (!resultBytes) {
          return [];
        }

        // Decode Vec<Listing> from postcard
        return decodeListings(resultBytes);
      } catch (e) {
        console.error("[Aidoku] getListings error:", e);
        return [];
      }
    },
  };
}

// Helper to encode Listing for aidoku-rs
function encodeListing(listing: Listing): Uint8Array {
  const parts: Uint8Array[] = [];
  parts.push(encodeString(listing.id));
  parts.push(encodeString(listing.name));
  parts.push(new Uint8Array([0])); // kind: Default = 0
  return concatBytes(parts);
}

// Helper to decode Vec<Listing> from postcard
function decodeListings(bytes: Uint8Array): Listing[] {
  try {
    const [listings] = decodeVec(bytes, 0, decodeListingForVec);
    return listings;
  } catch {
    return [];
  }
}

// Simple listing decoder for decodeVec (used for getListings)
function decodeListingForVec(bytes: Uint8Array, offset: number): [Listing, number] {
  let pos = offset;
  let id: string;
  let name: string;
  
  [id, pos] = decodeString(bytes, pos);
  [name, pos] = decodeString(bytes, pos);
  const kind = bytes[pos] as 0 | 1;
  pos += 1;
  
  return [{ id, name, kind }, pos];
}

// Helper to decode Option<f32> from postcard
function decodeOptionFloat(bytes: Uint8Array, pos: number): [number | undefined, number] {
  const tag = bytes[pos];
  if (tag === 0) {
    return [undefined, pos + 1];
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset + pos + 1, 4);
  return [view.getFloat32(0, true), pos + 5];
}

// Helper to decode Option<i32> from postcard
function decodeOptionInt(bytes: Uint8Array, pos: number): [number | undefined, number] {
  const tag = bytes[pos];
  if (tag === 0) {
    return [undefined, pos + 1];
  }
  const [val, newPos] = decodeVarint(bytes, pos + 1);
  return [val, newPos];
}

// Helper to decode Option<String> from postcard
function decodeOptionString(bytes: Uint8Array, pos: number): [string | undefined, number] {
  const tag = bytes[pos];
  if (tag === 0) {
    return [undefined, pos + 1];
  }
  return decodeString(bytes, pos + 1);
}

// Helper to decode Listing from postcard
function decodeListing(bytes: Uint8Array, pos: number): [Listing, number] {
  let id: string;
  let name: string;
  
  [id, pos] = decodeString(bytes, pos);
  [name, pos] = decodeString(bytes, pos);
  const kind = bytes[pos] as 0 | 1;
  pos += 1;
  
  return [{ id, name, kind }, pos];
}

// Helper to decode Option<Listing>
function decodeOptionListing(bytes: Uint8Array, pos: number): [Listing | undefined, number] {
  const tag = bytes[pos];
  if (tag === 0) {
    return [undefined, pos + 1];
  }
  return decodeListing(bytes, pos + 1);
}

// Helper to decode HomeLink from postcard
function decodeHomeLink(bytes: Uint8Array, pos: number, sourceId: string): [HomeLink, number] {
  let title: string;
  let subtitle: string | undefined;
  let imageUrl: string | undefined;
  let value: HomeLinkValue | undefined;
  
  [title, pos] = decodeString(bytes, pos);
  [subtitle, pos] = decodeOptionString(bytes, pos);
  [imageUrl, pos] = decodeOptionString(bytes, pos);
  
  // Option<LinkValue>
  const hasValue = bytes[pos];
  pos += 1;
  
  if (hasValue === 1) {
    // LinkValue is an enum: Url(String)=0, Listing(Listing)=1, Manga(Manga)=2
    const valueType = bytes[pos];
    pos += 1;
    
    if (valueType === 0) {
      let url: string;
      [url, pos] = decodeString(bytes, pos);
      value = { type: "url", url };
    } else if (valueType === 1) {
      let listing: Listing;
      [listing, pos] = decodeListing(bytes, pos);
      value = { type: "listing", listing };
    } else if (valueType === 2) {
      const [decoded, newPos] = decodeManga(bytes, pos);
      pos = newPos;
      const manga: Manga = {
        sourceId,
        id: decoded.key,
        key: decoded.key,
        title: decoded.title || undefined,
        cover: decoded.cover || undefined,
        authors: decoded.authors || undefined,
        artists: decoded.artists || undefined,
        description: decoded.description || undefined,
        tags: decoded.tags || undefined,
        status: decoded.status as MangaStatus | undefined,
        nsfw: decoded.contentRating as ContentRating | undefined,
      };
      value = { type: "manga", manga };
    }
  }
  
  return [{ title, subtitle, imageUrl, value }, pos];
}

// Helper to decode HomeFilterItem from postcard
function decodeHomeFilterItem(bytes: Uint8Array, pos: number): [HomeFilterItem, number] {
  let title: string;
  [title, pos] = decodeString(bytes, pos);
  
  // Option<Vec<FilterValue>> - simplified, skip for now
  const hasValues = bytes[pos];
  pos += 1;
  
  const values: FilterValue[] | undefined = hasValues === 1 ? [] : undefined;
  if (hasValues === 1) {
    const [count, countEnd] = decodeVarint(bytes, pos);
    pos = countEnd;
    // Skip filter values for now - complex nested structure
    // In practice, this is rarely used
    for (let i = 0; i < count; i++) {
      // FilterValue has type (u8), name (String), value (varies), filters (Option<Vec>)
      // For simplicity, we skip the actual decoding
      // Most home pages don't use filter links
    }
  }
  
  return [{ title, values }, pos];
}

// Helper to decode MangaWithChapter from postcard
function decodeMangaWithChapter(bytes: Uint8Array, pos: number, sourceId: string): [MangaWithChapter, number] {
  // Manga
  const [decodedManga, mangaEnd] = decodeManga(bytes, pos);
  pos = mangaEnd;
  
  const manga: Manga = {
    sourceId,
    id: decodedManga.key,
    key: decodedManga.key,
    title: decodedManga.title || undefined,
    cover: decodedManga.cover || undefined,
    authors: decodedManga.authors || undefined,
    description: decodedManga.description || undefined,
    tags: decodedManga.tags || undefined,
    status: decodedManga.status as MangaStatus | undefined,
  };
  
  // Chapter - decode inline following Rust struct order:
  // key: String, title: Option<String>, chapter_number: Option<f32>, volume_number: Option<f32>,
  // date_uploaded: Option<i64>, scanlators: Option<Vec<String>>, url: Option<String>,
  // language: Option<String>, thumbnail: Option<String>, locked: bool
  
  let chapterKey: string;
  let chapterTitle: string | undefined;
  let chapterNumber: number | undefined;
  let volumeNumber: number | undefined;
  let dateUploaded: number | undefined;
  let chapterScanlators: string[] | undefined;
  let chapterUrl: string | undefined;
  let chapterLang: string | undefined;
  let chapterThumbnail_: string | undefined;
  let chapterLocked_: boolean;
  
  // key: String
  [chapterKey, pos] = decodeString(bytes, pos);
  
  // title: Option<String>
  [chapterTitle, pos] = decodeOptionString(bytes, pos);
  
  // chapter_number: Option<f32>
  const hasChapterNum = bytes[pos];
  pos += 1;
  if (hasChapterNum === 1) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + pos, 4);
    chapterNumber = view.getFloat32(0, true);
    pos += 4;
  }
  
  // volume_number: Option<f32>
  const hasVolNum = bytes[pos];
  pos += 1;
  if (hasVolNum === 1) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + pos, 4);
    volumeNumber = view.getFloat32(0, true);
    pos += 4;
  }
  
  // date_uploaded: Option<i64>
  const hasDate = bytes[pos];
  pos += 1;
  if (hasDate === 1) {
    // i64 as varint
    const [date, dateEnd] = decodeVarint(bytes, pos);
    dateUploaded = date * 1000; // Convert to ms
    pos = dateEnd;
  }
  
  // scanlators: Option<Vec<String>>
  const hasScanlators = bytes[pos];
  pos += 1;
  if (hasScanlators === 1) {
    const [scanCount, scanEnd] = decodeVarint(bytes, pos);
    pos = scanEnd;
    chapterScanlators = [];
    for (let i = 0; i < scanCount; i++) {
      const [s, sEnd] = decodeString(bytes, pos);
      chapterScanlators.push(s);
      pos = sEnd;
    }
  }
  
  // url: Option<String>
  [chapterUrl, pos] = decodeOptionString(bytes, pos);
  
  // language: Option<String>
  [chapterLang, pos] = decodeOptionString(bytes, pos);
  
  // thumbnail: Option<String>
  [chapterThumbnail_, pos] = decodeOptionString(bytes, pos);
  void chapterThumbnail_; // Not used yet
  
  // locked: bool
  chapterLocked_ = bytes[pos] === 1;
  void chapterLocked_; // Not used yet
  pos += 1;
  
  const chapter: Chapter = {
    key: chapterKey,
    title: chapterTitle,
    scanlator: chapterScanlators?.join(", "),
    url: chapterUrl,
    lang: chapterLang,
    chapterNumber,
    volumeNumber,
    dateUploaded,
  };
  
  return [{ manga, chapter }, pos];
}

// Helper to decode HomeComponentValue from postcard
function decodeHomeComponentValue(bytes: Uint8Array, pos: number, sourceId: string): [HomeComponentValue, number] {
  // HomeComponentValue is an enum with variants:
  // 0 = ImageScroller, 1 = BigScroller, 2 = Scroller, 3 = MangaList, 4 = MangaChapterList, 5 = Filters, 6 = Links
  const variant = bytes[pos];
  pos += 1;
  
  switch (variant) {
    case 0: { // ImageScroller
      let links: HomeLink[] = [];
      let autoScrollInterval: number | undefined;
      let width: number | undefined;
      let height: number | undefined;
      
      // Vec<Link>
      const [linkCount, linkEnd] = decodeVarint(bytes, pos);
      pos = linkEnd;
      for (let i = 0; i < linkCount; i++) {
        const [link, newPos] = decodeHomeLink(bytes, pos, sourceId);
        links.push(link);
        pos = newPos;
      }
      
      [autoScrollInterval, pos] = decodeOptionFloat(bytes, pos);
      [width, pos] = decodeOptionInt(bytes, pos);
      [height, pos] = decodeOptionInt(bytes, pos);
      
      return [{ type: "imageScroller", links, autoScrollInterval, width, height }, pos];
    }
    
    case 1: { // BigScroller
      let entries: Manga[] = [];
      let autoScrollInterval: number | undefined;
      
      // Vec<Manga>
      const [entryCount, entryEnd] = decodeVarint(bytes, pos);
      pos = entryEnd;
      for (let i = 0; i < entryCount; i++) {
        const [decoded, newPos] = decodeManga(bytes, pos);
        pos = newPos;
        entries.push({
          sourceId,
          id: decoded.key,
          key: decoded.key,
          title: decoded.title || undefined,
          cover: decoded.cover || undefined,
          authors: decoded.authors || undefined,
          artists: decoded.artists || undefined,
          description: decoded.description || undefined,
          tags: decoded.tags || undefined,
          status: decoded.status as MangaStatus | undefined,
          nsfw: decoded.contentRating as ContentRating | undefined,
        });
      }
      
      [autoScrollInterval, pos] = decodeOptionFloat(bytes, pos);
      
      return [{ type: "bigScroller", entries, autoScrollInterval }, pos];
    }
    
    case 2: { // Scroller
      let entries: HomeLink[] = [];
      let listing: Listing | undefined;
      
      // Vec<Link>
      const [entryCount, entryEnd] = decodeVarint(bytes, pos);
      pos = entryEnd;
      for (let i = 0; i < entryCount; i++) {
        const [link, newPos] = decodeHomeLink(bytes, pos, sourceId);
        entries.push(link);
        pos = newPos;
      }
      
      [listing, pos] = decodeOptionListing(bytes, pos);
      
      return [{ type: "scroller", entries, listing }, pos];
    }
    
    case 3: { // MangaList
      let ranking: boolean;
      let pageSize: number | undefined;
      let entries: HomeLink[] = [];
      let listing: Listing | undefined;
      
      ranking = bytes[pos] === 1;
      pos += 1;
      
      [pageSize, pos] = decodeOptionInt(bytes, pos);
      
      // Vec<Link>
      const [entryCount, entryEnd] = decodeVarint(bytes, pos);
      pos = entryEnd;
      for (let i = 0; i < entryCount; i++) {
        const [link, newPos] = decodeHomeLink(bytes, pos, sourceId);
        entries.push(link);
        pos = newPos;
      }
      
      [listing, pos] = decodeOptionListing(bytes, pos);
      
      return [{ type: "mangaList", ranking, pageSize, entries, listing }, pos];
    }
    
    case 4: { // MangaChapterList
      let pageSize: number | undefined;
      let entries: MangaWithChapter[] = [];
      let listing: Listing | undefined;
      
      [pageSize, pos] = decodeOptionInt(bytes, pos);
      
      // Vec<MangaWithChapter>
      const [entryCount, entryEnd] = decodeVarint(bytes, pos);
      pos = entryEnd;
      for (let i = 0; i < entryCount; i++) {
        const [entry, newPos] = decodeMangaWithChapter(bytes, pos, sourceId);
        entries.push(entry);
        pos = newPos;
      }
      
      [listing, pos] = decodeOptionListing(bytes, pos);
      
      return [{ type: "mangaChapterList", pageSize, entries, listing }, pos];
    }
    
    case 5: { // Filters
      let items: HomeFilterItem[] = [];
      
      // Vec<FilterItem>
      const [itemCount, itemEnd] = decodeVarint(bytes, pos);
      pos = itemEnd;
      for (let i = 0; i < itemCount; i++) {
        const [item, newPos] = decodeHomeFilterItem(bytes, pos);
        items.push(item);
        pos = newPos;
      }
      
      return [{ type: "filters", items }, pos];
    }
    
    case 6: { // Links
      let links: HomeLink[] = [];
      
      // Vec<Link>
      const [linkCount, linkEnd] = decodeVarint(bytes, pos);
      pos = linkEnd;
      for (let i = 0; i < linkCount; i++) {
        const [link, newPos] = decodeHomeLink(bytes, pos, sourceId);
        links.push(link);
        pos = newPos;
      }
      
      return [{ type: "links", links }, pos];
    }
    
    default:
      throw new Error(`Unknown HomeComponentValue variant: ${variant}`);
  }
}

// Helper to decode HomeComponent from postcard
function decodeHomeComponent(bytes: Uint8Array, pos: number, sourceId: string): [HomeComponent, number] {
  let title: string | undefined;
  let subtitle: string | undefined;
  let value: HomeComponentValue;
  
  [title, pos] = decodeOptionString(bytes, pos);
  [subtitle, pos] = decodeOptionString(bytes, pos);
  [value, pos] = decodeHomeComponentValue(bytes, pos, sourceId);
  
  return [{ title, subtitle, value }, pos];
}

// Helper to decode HomeLayout from postcard
function decodeHomeLayout(bytes: Uint8Array, sourceId: string): HomeLayout {
  // HomeLayout has: components: Vec<HomeComponent>
  let pos = 0;
  
  const [componentCount, countEnd] = decodeVarint(bytes, pos);
  pos = countEnd;
  
  const components: HomeComponent[] = [];
  
  for (let i = 0; i < componentCount; i++) {
    const [component, newPos] = decodeHomeComponent(bytes, pos, sourceId);
    components.push(component);
    pos = newPos;
  }
  
  return { components };
}

// Import concatBytes helper
import { concatBytes } from "./postcard";
