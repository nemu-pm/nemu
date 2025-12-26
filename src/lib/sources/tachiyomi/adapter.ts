/**
 * Adapter from Tachiyomi async source to nemu's MangaSource interface.
 * Implements TachiyomiBrowsableSource - similar to Aidoku's BrowsableSource.
 * Includes p-memoize for in-memory dedup and IndexedDB caching for images/data.
 */
import type { MangaSource, MangaSourceSWR, Manga, Chapter, Page, SearchResult } from "../types";
import { MangaStatus } from "../types";
import { parseChapterNumber } from "@/lib/chapter-recognition";
import type { AsyncTachiyomiSource } from "@nemu.pm/tachiyomi-runtime/async";
import type { Manga as RuntimeManga, Chapter as RuntimeChapter, FilterState } from "@nemu.pm/tachiyomi-runtime";
import { buildFilterStateJson } from "@nemu.pm/tachiyomi-runtime";
import type { GenericListing } from "@/components/browse";
import { proxyUrl } from "@/config";
import type { CacheStore } from "@/data/cache";
import { CacheKeys } from "@/data/cache";
import { parseSourceKey } from "@/data/keys";
import pMemoize, { pMemoizeClear } from "p-memoize";
import { normalizeSourceLang } from "../language";
import { getSourceSettingsStore } from "@/stores/source-settings";
import type { Setting, SelectSetting } from "@/lib/settings";

/** Settings key for source selection (synthetic, not from extension) */
export const SOURCE_SELECTION_KEY = "__selected_source_id__";

/** Validate image magic bytes */
function isValidImageHeader(header: Uint8Array): boolean {
  const isJpeg = header[0] === 0xFF && header[1] === 0xD8;
  const isPng = header[0] === 0x89 && header[1] === 0x50;
  const isWebp = header[0] === 0x52 && header[1] === 0x49; // "RI" for RIFF
  const isGif = header[0] === 0x47 && header[1] === 0x49; // "GI" for GIF
  return isJpeg || isPng || isWebp || isGif;
}

// Map Tachiyomi status codes to nemu's MangaStatus
const STATUS_MAP: Record<number, typeof MangaStatus[keyof typeof MangaStatus]> = {
  0: MangaStatus.Unknown,
  1: MangaStatus.Ongoing,
  2: MangaStatus.Completed,
  3: MangaStatus.Cancelled, // Licensed in Tachiyomi
  4: MangaStatus.Hiatus, // Publishing Finished
  5: MangaStatus.Cancelled, // Cancelled
  6: MangaStatus.Hiatus, // On Hiatus
};

function toManga(dto: RuntimeManga): Manga {
  return {
    id: dto.url, // Tachiyomi uses URL as identifier
    title: dto.title,
    cover: dto.thumbnailUrl,
    authors: dto.author ? [dto.author] : undefined,
    artists: dto.artist ? [dto.artist] : undefined,
    description: dto.description,
    tags: dto.genre && dto.genre.length > 0 ? dto.genre : undefined,
    status: STATUS_MAP[dto.status] ?? MangaStatus.Unknown,
    url: dto.url,
  };
}

// Locked chapter prefixes used by various extensions (GigaViewer, TencentComics, etc.)
const LOCKED_PREFIXES = [
  "💴 ", // YEN_BANKNOTE - paid chapter (GigaViewer)
  "🔒 ", // LOCK - locked/unpublished (GigaViewer, TencentComics)
  "💴",  // Without trailing space
  "🔒",  // Without trailing space
];

/**
 * Strip locked prefixes from chapter name and detect locked status.
 */
function parseLockedStatus(name: string): { title: string; locked: boolean } {
  for (const prefix of LOCKED_PREFIXES) {
    if (name.startsWith(prefix)) {
      return { title: name.slice(prefix.length), locked: true };
    }
  }
  return { title: name, locked: false };
}

/**
 * Convert RuntimeChapter to Chapter with chapter recognition.
 * Mihon-style: parse chapter number from name if source doesn't provide one.
 * Falls back to index-based numbering if parsing fails.
 *
 * @param dto - Chapter DTO from source
 * @param sourceLang - Language code for this source
 * @param index - Position in the chapter list (0 = newest for desc order)
 * @param totalChapters - Total number of chapters
 * @param mangaTitle - Manga title (for better chapter number parsing)
 */
