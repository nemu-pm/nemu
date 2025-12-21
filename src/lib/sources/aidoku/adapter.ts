/**
 * Adapter that wraps AsyncAidokuSource to implement MangaSource interface
 * Implements Stale-While-Revalidate caching for manga/chapters
 */
import type {
  MangaSource,
  MangaSourceSWR,
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
  Filter,
  FilterValue,
  Listing,
  FilterInfo,
  HomeLayout,
} from "./types";
import { FilterType } from "./types";
import type { CacheStore } from "@/data/cache";
import { CacheKeys } from "@/data/cache";
import { parseSourceKey } from "@/data/keys";
import { createAsyncSource } from "./async-source";
import { proxyUrl } from "@/config";
import pMemoize, { pMemoizeClear } from "p-memoize";

/**
 * Track which sources have had their home refreshed this session.
 * On first visit to a source in a session, auto-refresh is triggered.
 * This is cleared on page reload.
 */
const homeRefreshedThisSession = new Set<string>();

/** Check if a source's home has been refreshed this session */
export function hasHomeBeenRefreshed(sourceKey: string): boolean {
  return homeRefreshedThisSession.has(sourceKey);
}

/** Mark a source's home as refreshed for this session */
export function markHomeRefreshed(sourceKey: string): void {
  homeRefreshedThisSession.add(sourceKey);
}

/**
 * Convert manifest FilterInfo to runtime Filter type
 * Swift manifest uses:
 * - `title`: Display name
 * - `name`: Optional, used for Check filter's sub-name
 * - `id`: Filter identifier
 */
function convertFilterInfo(info: FilterInfo, index?: number): Filter {
  // title is the display name in manifest, fall back to name or id
  const displayName = info.title ?? info.name ?? (info.id ? String(info.id) : `${info.type}-${index ?? 0}`);
  
  switch (info.type) {
    case "text":
      return {
        type: FilterType.Text,
        name: displayName,
        placeholder: info.placeholder,
      };
    case "select":
      return {
        type: FilterType.Select,
        name: displayName,
        options: info.options ?? [],
        ids: info.ids,
        default: typeof info.default === "number" ? info.default : 0,
      };
    case "sort": {
      const sortDefault = typeof info.default === "object" && info.default !== null
        ? (info.default as { index?: number; ascending?: boolean })
        : null;
      return {
        type: FilterType.Sort,
        name: displayName,
        options: info.options ?? [],
        canAscend: info.canAscend ?? true,
        default: {
          index: sortDefault?.index ?? 0,
          ascending: sortDefault?.ascending ?? false,
        },
      };
    }
    case "check":
      return {
        type: FilterType.Check,
        // For check filters, use 'name' (sub-label) if present, otherwise title
        name: info.name ?? displayName,
        canExclude: info.canExclude ?? false,
        default: typeof info.default === "boolean" ? info.default : false,
      };
    case "group":
      return {
        type: FilterType.Group,
        name: displayName,
        filters: (info.filters ?? []).map((f, i) => convertFilterInfo(f, i)),
      };
    case "genre":
    case "multi-select":
      return {
        type: FilterType.Genre,
        name: displayName,
        options: info.options ?? [],
        ids: info.ids,
        canExclude: info.canExclude ?? false,
        default: [],
      };
    default:
      // Unknown type, treat as select with no options
      return {
        type: FilterType.Select,
        name: displayName,
        options: [],
        default: 0,
      };
  }
}

/**
 * Create a MangaSource from an Aidoku WASM source
 * @param wasmUrlOrBytes - URL to fetch WASM from, or ArrayBuffer of WASM bytes
 * @param sourceKey - Unique identifier (registryId:sourceId) for settings/storage
 * @param cacheStore - Cache store for persistent manga/chapter caching
 * @param icon - Optional icon URL from registry
 */
export async function createAidokuMangaSource(
  wasmUrlOrBytes: string | ArrayBuffer,
  manifest: SourceManifest,
  sourceKey: string,
  cacheStore: CacheStore,
  icon?: string
): Promise<MangaSource> {
  const asyncSource = await createAsyncSource(wasmUrlOrBytes, manifest, sourceKey);
  return new AidokuMangaSourceAdapter(asyncSource, manifest, sourceKey, cacheStore, icon);
}

