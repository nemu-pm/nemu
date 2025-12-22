// Adapter from Keiyoushi async source to nemu's MangaSource interface
import type { MangaSource, Manga, Chapter, Page, SearchResult } from "../types";
import { MangaStatus } from "../types";
import type { AsyncKeiyoushiSource } from "./async-source";
import type { MangaDto, ChapterDto } from "./types";
import { proxyUrl } from "@/config";

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

function mangaDtoToManga(dto: MangaDto, _sourceId: string): Manga {
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

function chapterDtoToChapter(dto: ChapterDto): Chapter {
  return {
    id: dto.url, // Tachiyomi uses URL as identifier
    title: dto.name,
    chapterNumber: dto.chapterNumber,
    dateUploaded: dto.dateUpload,
    scanlator: dto.scanlator,
    url: dto.url,
  };
}

/**
 * Create a nemu MangaSource from an AsyncKeiyoushiSource
 */
export function createKeiyoushiMangaSource(
  source: AsyncKeiyoushiSource
): MangaSource {
  const sourceId = source.id;

  return {
    id: sourceId,
    name: source.manifest.name,
    icon: undefined, // TODO: extension icons

    async search(query: string): Promise<SearchResult<Manga>> {
      let page = 1;
      const result = await source.searchManga(page, query);
      
      const items = result.mangas.map((m) => mangaDtoToManga(m, sourceId));
      
      return {
        items,
        hasMore: result.hasNextPage,
        loadMore: result.hasNextPage
          ? async () => {
              page++;
              const nextResult = await source.searchManga(page, query);
              const nextItems = nextResult.mangas.map((m) => mangaDtoToManga(m, sourceId));
              return {
                items: nextItems,
                hasMore: nextResult.hasNextPage,
                loadMore: nextResult.hasNextPage ? undefined : undefined, // Recursive would need closure
              };
            }
          : undefined,
      };
    },

    async getManga(mangaId: string): Promise<Manga> {
      const dto = await source.getMangaDetails(mangaId);
      if (!dto) {
        throw new Error(`Manga not found: ${mangaId}`);
      }
      return mangaDtoToManga(dto, sourceId);
    },

    async getChapters(mangaId: string): Promise<Chapter[]> {
      const chapters = await source.getChapterList(mangaId);
      return chapters.map(chapterDtoToChapter);
    },

    async getPages(_mangaId: string, chapterId: string): Promise<Page[]> {
      const pages = await source.getPageList(chapterId);
      
      return pages.map((p) => ({
        index: p.index,
        async getImage(): Promise<Blob> {
          // Get the actual image URL (some sources need to resolve it)
          let imageUrl = p.imageUrl || p.url;
          
          if (!imageUrl) {
            // Need to fetch the image URL from page URL
            imageUrl = await source.getImageUrl(p.url);
          }
          
          if (!imageUrl) {
            throw new Error(`No image URL for page ${p.index}`);
          }
          
          // Fetch through proxy with appropriate headers
          const response = await fetch(proxyUrl(imageUrl), {
            headers: {
              "x-proxy-Referer": source.manifest.wasmPath.includes("mangadex") 
                ? "https://mangadex.org/" 
                : imageUrl,
            },
          });
          
          if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.status}`);
          }
          
          return response.blob();
        },
      }));
    },

    async fetchImage(url: string): Promise<Blob> {
      // Generic image fetch through proxy
      const response = await fetch(proxyUrl(url), {
        headers: {
          "x-proxy-Referer": url,
        },
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status}`);
      }
      
      return response.blob();
    },

    dispose(): void {
      source.terminate();
    },
  };
}