function toChapter(
  dto: RuntimeChapter,
  sourceLang: string | undefined,
  index: number,
  totalChapters: number,
  mangaTitle: string
): Chapter {
  // Detect and strip locked prefixes (💴, 🔒)
  const { title, locked } = parseLockedStatus(dto.name);

  // Parse chapter number from name if source returns invalid (-1)
  // This handles sources like MangaDex that put "Vol.1 Ch.5 - Title" in name
  const sourceNumber = dto.chapterNumber > -1 ? dto.chapterNumber : undefined;
  const parsedNumber = parseChapterNumber(mangaTitle, title, sourceNumber);

  // Fallback to index-based numbering if recognition fails
  // Tachiyomi sources typically return chapters in descending order (newest first)
  // So index 0 = highest chapter, last index = chapter 1
  const chapterNumber = parsedNumber > -1 ? parsedNumber : totalChapters - index;

  return {
    id: dto.url, // Tachiyomi uses URL as identifier
    title,
    chapterNumber,
    dateUploaded: dto.dateUpload,
    scanlator: dto.scanlator,
    url: dto.url,
    lang: sourceLang,
    locked: locked || undefined, // Only set if true
  };
}

/**
 * Extended interface for Tachiyomi sources with browse/filter capabilities.
 * Similar to Aidoku's BrowsableSource interface.
 * Extends MangaSourceSWR for stale-while-revalidate caching support.
 */
export interface TachiyomiBrowsableSource extends MangaSource, MangaSourceSWR {
  /** Source key (registryId:sourceId) for session tracking */
  readonly sourceKey: string;
  
  /** Whether this source supports latest updates */
  readonly supportsLatest: boolean;

  // ============ Filter Methods ============

  /** Get available filters for this source */
  getFilters(): Promise<FilterState[]>;

  /** Reset filters to default state */
  resetFilters(): Promise<void>;

  // ============ Browse Methods ============

  /** Get listings (Popular, Latest) */
  getListings(): Promise<GenericListing[]>;

  /** Get manga for a specific listing */
  getMangaForListing(listing: GenericListing, page: number): Promise<SearchResult<Manga>>;

  // ============ Search with Filters ============

  /** Search with filters applied */
  searchWithFilters(
    query: string | null,
    page: number,
    filters: FilterState[]
  ): Promise<SearchResult<Manga>>;

  // ============ Tachiyomi-specific ============

  /** Sync pending preference changes to persistent store */
  syncPreferences(): Promise<void>;
}

/**
 * Get the SharedPreferences name for a source.
 * Format: "source_{sourceNumericId}" matching Tachiyomi's naming convention.
 */
function getPrefsName(sourceId: string): string {
  // Tachiyomi uses numeric IDs derived from source identifier hash
  // For now, use sourceId as-is (extensions usually use their own naming)
  return `source_${sourceId}`;
}

/**
 * Initialize source preferences from stored values.
 * Loads values from source-settings store and sends to worker.
 */
async function initSourcePreferences(
  source: AsyncTachiyomiSource,
  sourceKey: string
): Promise<void> {
  const prefsName = getPrefsName(source.sourceId);
  const store = getSourceSettingsStore();
  const values = store.getState().values.get(sourceKey) ?? {};
  await source.initPreferences(prefsName, values);
}

/**
 * Sync preference changes from worker back to store.
 * Call periodically or after operations that may change prefs.
 */
async function syncPrefChanges(
  source: AsyncTachiyomiSource,
  sourceKey: string
): Promise<void> {
  const changes = await source.flushPrefChanges();
  if (changes.length === 0) return;

  const store = getSourceSettingsStore();
  for (const change of changes) {
    if (change.key === "__clear__") {
      store.getState().resetSettings(sourceKey);
    } else if (change.value === undefined) {
      // Remove - currently just set to undefined
      store.getState().setSetting(sourceKey, change.key, undefined);
    } else {
      store.getState().setSetting(sourceKey, change.key, change.value);
    }
  }
}