/** Extended interface for sources with browse/listing capabilities */
export interface BrowsableSource extends MangaSource {
  getFilters(): Promise<Filter[]>;
  getListings(): Promise<Listing[]>;
  searchWithFilters(query: string | null, page: number, filters: FilterValue[]): Promise<SearchResult<Manga>>;
  getMangaForListing(listing: Listing, page: number): Promise<SearchResult<Manga>>;
  hasListingProvider(): Promise<boolean>;
  hasHomeProvider(): Promise<boolean>;
  /**
   * Get home layout with IndexedDB caching.
   * @param forceRefresh - If true, bypass cache and fetch fresh data
   * @returns Home layout or null if not available
   */
  getHome(forceRefresh?: boolean): Promise<HomeLayout | null>;
  /**
   * Get home layout with progressive partial updates streamed via callback.
   * Like Swift's partialHomePublisher pattern - UI updates as each section loads.
   * @param onPartial - Callback invoked with accumulated layout as partials arrive
   * @returns Final complete home layout
   */
  getHomeWithPartials(onPartial: (layout: HomeLayout) => void): Promise<HomeLayout | null>;
  /** True when source has no home AND no listings - should show search UI directly */
  isOnlySearch(): Promise<boolean>;
  /** The source key (registryId:sourceId) for session tracking */
  readonly sourceKey: string;
}

class AidokuMangaSourceAdapter implements MangaSource, MangaSourceSWR, BrowsableSource {
  readonly id: string;
  readonly name: string;
  readonly icon?: string;
  readonly sourceKey: string;

  private asyncSource: AsyncAidokuSource;
  private manifest: SourceManifest;
  private cacheStore: CacheStore;
  private currentSearch: { query: string; page: number; filters: FilterValue[] } | null = null;
  private currentListing: { listing: Listing; page: number } | null = null;
  private _hasImageProcessor: boolean | null = null;
  
  // Memoized fetchers - handle caching + concurrent request deduplication
  private fetchChapters: (mangaId: string) => Promise<AidokuChapter[]>;
  private fetchMangaDetails: (mangaId: string) => Promise<AidokuManga>;
  private fetchRawPages: (mangaId: string, chapterId: string) => Promise<AidokuPage[]>;
  private fetchImageBlob: (url: string, context: Record<string, string> | null) => Promise<Blob>;

  constructor(asyncSource: AsyncAidokuSource, manifest: SourceManifest, sourceKey: string, cacheStore: CacheStore, icon?: string) {
    this.asyncSource = asyncSource;
    this.manifest = manifest;
    this.id = manifest.info.id;
    this.name = manifest.info.name;
    this.icon = icon;
    this.sourceKey = sourceKey;
    this.cacheStore = cacheStore;
    
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
        // Check IndexedDB cache first
        const cacheKey = CacheKeys.image(`${url}:${JSON.stringify(context)}`);
        try {
          const cached = await this.cacheStore.get(cacheKey);
          if (cached && cached.byteLength > 0) {
            // Validate cached data looks like an image (check magic bytes)
            const header = new Uint8Array(cached.slice(0, 4));
            const isJpeg = header[0] === 0xFF && header[1] === 0xD8;
            const isPng = header[0] === 0x89 && header[1] === 0x50;
            const isWebp = header[0] === 0x52 && header[1] === 0x49; // "RI" for RIFF
            const isGif = header[0] === 0x47 && header[1] === 0x49; // "GI" for GIF
            
            if (isJpeg || isPng || isWebp || isGif) {
              return new Blob([cached]);
            }
            // Invalid cache (probably error response), delete and refetch
            await this.cacheStore.delete(cacheKey);
          }
        } catch {
          // Cache miss or error, continue to fetch
        }

        const { headers } = await asyncSource.modifyImageRequest(url);
        // Build proxy headers from source-provided headers only
        // (Swift does NOT add default Referer - source handles it via modifyImageRequest)
        const proxyHeaders: Record<string, string> = {};
        for (const [k, v] of Object.entries(headers)) {
          proxyHeaders[`x-proxy-${k}`] = v;
        }
        const response = await fetch(proxyUrl(url), { headers: proxyHeaders });
        if (!response.ok) {
          throw new Error(`Failed to fetch image: ${response.status}`);
        }
        
        // Check if we need to process (descramble) the image
        // Only process if context is provided - cover images (context=null) don't need descrambling
        if (this._hasImageProcessor === null) {
          this._hasImageProcessor = await asyncSource.hasImageProcessor();
        }
        
        let blob: Blob;
        if (this._hasImageProcessor && context !== null) {
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
            // Processed data is PNG bytes
            blob = new Blob([new Uint8Array(processed)], { type: "image/png" });
          } else {
            blob = new Blob([new Uint8Array(imageBytes)]);
          }
        } else {
          blob = await response.blob();
        }
        
