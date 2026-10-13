import type {
  Chapter,
  Filter,
  FilterValue,
  Listing,
  Manga,
  MangaPageResult,
} from "@/sources/aidokuContract";
import type { SelfHostedBackend, SelfHostedPageRef } from "./backend";
import {
  SelfHostedError,
  basicAuthHeader,
  buildUrl,
  requestJson,
  type SelfHostedTransport,
} from "./http";
import { parseServerDate } from "./dates";
import type { SelfHostedCredentials } from "./policy";

/**
 * Komga backend, written against Komga's published REST API
 * (https://komga.org/docs/openapi/komga-api, `/v3/api-docs` on a running server).
 * Auth is HTTP Basic or the `X-API-Key` header; both are accepted on every
 * endpoint including images.
 */

const PAGE_SIZE = 30;
const LISTING_ALL = "all";
const LISTING_LATEST = "latest";
const LISTING_UPDATED = "updated";
const LISTING_NEW = "new";
const LISTING_LIBRARY_PREFIX = "library:";
/** Page image types every platform image loader decodes; anything else is converted server-side. */
const WEB_SAFE_PAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

type KomgaPageEnvelope<T> = { content: T[]; last: boolean };

type KomgaLibrary = { id: string; name: string };

type KomgaAuthor = { name: string; role: string };

type KomgaSeries = {
  id: string;
  name: string;
  metadata: {
    status?: string;
    title?: string;
    summary?: string;
    readingDirection?: string;
    language?: string;
    genres?: string[];
    tags?: string[];
    ageRating?: number | null;
  };
  booksMetadata?: {
    authors?: KomgaAuthor[];
    summary?: string;
    tags?: string[];
  };
};

type KomgaBook = {
  id: string;
  name: string;
  created?: string;
  metadata: {
    title?: string;
    number?: string;
    numberSort?: number;
    releaseDate?: string | null;
  };
};

type KomgaPage = { number: number; mediaType: string };

export type KomgaBackendOptions = {
  server: string;
  credentials: SelfHostedCredentials;
  transport: SelfHostedTransport;
};

export function komgaAuthHeaders(credentials: SelfHostedCredentials): Record<string, string> {
  if (credentials.apiKey) return { "X-API-Key": credentials.apiKey };
  if (credentials.username && credentials.password !== undefined) {
    return { Authorization: basicAuthHeader(credentials.username, credentials.password) };
  }
  return {};
}

const STATUS: Record<string, 0 | 1 | 2 | 3 | 4> = { ONGOING: 1, ENDED: 2, ABANDONED: 3, HIATUS: 4 };
const VIEWER: Record<string, 0 | 1 | 2 | 3 | 4> = {
  RIGHT_TO_LEFT: 1,
  LEFT_TO_RIGHT: 2,
  VERTICAL: 3,
  WEBTOON: 4,
};

function contentRatingOf(ageRating: number | null | undefined): 0 | 1 | 2 {
  if (ageRating == null) return 0;
  if (ageRating >= 18) return 2;
  if (ageRating >= 15) return 1;
  return 0;
}

function authorsOf(series: KomgaSeries, roles: readonly string[]): string[] {
  const names = (series.booksMetadata?.authors ?? [])
    .filter((author) => roles.includes(author.role.toLowerCase()))
    .map((author) => author.name.trim())
    .filter(Boolean);
  return [...new Set(names)];
}

const WRITER_ROLES = ["writer", "author"];
const ARTIST_ROLES = ["penciller", "inker", "colorist", "artist", "cover"];