/**
 * Parse raw schema from Kotlin/JS to Setting[] format
 */
function parseSettingsSchema(schemaJson: string | null): Setting[] | null {
  if (!schemaJson) return null;
  try {
    const rawSchema = JSON.parse(schemaJson) as Array<{
      type: string;
      key: string;
      title: string;
      summary?: string;
      values?: string[];
      titles?: string[];
      default?: unknown;
    }>;
    const settings: Setting[] = [];
    for (const pref of rawSchema) {
      const base = { key: pref.key, title: pref.title };
      switch (pref.type) {
        case "select":
          settings.push({
            ...base,
            type: "select" as const,
            values: pref.values ?? [],
            titles: pref.titles,
            default: pref.default as string | undefined,
          });
          break;
        case "multi-select":
          settings.push({
            ...base,
            type: "multi-select" as const,
            values: pref.values ?? [],
            titles: pref.titles,
            default: pref.default as string[] | undefined,
          });
          break;
        case "switch":
          settings.push({
            ...base,
            type: "switch" as const,
            subtitle: pref.summary,
            default: pref.default as boolean | undefined,
          });
          break;
        case "text":
          settings.push({
            ...base,
            type: "text" as const,
            default: pref.default as string | undefined,
          });
          break;
      }
    }
    return settings.length > 0 ? settings : null;
  } catch (e) {
    console.error("[TachiyomiAdapter] Failed to parse settings schema:", e);
    return null;
  }
}

/**
 * Create a TachiyomiBrowsableSource from an AsyncTachiyomiSource
 * @param source - The async Tachiyomi source wrapper
 * @param sourceKey - Unique identifier (registryId:sourceId) for caching
 * @param cacheStore - Cache store for persistent manga/chapter/image caching
 */