        // Cache to IndexedDB (fire and forget)
        blob.arrayBuffer().then(buffer => {
          this.cacheStore.set(cacheKey, buffer).catch(() => {});
        });
        
        return blob;
      },
      // In-memory dedup key includes context
      { cacheKey: ([url, context]) => `${url}:${JSON.stringify(context)}` }
    );
  }

  async search(query: string): Promise<SearchResult<Manga>> {
    return this.searchWithFilters(query, 1, []);
  }

  async searchWithFilters(query: string | null, page: number, filters: FilterValue[]): Promise<SearchResult<Manga>> {
    this.currentSearch = { query: query ?? "", page, filters };
    const result = await this.asyncSource.getSearchMangaList(query, page, filters);

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
      this.currentSearch.query || null,
      this.currentSearch.page,
      this.currentSearch.filters
    );

    return {
      items: result.entries.map(this.convertManga),
      hasMore: result.hasNextPage,
      loadMore: result.hasNextPage ? () => this.loadMoreSearch() : undefined,
    };
  }

  async getFilters(): Promise<Filter[]> {
    // First check manifest for static filters (most sources use this)
    const manifestFilters = this.manifest.filters;
    if (manifestFilters && manifestFilters.length > 0) {
      // Filter out "title" and "author" type filters - these are handled by the search input
      // per Swift's FilterHeaderView which only shows sort, check, select, multiselect, range
      return manifestFilters
        .filter(f => f.type !== "title" && f.type !== "author")
        .map((f, i) => convertFilterInfo(f, i));
    }
    
    // Fallback to WASM export (DynamicFilters)
    return this.asyncSource.getFilters();
  }

  async getListings(): Promise<Listing[]> {
    // First check manifest for static listings
    // Note: Manifest listings may have only 'id' or only 'name' depending on source version
    const manifestListings = (this.manifest.listings ?? []).map(l => normalizeManifestListing(l));
    
    // Then try dynamic listings from WASM
    const dynamicListings = await this.asyncSource.getListings();
    
    // Combine: dynamic listings first, then manifest listings (avoiding duplicates)
    if (dynamicListings.length > 0) {
      return dynamicListings;
    }
    if (manifestListings.length > 0) {
      return manifestListings;
    }
    
    // No listings available - return empty (UI should handle onlySearch case)
    return [];
  }

  async hasListingProvider(): Promise<boolean> {
    // Has listing provider if either manifest defines listings or WASM provides them
    const hasManifestListings = (this.manifest.listings?.length ?? 0) > 0;
    const hasDynamicProvider = await this.asyncSource.hasListingProvider();
    return hasManifestListings || hasDynamicProvider;
  }
  
  /**
   * Computed property matching Swift's source.onlySearch
   * True when source has no home provider AND no listings
   */
  async isOnlySearch(): Promise<boolean> {
    const hasHome = await this.hasHomeProvider();
    const hasListings = await this.hasListingProvider();
    return !hasHome && !hasListings;
  }

  async hasHomeProvider(): Promise<boolean> {
    return this.asyncSource.hasHomeProvider();
  }

  async getHome(forceRefresh?: boolean): Promise<HomeLayout | null> {
    const { registryId, sourceId } = parseSourceKey(this.sourceKey);
    const cacheKey = CacheKeys.home(registryId, sourceId);

    // Try cache first (unless forcing refresh)
    if (!forceRefresh) {
      try {
        const cached = await this.cacheStore.getJson<HomeLayout>(cacheKey);
        if (cached) {
          console.log("[Aidoku] Returning cached home layout for", this.sourceKey);
          return cached;
        }
      } catch {
        // Cache miss or error, continue to fetch
      }
    }

    // Fetch fresh data
    console.log("[Aidoku] Fetching fresh home layout for", this.sourceKey);
    const home = await this.asyncSource.getHome();

    // Cache the result if we got data
    if (home) {
      try {
        await this.cacheStore.setJson(cacheKey, home);
        console.log("[Aidoku] Cached home layout for", this.sourceKey);
      } catch (e) {
        console.warn("[Aidoku] Failed to cache home layout:", e);
      }
    }

    return home;
  }

  async getHomeWithPartials(onPartial: (layout: HomeLayout) => void): Promise<HomeLayout | null> {
    // Progressive loading - no caching during streaming, but cache final result
    console.log("[Aidoku] Fetching home with partials for", this.sourceKey);
    const home = await this.asyncSource.getHomeWithPartials(onPartial);

    // Cache the final result
    if (home) {
      const { registryId, sourceId } = parseSourceKey(this.sourceKey);
      const cacheKey = CacheKeys.home(registryId, sourceId);
      try {
        await this.cacheStore.setJson(cacheKey, home);
        console.log("[Aidoku] Cached home layout for", this.sourceKey);
      } catch (e) {
        console.warn("[Aidoku] Failed to cache home layout:", e);
      }
    }

    return home;
  }

  async getMangaForListing(listing: Listing, page: number): Promise<SearchResult<Manga>> {
    this.currentListing = { listing, page };
    
    const result = await this.asyncSource.getMangaListForListing(listing, page);

    return {
      items: result.entries.map(this.convertManga),
      hasMore: result.hasNextPage,
      loadMore: result.hasNextPage ? () => this.loadMoreListing() : undefined,
    };
  }

  private async loadMoreListing(): Promise<SearchResult<Manga>> {
    if (!this.currentListing) {
      return { items: [], hasMore: false };
    }

    this.currentListing.page++;
    
    const result = await this.asyncSource.getMangaListForListing(
      this.currentListing.listing,
      this.currentListing.page
    );

    return {
      items: result.entries.map(this.convertManga),
      hasMore: result.hasNextPage,
      loadMore: result.hasNextPage ? () => this.loadMoreListing() : undefined,
    };
  }

  async getManga(mangaId: string): Promise<Manga> {
    const result = await this.fetchMangaDetails(mangaId);
    const manga = this.convertManga(result);
    // Update cache in background
    this.cacheManga(mangaId, manga);
    return manga;
  }

  async getChapters(mangaId: string): Promise<Chapter[]> {
    const chapters = await this.fetchChapters(mangaId);
    const converted = chapters.map(this.convertChapter);
    // Update cache in background
    this.cacheChapters(mangaId, converted);
    return converted;
  }

  // ============ SWR METHODS ============

  async getCachedManga(mangaId: string): Promise<Manga | null> {
    const [registryId, sourceId] = this.sourceKey.split(":");
    return this.cacheStore.getJson<Manga>(CacheKeys.manga(registryId, sourceId, mangaId));
  }

  async getCachedChapters(mangaId: string): Promise<Chapter[] | null> {
    const [registryId, sourceId] = this.sourceKey.split(":");
    return this.cacheStore.getJson<Chapter[]>(CacheKeys.chapters(registryId, sourceId, mangaId));
  }

  private cacheManga(mangaId: string, manga: Manga): void {
    const [registryId, sourceId] = this.sourceKey.split(":");
    this.cacheStore.setJson(CacheKeys.manga(registryId, sourceId, mangaId), manga);
  }

  private cacheChapters(mangaId: string, chapters: Chapter[]): void {
    const [registryId, sourceId] = this.sourceKey.split(":");
    this.cacheStore.setJson(CacheKeys.chapters(registryId, sourceId, mangaId), chapters);
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

  async fetchImage(url: string): Promise<Blob> {
    return this.fetchImageBlob(url, null);
  }

  dispose(): void {
    this.asyncSource.terminate();
    this.currentSearch = null;
    this.currentListing = null;
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
    lang: chapter.lang,
    chapterNumber: chapter.chapterNumber,
    volumeNumber: chapter.volumeNumber,
    dateUploaded: chapter.dateUploaded,
    scanlator: chapter.scanlator,
    url: chapter.url,
    locked: chapter.locked,
  });
}

/**
 * Normalize a listing from manifest which may have only 'id' or only 'name'.
 * Old sources used only 'name', new aidoku-rs uses both 'id' and 'name'.
 * Some sources may only provide 'id' without 'name'.
 */
function normalizeManifestListing(listing: Partial<Listing> & { id?: string; name?: string }): Listing {
  const id = listing.id ?? listing.name ?? "";
  const name = listing.name ?? listing.id ?? "";
  return {
    id,
    name,
    kind: listing.kind,
  };
}

