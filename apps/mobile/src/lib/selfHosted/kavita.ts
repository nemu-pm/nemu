import type { Chapter, Filter, Listing, Manga, MangaPageResult } from "@/sources/aidokuContract";
import type { SelfHostedBackend, SelfHostedPageRef } from "./backend";
import { parseServerDate } from "./dates";
import {
  SelfHostedError,
  buildUrl,
  errorForStatus,
  parseJson,
  type SelfHostedRequest,
  type SelfHostedResponse,
  type SelfHostedTransport,
} from "./http";
import type { SelfHostedCredentials } from "./policy";

/**
 * Kavita backend, written against Kavita's published API
 * (https://github.com/Kareadita/Kavita/blob/develop/openapi.json, wiki at
 * https://wiki.kavitareader.com). The login is either an auth/API key, exchanged
 * for a JWT with `POST /api/Plugin/authenticate`, or a username and password
 * (`POST /api/Account/login`). A rejected JWT is replaced by signing in again,
 * once per request, so an expired session heals without storing a refresh token.
 */

const PLUGIN_NAME = "nemu";
const PAGE_SIZE = 30;
/** Kavita's marker for "this has no chapter/volume number". */
const NO_NUMBER = -100_000;
/** MangaFormat.Image / Archive: the formats that are pages of images. Epub and PDF are not. */
const IMAGE_FORMATS = "0,1";

const FIELD_SERIES_NAME = 1;
const FIELD_LIBRARIES = 19;
const FIELD_FORMATS = 21;
const COMPARISON_EQUAL = 0;
const COMPARISON_CONTAINS = 5;
const COMPARISON_MATCHES = 7;
const SORT_NAME = 1;
const SORT_CREATED = 2;
const SORT_LAST_CHAPTER_ADDED = 4;
const COMBINATION_AND = 1;
/** LibraryType.Manga / Comic / Image: the libraries made of image pages. */
const IMAGE_LIBRARY_TYPES = new Set([0, 1, 3]);

const LISTING_ALL = "all";
const LISTING_RECENT = "recent";
const LISTING_UPDATED = "updated";
const LISTING_LIBRARY_PREFIX = "library:";

type KavitaUser = {
  token: string;
  apiKey?: string;
  kavitaVersion?: string;
  authKeys?: { key: string; name: string }[];
};

type KavitaLibrary = { id: number; name: string; type: number };

type KavitaSeries = {
  id: number;
  name: string;
  localizedName?: string;
  libraryId?: number;
};

type KavitaNamed = { title?: string; name?: string };

type KavitaMetadata = {
  summary?: string;
  genres?: KavitaNamed[];
  tags?: KavitaNamed[];
  writers?: KavitaNamed[];
  pencillers?: KavitaNamed[];
  inkers?: KavitaNamed[];
  colorists?: KavitaNamed[];
  coverArtists?: KavitaNamed[];
  ageRating?: number;
  publicationStatus?: number;
  language?: string;
};

type KavitaChapter = {
  id: number;
  number?: string;
  minNumber?: number;
  titleName?: string;
  title?: string;
  isSpecial?: boolean;
  pages: number;
  createdUtc?: string;
  created?: string;
  releaseDate?: string;
  sortOrder?: number;
};

type KavitaVolume = {
  id: number;
  name?: string;
  minNumber?: number;
  number?: number;
  chapters: KavitaChapter[];
};

type KavitaSeriesDetail = {
  specials?: KavitaChapter[];
  chapters?: KavitaChapter[];
  volumes?: KavitaVolume[];
};

type KavitaChapterInfo = { pages: number };

export type KavitaLabels = {
  volume: (number: string) => string;
  chapter: (number: string) => string;
  special: string;
};

export const KAVITA_ENGLISH_LABELS: KavitaLabels = {
  volume: (number) => `Volume ${number}`,
  chapter: (number) => `Chapter ${number}`,
  special: "Special",
};

export type KavitaBackendOptions = {
  server: string;
  credentials: SelfHostedCredentials;
  transport: SelfHostedTransport;
  labels?: KavitaLabels;
};