export async function createTachiyomiBrowsableSource(
  source: AsyncTachiyomiSource,
  sourceKey: string,
  cacheStore: CacheStore
): Promise<TachiyomiBrowsableSource> {
  const { sourceId, sourceInfo } = source;
  const supportsLatest = sourceInfo.supportsLatest ?? false;
  const sourceLang = normalizeSourceLang(sourceInfo.lang);

  // Initialize preferences before any operations
  await initSourcePreferences(source, sourceKey);

  // Load settings schema ONCE at creation time (not lazily)
  const schemaJson = await source.getSettingsSchema();
  let schema = parseSettingsSchema(schemaJson);
  
  // Add source selector if extension has multiple sources
  const allSources = source.manifest.sources ?? [];
  if (allSources.length > 1) {
    const sourceSelector: SelectSetting = {
      type: "select",
      key: SOURCE_SELECTION_KEY,
      title: "Source",
      values: allSources.map(s => s.id),
      titles: allSources.map(s => `${s.name} (${s.lang})`),
      default: sourceId, // Current source is the default
      refreshes: ["content", "listings", "filters"],
    };
    schema = schema ? [sourceSelector, ...schema] : [sourceSelector];
  }
  
  // Cache schema in store for persistence
  if (schema) {
    const store = getSourceSettingsStore();
    await store.getState().setSchema(sourceKey, schema);
  }

  // Pagination state for loadMore
  let currentSearch: { query: string; page: number; filters: FilterState[] } | null = null;
  let currentListing: { listing: GenericListing; page: number } | null = null;

  // ============ Memoized Fetchers ============
  // p-memoize: caches results + dedupes concurrent calls with same key

  const fetchMangaDetails = pMemoize(
    (mangaId: string) => source.getMangaDetails(mangaId)
  );

  const fetchChapters = pMemoize(
    (mangaId: string) => source.getChapterList(mangaId)
  );

  const fetchPages = pMemoize(
    (chapterId: string) => source.getPageList(chapterId)
  );

  // Cache source headers (lazy loaded once)
  let sourceHeaders: Record<string, string> | null = null;
  const getSourceHeaders = async (): Promise<Record<string, string>> => {
    if (!sourceHeaders) {
      sourceHeaders = await source.getHeaders();
    }
    return sourceHeaders;
  };

  const fetchImageBlob = pMemoize(
    async (url: string): Promise<Blob> => {
      const cacheKey = CacheKeys.image(`tachi:${url}`);

      // Check IndexedDB cache first
      try {
        const cached = await cacheStore.get(cacheKey);
        if (cached && cached.byteLength > 0) {
          const header = new Uint8Array(cached.slice(0, 4));
          if (isValidImageHeader(header)) {
            return new Blob([cached]);
          }
          // Invalid cache, delete and refetch
          await cacheStore.delete(cacheKey);
        }
      } catch {
        // Cache miss or error, continue to fetch
      }

      // Get source headers (includes Referer from headersBuilder)
      const headers = await getSourceHeaders();
      const proxyHeaders: Record<string, string> = {};
      for (const [key, value] of Object.entries(headers)) {
        proxyHeaders[`x-proxy-${key}`] = value;
      }

      // Fetch through proxy with source headers
      const response = await fetch(proxyUrl(url), { headers: proxyHeaders });
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status}`);
      }

      const blob = await response.blob();

      // Cache to IndexedDB (fire & forget)
      blob.arrayBuffer().then(buffer => {
        cacheStore.set(cacheKey, buffer).catch(() => {});
      });

      return blob;
    },
    { cacheKey: ([url]) => url }
  );

  // ============ Cache Helpers ============

  async function cacheManga(mangaId: string, manga: Manga): Promise<void> {
    const { registryId, sourceId } = parseSourceKey(sourceKey);
    try {
      await cacheStore.setJson(CacheKeys.manga(registryId, sourceId, mangaId), manga);
    } catch {
      // Cache is best-effort; never fail content fetch because caching failed.
    }
  }

  async function cacheChapters(mangaId: string, chapters: Chapter[]): Promise<void> {
    const { registryId, sourceId } = parseSourceKey(sourceKey);
    try {
      await cacheStore.setJson(CacheKeys.chapters(registryId, sourceId, mangaId), chapters);
    } catch {
      // Cache is best-effort; never fail content fetch because caching failed.
    }
  }

  // ============ Internal Helpers ============

  async function loadMoreSearch(): Promise<SearchResult<Manga>> {
    if (!currentSearch) {
      return { items: [], hasMore: false };
    }
    currentSearch.page++;
    const filterStateJson = buildFilterStateJson(currentSearch.filters);
    const result = await source.searchMangaWithFilters(
      currentSearch.page,
      currentSearch.query,
      filterStateJson
    );
    return {
      items: result.mangas.map(toManga),
      hasMore: result.hasNextPage,
      loadMore: result.hasNextPage ? loadMoreSearch : undefined,
    };
  }

  async function loadMoreListing(): Promise<SearchResult<Manga>> {
    if (!currentListing) {
      return { items: [], hasMore: false };
    }
    currentListing.page++;
    const result = currentListing.listing.id === "popular"
      ? await source.getPopularManga(currentListing.page)
      : await source.getLatestUpdates(currentListing.page);
    return {
      items: result.mangas.map(toManga),
      hasMore: result.hasNextPage,
      loadMore: result.hasNextPage ? loadMoreListing : undefined,
    };
  }

  return {
    id: sourceId,
    name: sourceInfo.name,
    icon: undefined, // TODO: extension icons
    sourceKey,
    supportsLatest,

    // ============ Filter Methods ============

    async getFilters(): Promise<FilterState[]> {
      return source.getFilterList();
    },

    async resetFilters(): Promise<void> {
      await source.resetFilters();
    },

    // ============ Browse Methods ============

    async getListings(): Promise<GenericListing[]> {
      // Return both Popular and Latest if supported
      // Names are translation keys - UI will localize
      if (supportsLatest) {
        return [
          { id: "popular", name: "browse.listing.popular" },
          { id: "latest", name: "browse.listing.latest" },
        ];
      }
      return [{ id: "popular", name: "browse.listing.popular" }];
    },

    async getMangaForListing(listing: GenericListing, page: number): Promise<SearchResult<Manga>> {
      currentListing = { listing, page };
      const result = listing.id === "popular"
        ? await source.getPopularManga(page)
        : await source.getLatestUpdates(page);
      return {
        items: result.mangas.map(toManga),
        hasMore: result.hasNextPage,
        loadMore: result.hasNextPage ? loadMoreListing : undefined,
      };
    },

    // ============ Search Methods ============

    async search(query: string): Promise<SearchResult<Manga>> {
      // Can't use this.searchWithFilters since we're building the object
      currentSearch = { query, page: 1, filters: [] };
      await source.resetFilters();
      const result = await source.searchMangaWithFilters(1, query, "[]");
      return {
        items: result.mangas.map(toManga),
        hasMore: result.hasNextPage,
        loadMore: result.hasNextPage ? loadMoreSearch : undefined,
      };
    },

    async searchWithFilters(
      query: string | null,
      page: number,
      filters: FilterState[]
    ): Promise<SearchResult<Manga>> {
      currentSearch = { query: query ?? "", page, filters };
      
      // Reset filters first, then apply new state
      await source.resetFilters();
      const filterStateJson = buildFilterStateJson(filters);
      
      const result = await source.searchMangaWithFilters(page, query ?? "", filterStateJson);
      return {
        items: result.mangas.map(toManga),
        hasMore: result.hasNextPage,
        loadMore: result.hasNextPage ? loadMoreSearch : undefined,
      };
    },

    // ============ Content Methods ============

    async getManga(mangaId: string): Promise<Manga> {
      const dto = await fetchMangaDetails(mangaId);
      if (!dto) {
        throw new Error(`Manga not found: ${mangaId}`);
      }
      const manga = toManga(dto);
      // Keep SWR cache consistent: when this resolves, cached manga should be updated too.
      await cacheManga(mangaId, manga);
      return manga;
    },

    async getChapters(mangaId: string): Promise<Chapter[]> {
      // Fetch chapters and manga title (for chapter recognition)
      const [chapters, mangaDto] = await Promise.all([
        fetchChapters(mangaId),
        fetchMangaDetails(mangaId),
      ]);
      const mangaTitle = mangaDto?.title ?? "";

      // Convert with chapter recognition (Mihon-style)
      // Falls back to index-based numbering if parsing fails
      const converted = chapters.map((dto, index) =>
        toChapter(dto, sourceLang, index, chapters.length, mangaTitle)
      );
      // Keep SWR cache consistent: when this resolves, cached chapters should be updated too.
      await cacheChapters(mangaId, converted);
      return converted;
    },

    async getPages(_mangaId: string, chapterId: string): Promise<Page[]> {
      const pages = await fetchPages(chapterId);

      return pages.map((p) => ({
        index: p.index,
        async getImage(): Promise<Blob> {
          // fetchImage always returns base64 bytes (like Mihon's getImage)
          const base64 = await source.fetchImage(p.url, p.imageUrl || "");
          const binary = atob(base64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }
          return new Blob([bytes]);
        },
      }));
    },

    async fetchImage(url: string): Promise<Blob> {
      // Use source headers (Referer etc) via proxy
      return fetchImageBlob(url);
    },

    // ============ SWR Methods ============

    async getCachedManga(mangaId: string): Promise<Manga | null> {
      const { registryId, sourceId } = parseSourceKey(sourceKey);
      return cacheStore.getJson<Manga>(CacheKeys.manga(registryId, sourceId, mangaId));
    },

    async getCachedChapters(mangaId: string): Promise<Chapter[] | null> {
      const { registryId, sourceId } = parseSourceKey(sourceKey);
      return cacheStore.getJson<Chapter[]>(CacheKeys.chapters(registryId, sourceId, mangaId));
    },

    // ============ Preferences Methods ============

    async syncPreferences(): Promise<void> {
      await syncPrefChanges(source, sourceKey);
    },

    dispose(): void {
      // Sync any final preference changes before disposing
      syncPrefChanges(source, sourceKey).catch(() => {});
      source.dispose();
      currentSearch = null;
      currentListing = null;
      // Clear memoized caches to free memory
      pMemoizeClear(fetchMangaDetails);
      pMemoizeClear(fetchChapters);
      pMemoizeClear(fetchPages);
      pMemoizeClear(fetchImageBlob);
    },
  };
}
