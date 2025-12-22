/**
 * Adapter from Tachiyomi async source to nemu's MangaSource interface.
 * Implements TachiyomiBrowsableSource - similar to Aidoku's BrowsableSource.
 * Includes p-memoize for in-memory dedup and IndexedDB caching for images/data.
 */
import type { MangaSource, MangaSourceSWR, Manga, Chapter, Page, SearchResult } from "../types";
import { MangaStatus } from "../types";
import { parseChapterNumber } from "@/lib/chapter-recognition";
import type { AsyncTachiyomiSource } from "./async-source";
import type {
  MangaDto,
  ChapterDto,
  TachiyomiFilter,
  TachiyomiListing,
} from "./types";
import { TACHIYOMI_LISTINGS, buildFilterStateJson } from "./types";
import { proxyUrl } from "@/config";
import type { CacheStore } from "@/data/cache";
import { CacheKeys } from "@/data/cache";
import { parseSourceKey } from "@/data/keys";
import pMemoize, { pMemoizeClear } from "p-memoize";
import { normalizeSourceLang } from "../language";

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

function mangaDtoToManga(dto: MangaDto): Manga {
  return {
    id: dto.url, // Tachiyomi uses URL as identifier
    title: dto.title,
    cover: dto.thumbnailUrl,
    authors: dto.author ? [dto.author] : undefined,
    artists: dto.artist ? [dto.artist] : undefined,
    description: dto.description,
    tags: dto.genre.length > 0 ? dto.genre : undefined,
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
 * Convert ChapterDto to Chapter with chapter recognition.
 * Mihon-style: parse chapter number from name if source doesn't provide one.
 * Falls back to index-based numbering if parsing fails.
 *
 * @param dto - Chapter DTO from source
 * @param sourceLang - Language code for this source
 * @param index - Position in the chapter list (0 = newest for desc order)
 * @param totalChapters - Total number of chapters
 * @param mangaTitle - Manga title (for better chapter number parsing)
 */
function chapterDtoToChapter(
  dto: ChapterDto,
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
  getFilters(): Promise<TachiyomiFilter[]>;

  /** Reset filters to default state */
  resetFilters(): Promise<void>;

  // ============ Browse Methods ============

  /** Get listings (Popular, Latest) */
  getListings(): Promise<TachiyomiListing[]>;

  /** Get manga for a specific listing */
  getMangaForListing(listing: TachiyomiListing, page: number): Promise<SearchResult<Manga>>;

  // ============ Search with Filters ============

  /** Search with filters applied */
  searchWithFilters(
    query: string | null,
    page: number,
    filters: TachiyomiFilter[]
  ): Promise<SearchResult<Manga>>;
}

/**
 * Create a TachiyomiBrowsableSource from an AsyncTachiyomiSource
 * @param source - The async Tachiyomi source wrapper
 * @param sourceKey - Unique identifier (registryId:sourceId) for caching
 * @param cacheStore - Cache store for persistent manga/chapter/image caching
 */
export function createTachiyomiBrowsableSource(
  source: AsyncTachiyomiSource,
  sourceKey: string,
  cacheStore: CacheStore
): TachiyomiBrowsableSource {
  const { sourceId, sourceInfo } = source;
  const supportsLatest = sourceInfo.supportsLatest ?? false;
  const sourceLang = normalizeSourceLang(sourceInfo.lang);

  // Pagination state for loadMore
  let currentSearch: { query: string; page: number; filters: TachiyomiFilter[] } | null = null;
  let currentListing: { listing: TachiyomiListing; page: number } | null = null;

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

  const fetchImageBlob = pMemoize(
    async (url: string, referer: string): Promise<Blob> => {
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

      // Fetch through proxy
      const response = await fetch(proxyUrl(url), {
        headers: { "x-proxy-Referer": referer },
      });
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

  function cacheManga(mangaId: string, manga: Manga): void {
    const { registryId, sourceId } = parseSourceKey(sourceKey);
    cacheStore.setJson(CacheKeys.manga(registryId, sourceId, mangaId), manga).catch(() => {});
  }

  function cacheChapters(mangaId: string, chapters: Chapter[]): void {
    const { registryId, sourceId } = parseSourceKey(sourceKey);
    cacheStore.setJson(CacheKeys.chapters(registryId, sourceId, mangaId), chapters).catch(() => {});
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
      items: result.mangas.map(mangaDtoToManga),
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
      items: result.mangas.map(mangaDtoToManga),
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

    async getFilters(): Promise<TachiyomiFilter[]> {
      return source.getFilterList();
    },

    async resetFilters(): Promise<void> {
      await source.resetFilters();
    },

    // ============ Browse Methods ============

    async getListings(): Promise<TachiyomiListing[]> {
      // Return both Popular and Latest if supported
      if (supportsLatest) {
        return TACHIYOMI_LISTINGS;
      }
      return [TACHIYOMI_LISTINGS[0]]; // Just Popular
    },

    async getMangaForListing(listing: TachiyomiListing, page: number): Promise<SearchResult<Manga>> {
      currentListing = { listing, page };
      const result = listing.id === "popular"
        ? await source.getPopularManga(page)
        : await source.getLatestUpdates(page);
      return {
        items: result.mangas.map(mangaDtoToManga),
        hasMore: result.hasNextPage,
        loadMore: result.hasNextPage ? loadMoreListing : undefined,
      };
    },

    // ============ Search Methods ============

    async search(query: string): Promise<SearchResult<Manga>> {
      return this.searchWithFilters(query, 1, []);
    },

    async searchWithFilters(
      query: string | null,
      page: number,
      filters: TachiyomiFilter[]
    ): Promise<SearchResult<Manga>> {
      currentSearch = { query: query ?? "", page, filters };
      
      // Reset filters first, then apply new state
      await source.resetFilters();
      const filterStateJson = buildFilterStateJson(filters);
      
      const result = await source.searchMangaWithFilters(page, query ?? "", filterStateJson);
      return {
        items: result.mangas.map(mangaDtoToManga),
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
      const manga = mangaDtoToManga(dto);
      // Background cache update
      cacheManga(mangaId, manga);
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
        chapterDtoToChapter(dto, sourceLang, index, chapters.length, mangaTitle)
      );
      // Background cache update
      cacheChapters(mangaId, converted);
      return converted;
    },

    async getPages(_mangaId: string, chapterId: string): Promise<Page[]> {
      const pages = await fetchPages(chapterId);

      return pages.map((p) => ({
        index: p.index,
        async getImage(): Promise<Blob> {
          // Always use source's fetchImage - handles URL resolution, headers, and interceptors
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
      // Generic image fetch using memoized fetcher
      return fetchImageBlob(url, url);
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

    dispose(): void {
      source.terminate();
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