const STATUS: Record<number, 0 | 1 | 2 | 3 | 4> = { 0: 1, 1: 4, 2: 2, 3: 3, 4: 2 };

function contentRatingOf(ageRating: number | undefined): 0 | 1 | 2 {
  if (ageRating === undefined) return 0;
  if (ageRating >= 12 && ageRating <= 14) return 2; // R18+, Adults Only, X18+
  if (ageRating >= 9 && ageRating <= 11) return 1; // Mature 15+/17+, Mature
  return 0;
}

const names = (list: KavitaNamed[] | undefined): string[] =>
  [...new Set((list ?? []).map((item) => (item.name ?? item.title ?? "").trim()).filter(Boolean))];

const hasNumber = (value: number | undefined): value is number =>
  value !== undefined && Number.isFinite(value) && value > NO_NUMBER;

function chapterTimestamp(chapter: KavitaChapter): number | undefined {
  return parseServerDate(chapter.createdUtc ?? chapter.created);
}

export function createKavitaBackend(options: KavitaBackendOptions): SelfHostedBackend {
  const server = options.server.replace(/\/+$/, "");
  const labels = options.labels ?? KAVITA_ENGLISH_LABELS;
  const { credentials, transport } = options;
  let session: Promise<{ token: string; imageKey: string }> | null = null;

  const signIn = async (): Promise<{ token: string; imageKey: string }> => {
    let response: SelfHostedResponse;
    if (credentials.apiKey) {
      response = await transport({
        url: buildUrl(server, "/api/Plugin/authenticate", { apiKey: credentials.apiKey, pluginName: PLUGIN_NAME }),
        method: "POST",
      });
    } else if (credentials.username && credentials.password !== undefined) {
      response = await transport({
        url: buildUrl(server, "/api/Account/login"),
        method: "POST",
        json: { username: credentials.username, password: credentials.password },
      });
    } else {
      throw new SelfHostedError("unauthorized", "No login is saved for this server.");
    }
    // A server without these endpoints is not a Kavita server at all.
    if (response.status === 404) {
      throw new SelfHostedError("invalid-response", "This address does not look like a Kavita server.", 404);
    }
    const failure = errorForStatus(response.status);
    if (failure) throw failure;
    const user = parseJson<KavitaUser>(response);
    if (typeof user.token !== "string" || !user.token) {
      throw new SelfHostedError("invalid-response", "This address does not look like a Kavita server.");
    }
    // Page images authenticate with a key in the query string. With an API key
    // login that is the key itself; with a password login it is the account's
    // image-only key when the server has one, else its default key.
    const imageKey =
      credentials.apiKey ?? user.authKeys?.find((key) => key.name === "image-only")?.key ?? user.apiKey ?? "";
    knownVersion = user.kavitaVersion;
    return { token: user.token, imageKey };
  };
  let knownVersion: string | undefined;

  const ensureSession = (fresh = false) => {
    if (fresh || !session) {
      session = signIn();
      session.catch(() => {
        session = null;
      });
    }
    return session;
  };

  const authed = async (request: SelfHostedRequest): Promise<SelfHostedResponse> => {
    for (let attempt = 0; ; attempt += 1) {
      const { token } = await ensureSession(attempt > 0);
      const response = await transport({
        ...request,
        headers: { ...request.headers, Authorization: `Bearer ${token}` },
      });
      if (response.status === 401 && attempt === 0) continue;
      return response;
    }
  };

  const getJson = async <T>(path: string, query: Record<string, string | number | boolean | undefined> = {}, signal?: AbortSignal) => {
    const response = await authed({ url: buildUrl(server, path, query), signal });
    const failure = errorForStatus(response.status);
    if (failure) throw failure;
    return parseJson<T>(response);
  };

  const postSeries = async (path: string, page: number, statements: unknown[], sortField: number, ascending: boolean) => {
    const response = await authed({
      url: buildUrl(server, path, { PageNumber: Math.max(page, 1), PageSize: PAGE_SIZE }),
      method: "POST",
      json: {
        statements: [{ comparison: COMPARISON_CONTAINS, field: FIELD_FORMATS, value: IMAGE_FORMATS }, ...statements],
        combination: COMBINATION_AND,
        sortOptions: { sortField, isAscending: ascending },
        limitTo: 0,
      },
    });
    const failure = errorForStatus(response.status);
    if (failure) throw failure;
    const entries = parseJson<KavitaSeries[]>(response).map(mapSeriesStub);
    let totalPages = 0;
    try {
      totalPages = (JSON.parse(response.headers["pagination"] ?? "{}") as { totalPages?: number }).totalPages ?? 0;
    } catch {
      totalPages = 0;
    }
    // Without a pagination header a full page is the only sign there may be more.
    const hasNextPage = totalPages > 0 ? page < totalPages : entries.length >= PAGE_SIZE;
    return { entries, hasNextPage } satisfies MangaPageResult;
  };

  const coverUrl = (seriesId: number) => buildUrl(server, "/api/Image/series-cover", { seriesId });

  function mapSeriesStub(series: KavitaSeries): Manga {
    return {
      key: String(series.id),
      title: series.name,
      cover: coverUrl(series.id),
      url: buildUrl(server, `/library/${series.libraryId ?? 0}/series/${series.id}`),
    };
  }

  const volumeChapters = (volume: KavitaVolume): Chapter[] =>
    volume.chapters.map((chapter): Chapter => {
      // Kavita names a volume "Volume 1" in some responses and "1" in others; the
      // number is the stable part.
      const volumeLabel = hasNumber(volume.minNumber)
        ? String(volume.minNumber)
        : volume.name?.trim() || String(volume.number ?? "");
      const date = chapterTimestamp(chapter);
      const chapterNumber = hasNumber(chapter.minNumber) ? chapter.minNumber : undefined;
      const volumeNumber = hasNumber(volume.minNumber) ? volume.minNumber : undefined;
      return {
        key: String(chapter.id),
        title:
          chapter.titleName?.trim() ||
          (chapterNumber === undefined ? labels.volume(volumeLabel) : labels.chapter(String(chapterNumber))),
        // A volume without chapter numbers is ordered by its volume number.
        chapterNumber: chapterNumber ?? volumeNumber,
        ...(volumeNumber === undefined ? {} : { volumeNumber }),
        ...(date === undefined ? {} : { dateUploaded: date }),
      };
    });

  const looseChapter = (chapter: KavitaChapter, special: boolean): Chapter => {
    const date = chapterTimestamp(chapter);
    const number = hasNumber(chapter.minNumber) ? chapter.minNumber : undefined;
    return {
      key: String(chapter.id),
      title:
        chapter.titleName?.trim() ||
        (special ? chapter.title?.trim() || labels.special : number !== undefined ? labels.chapter(String(number)) : chapter.title?.trim() || labels.special),
      ...(number === undefined ? {} : { chapterNumber: number }),
      ...(date === undefined ? {} : { dateUploaded: date }),
    };
  };

  return {
    kind: "kavita",

    async testConnection(signal) {
      await ensureSession(true);
      await getJson<unknown[]>("/api/Library/libraries", {}, signal);
      return knownVersion ? { version: knownVersion } : {};
    },

    async getListings() {
      const libraries = (await getJson<KavitaLibrary[]>("/api/Library/libraries")).filter((library) =>
        IMAGE_LIBRARY_TYPES.has(library.type),
      );
      const fixed: Listing[] = [
        { id: LISTING_ALL, name: "All" },
        { id: LISTING_RECENT, name: "Recently added" },
        { id: LISTING_UPDATED, name: "Recently updated" },
      ];
      return libraries.length > 1
        ? [...fixed, ...libraries.map((library) => ({ id: `${LISTING_LIBRARY_PREFIX}${library.id}`, name: library.name }))]
        : fixed;
    },

    async getFilters(): Promise<Filter[]> {
      return [];
    },

    async getMangaListForListing(listing, page) {
      if (listing.id === LISTING_RECENT) return postSeries("/api/Series/all-v2", page, [], SORT_CREATED, false);
      if (listing.id === LISTING_UPDATED) return postSeries("/api/Series/all-v2", page, [], SORT_LAST_CHAPTER_ADDED, false);
      const libraryId = listing.id.startsWith(LISTING_LIBRARY_PREFIX)
        ? listing.id.slice(LISTING_LIBRARY_PREFIX.length)
        : undefined;
      return postSeries(
        "/api/Series/all-v2",
        page,
        libraryId ? [{ comparison: COMPARISON_EQUAL, field: FIELD_LIBRARIES, value: libraryId }] : [],
        SORT_NAME,
        true,
      );
    },

    async search(query, page) {
      const text = query?.trim();
      return postSeries(
        "/api/Series/all-v2",
        page,
        text ? [{ comparison: COMPARISON_MATCHES, field: FIELD_SERIES_NAME, value: text }] : [],
        SORT_NAME,
        true,
      );
    },

    async getMangaDetails(manga) {
      const [series, metadata] = await Promise.all([
        getJson<KavitaSeries>(`/api/Series/${encodeURIComponent(manga.key)}`),
        getJson<KavitaMetadata>("/api/Series/metadata", { seriesId: manga.key }),
      ]);
      const authors = names(metadata.writers);
      const artists = names([
        ...(metadata.pencillers ?? []),
        ...(metadata.inkers ?? []),
        ...(metadata.colorists ?? []),
        ...(metadata.coverArtists ?? []),
      ]);
      const summary = metadata.summary?.trim();
      return {
        ...mapSeriesStub(series),
        ...(authors.length ? { authors } : {}),
        ...(artists.length ? { artists } : {}),
        ...(summary ? { description: summary } : {}),
        tags: names([...(metadata.genres ?? []), ...(metadata.tags ?? [])]),
        status: STATUS[metadata.publicationStatus ?? -1] ?? 0,
        contentRating: contentRatingOf(metadata.ageRating),
      };
    },

    async getChapterList(manga) {
      const detail = await getJson<KavitaSeriesDetail>("/api/Series/series-detail", { seriesId: manga.key });
      const ordered: Chapter[] = [
        ...(detail.chapters ?? [])
          .slice()
          .sort((a, b) => (a.sortOrder ?? a.minNumber ?? 0) - (b.sortOrder ?? b.minNumber ?? 0))
          .map((chapter) => looseChapter(chapter, false)),
        ...(detail.volumes ?? [])
          .slice()
          .sort((a, b) => (a.minNumber ?? a.number ?? 0) - (b.minNumber ?? b.number ?? 0))
          .flatMap(volumeChapters),
        ...(detail.specials ?? []).map((chapter) => looseChapter(chapter, true)),
      ];
      return ordered.map((chapter, position) => ({ ...chapter, sourceOrder: position }));
    },

    async getPageList(_manga, chapter): Promise<SelfHostedPageRef[]> {
      const info = await getJson<KavitaChapterInfo>("/api/Reader/chapter-info", { chapterId: chapter.key });
      const pages = Number.isFinite(info.pages) ? Math.max(0, Math.floor(info.pages)) : 0;
      return Array.from({ length: pages }, (_, index) => ({
        index,
        url: buildUrl(server, "/api/Reader/image", { chapterId: chapter.key, page: index }),
      }));
    },

    async imageRequest(url) {
      const { imageKey } = await ensureSession();
      // Covers and pages both authenticate with a key in the query. It is added
      // here, per fetch, so no stored cover and no cached page list ever holds
      // it, and it is the same key every launch, so cached images stay valid
      // (a bearer token would change with each sign-in and orphan the cache).
      const isImage =
        url.startsWith(buildUrl(server, "/api/Reader/image")) || url.startsWith(buildUrl(server, "/api/Image/"));
      return {
        url: isImage ? `${url}${url.includes("?") ? "&" : "?"}apiKey=${encodeURIComponent(imageKey)}` : url,
        headers: {},
      };
    },

    isServerUrl(url) {
      return url === server || url.startsWith(`${server}/`);
    },

    dispose() {
      session = null;
    },
  };
}