export function createKomgaBackend(options: KomgaBackendOptions): SelfHostedBackend {
  const server = options.server.replace(/\/+$/, "");
  const headers = komgaAuthHeaders(options.credentials);
  const get = <T>(path: string, query: Record<string, string | number | boolean | undefined> = {}, signal?: AbortSignal) =>
    requestJson<T>(options.transport, { url: buildUrl(server, path, query), headers, signal });

  const coverUrl = (seriesId: string) => buildUrl(server, `/api/v1/series/${encodeURIComponent(seriesId)}/thumbnail`);

  const mapSeries = (series: KomgaSeries): Manga => {
    const summary = series.metadata.summary?.trim() || series.booksMetadata?.summary?.trim() || undefined;
    const tags = [...new Set([...(series.metadata.genres ?? []), ...(series.metadata.tags ?? [])])];
    const authors = authorsOf(series, WRITER_ROLES);
    const artists = authorsOf(series, ARTIST_ROLES);
    return {
      key: series.id,
      title: series.metadata.title?.trim() || series.name,
      cover: coverUrl(series.id),
      ...(authors.length ? { authors } : {}),
      ...(artists.length ? { artists } : {}),
      ...(summary ? { description: summary } : {}),
      url: buildUrl(server, `/series/${encodeURIComponent(series.id)}`),
      tags,
      status: STATUS[series.metadata.status ?? ""] ?? 0,
      contentRating: contentRatingOf(series.metadata.ageRating),
      viewer: VIEWER[series.metadata.readingDirection ?? ""] ?? 0,
    };
  };

  const mapPage = (envelope: KomgaPageEnvelope<KomgaSeries>): MangaPageResult => ({
    entries: envelope.content.map(mapSeries),
    hasNextPage: !envelope.last,
  });

  const listSeries = async (
    path: string,
    page: number,
    query: Record<string, string | number | boolean | undefined> = {},
  ) => mapPage(await get<KomgaPageEnvelope<KomgaSeries>>(path, { ...query, page: Math.max(page, 1) - 1, size: PAGE_SIZE }));

  return {
    kind: "komga",

    async testConnection(signal) {
      // v2 is the current endpoint; servers older than 1.20 only know v1.
      let me: unknown;
      try {
        me = await get<unknown>("/api/v2/users/me", {}, signal);
      } catch (error) {
        if (!(error instanceof SelfHostedError) || error.code !== "not-found") throw error;
        me = await get<unknown>("/api/v1/users/me", {}, signal);
      }
      if (typeof me !== "object" || me === null || !("roles" in me)) {
        throw new SelfHostedError("invalid-response", "This address does not look like a Komga server.");
      }
      return {};
    },

    async getListings() {
      const libraries = await get<KomgaLibrary[]>("/api/v1/libraries");
      const fixed: Listing[] = [
        { id: LISTING_ALL, name: "All" },
        { id: LISTING_LATEST, name: "Latest" },
        { id: LISTING_NEW, name: "New" },
        { id: LISTING_UPDATED, name: "Updated" },
      ];
      // A single library is the same as "all"; only list libraries when there is a choice.
      return libraries.length > 1
        ? [...fixed, ...libraries.map((library) => ({ id: `${LISTING_LIBRARY_PREFIX}${library.id}`, name: library.name }))]
        : fixed;
    },

    async getFilters(): Promise<Filter[]> {
      return [];
    },

    async getMangaListForListing(listing, page) {
      if (listing.id === LISTING_LATEST) return listSeries("/api/v1/series/latest", page);
      if (listing.id === LISTING_NEW) return listSeries("/api/v1/series/new", page);
      if (listing.id === LISTING_UPDATED) return listSeries("/api/v1/series/updated", page);
      const libraryId = listing.id.startsWith(LISTING_LIBRARY_PREFIX)
        ? listing.id.slice(LISTING_LIBRARY_PREFIX.length)
        : undefined;
      return listSeries("/api/v1/series", page, { sort: "metadata.titleSort,asc", library_id: libraryId });
    },

    async search(query, page, _filters: FilterValue[]) {
      const search = query?.trim();
      return listSeries("/api/v1/series", page, {
        sort: "metadata.titleSort,asc",
        ...(search ? { search } : {}),
      });
    },

    async getMangaDetails(manga) {
      return mapSeries(await get<KomgaSeries>(`/api/v1/series/${encodeURIComponent(manga.key)}`));
    },

    async getChapterList(manga) {
      const books = await get<KomgaPageEnvelope<KomgaBook>>(`/api/v1/series/${encodeURIComponent(manga.key)}/books`, {
        unpaged: true,
        sort: "metadata.numberSort,asc",
      });
      return books.content.map((book, position): Chapter => {
        const created = parseServerDate(book.created);
        return {
          key: book.id,
          title: book.metadata.title?.trim() || book.name,
          chapterNumber: book.metadata.numberSort ?? position + 1,
          ...(created === undefined ? {} : { dateUploaded: created }),
          sourceOrder: position,
          url: buildUrl(server, `/book/${encodeURIComponent(book.id)}`),
        };
      });
    },

    async getPageList(_manga, chapter): Promise<SelfHostedPageRef[]> {
      const pages = await get<KomgaPage[]>(`/api/v1/books/${encodeURIComponent(chapter.key)}/pages`);
      return pages
        .slice()
        .sort((a, b) => a.number - b.number)
        .map((page, index) => ({
          index,
          url: buildUrl(server, `/api/v1/books/${encodeURIComponent(chapter.key)}/pages/${page.number}`, {
            convert: WEB_SAFE_PAGE_TYPES.has(page.mediaType) ? undefined : "jpeg",
          }),
        }));
    },

    async imageRequest(url) {
      return { url, headers: { ...headers } };
    },

    isServerUrl(url) {
      return url === server || url.startsWith(`${server}/`);
    },

    dispose() {},
  };
}
