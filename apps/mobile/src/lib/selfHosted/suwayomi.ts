import type { Chapter, Filter, Listing, Manga, MangaPageResult } from "@/sources/aidokuContract";
import { decodeBase64 } from "@/lib/mobileBase64";
import type { SelfHostedBackend, SelfHostedPageRef } from "./backend";
import { SelfHostedError, basicAuthHeader, buildUrl, errorForStatus, parseJson, type SelfHostedTransport } from "./http";
import type { SelfHostedCredentials } from "./policy";

/**
 * Suwayomi backend, written against the server's GraphQL API (`/api/graphql`,
 * introspectable on a running server). The server's `authMode` decides the
 * login:
 *
 * - NONE: no login.
 * - BASIC_AUTH: HTTP Basic on every request.
 * - UI_LOGIN: the `login` mutation trades the username and password for a
 *   short-lived JWT (five minutes by default) sent as a Bearer token. It is
 *   kept in memory only and replaced by signing in again shortly before it
 *   expires, or once when the server rejects it.
 * - SIMPLE_LOGIN: a browser session cookie set by a redirecting form post,
 *   which native networking does not keep. Reported as unsupported.
 *
 * The mode is not readable before signing in, so it is found out: Basic first
 * (it is what BASIC_AUTH wants and the other modes ignore), then the `login`
 * mutation when the API answers Unauthorized. `aboutServer` needs no login
 * outside BASIC_AUTH, so the connection test also runs a query that does.
 *
 * Images (`/api/v1/...`) take Basic too. Under a login mode the server accepts
 * it only with `opds=true`, which is added at fetch time; a stable header keeps
 * the image caches (keyed by URL and headers) valid across sign-ins. Page
 * images have that fallback in every release with UI_LOGIN; thumbnails only
 * since upstream #2482 (after v2.4.2366), so an older server gets the current
 * Bearer token for thumbnails instead.
 */

const PAGE_SIZE = 30;
const LISTING_LIBRARY = "library";
const LISTING_ALL = "all";

type GqlManga = {
  id: number;
  title: string;
  author?: string | null;
  artist?: string | null;
  description?: string | null;
  genre?: string[] | null;
  status?: string | null;
  thumbnailUrl?: string | null;
};
type GqlChapter = {
  id: number;
  name: string;
  chapterNumber?: number | null;
  sourceOrder?: number | null;
  uploadDate?: string | number | null;
  scanlator?: string | null;
};

const STATUS: Record<string, 0 | 1 | 2 | 3 | 4> = {
  ONGOING: 1,
  COMPLETED: 2,
  LICENSED: 2,
  PUBLISHING_FINISHED: 2,
  CANCELLED: 3,
  ON_HIATUS: 4,
};

const MANGA_FIELDS = "id title author artist description genre status thumbnailUrl";

/** Needs a signed-in user in every auth mode, unlike `aboutServer`. */
const AUTH_PROBE = "{mangas(first:1,condition:{inLibrary:true}){totalCount}}";
const LOGIN = "mutation($u:String!,$p:String!){login(input:{username:$u,password:$p}){accessToken}}";
/** Sign in again this long before a token's own expiry (at most a quarter of its lifetime). */
const TOKEN_EXPIRY_MARGIN_MS = 30_000;

type GqlError = { message?: string; extensions?: { classification?: string } };
type GqlBody<T> = { data?: T | null; errors?: GqlError[] };

/** A GraphQL error's own words: the server wraps them and appends a Java stack trace. */
function firstLine(message: string | undefined): string {
  return (message ?? "")
    .split(/\r?\n/, 1)[0]!
    .replace(/^Exception while fetching data \([^)]*\) : /, "")
    .trim();
}

const isUnauthorized = (errors: GqlError[]) => errors.some((e) => /\bUnauthorized/.test(e.message ?? ""));
const isForbidden = (errors: GqlError[]) => errors.some((e) => /\bForbidden/.test(e.message ?? ""));
/** A query the server's schema does not have: a server older than this API. */
const isSchemaMismatch = (errors: GqlError[]) =>
  errors.some((e) => e.extensions?.classification === "ValidationError" || /^Validation error/.test(e.message ?? ""));

/** Expiry (ms since epoch) of a JWT, or null when it has none readable. */
export function jwtExpiry(token: string): number | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(new TextDecoder().decode(decodeBase64(base64))) as { exp?: unknown };
    return typeof claims.exp === "number" ? claims.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** `url` with `opds=true`, the flag under which image routes accept Basic in a login mode. */
function withOpdsFlag(url: string): string {
  if (/[?&]opds=/.test(url)) return url;
  const [base, hash] = url.split("#", 2) as [string, string | undefined];
  return `${base}${base.includes("?") ? "&" : "?"}opds=true${hash === undefined ? "" : `#${hash}`}`;
}

const isThumbnailUrl = (url: string) => /\/api\/v1\/manga\/\d+\/thumbnail(?:[?#]|$)/.test(url);

export type SuwayomiBackendOptions = {
  server: string;
  credentials: SelfHostedCredentials;
  transport: SelfHostedTransport;
};

export function suwayomiAuthHeaders(credentials: SelfHostedCredentials): Record<string, string> {
  if (credentials.username && credentials.password !== undefined) {
    return { Authorization: basicAuthHeader(credentials.username, credentials.password) };
  }
  return {};
}

export function createSuwayomiBackend(options: SuwayomiBackendOptions): SelfHostedBackend {
  const server = options.server.replace(/\/+$/, "");
  const { credentials, transport } = options;
  const basic = suwayomiAuthHeaders(credentials);
  const hasLogin = Object.keys(basic).length > 0;
  const absolute = (path: string | null | undefined) =>
    path ? (/^https?:\/\//i.test(path) ? path : buildUrl(server, path)) : undefined;

  /** "basic" until the API refuses it; then "login" (UI_LOGIN, a Bearer token). */
  let mode: "basic" | "login" = "basic";
  /** Whether a request has gone through with the current mode. */
  let confirmed = false;
  let detection: Promise<void> | null = null;
  let session: Promise<{ token: string; renewAt: number }> | null = null;
  let thumbnailsTakeBasic: Promise<boolean> | null = null;

  async function post<T>(
    query: string,
    variables: Record<string, unknown>,
    headers: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<GqlBody<T>> {
    const response = await transport({
      url: buildUrl(server, "/api/graphql"),
      method: "POST",
      headers,
      json: { query, variables },
      signal,
    });
    if (response.status === 401) {
      // BASIC_AUTH answers every request without a valid login with a 401.
      throw new SelfHostedError(hasLogin ? "unauthorized" : "login-required", "HTTP 401", 401);
    }
    const failure = errorForStatus(response.status);
    if (failure) throw failure;
    return parseJson<GqlBody<T>>(response);
  }

  async function signIn(signal?: AbortSignal): Promise<{ token: string; renewAt: number }> {
    const body = await post<{ login?: { accessToken?: string } }>(
      LOGIN,
      { u: credentials.username, p: credentials.password },
      {},
      signal,
    );
    const token = body.data?.login?.accessToken;
    if (typeof token !== "string" || !token) {
      // "Incorrect username or password." (or a server that is not in a login
      // mode at all, which would not have refused Basic in the first place).
      throw new SelfHostedError("unauthorized", firstLine(body.errors?.[0]?.message) || "The login was refused.");
    }
    const now = Date.now();
    const expiry = jwtExpiry(token);
    const renewAt = expiry === null ? Infinity : expiry - Math.min(TOKEN_EXPIRY_MARGIN_MS, (expiry - now) / 4);
    return { token, renewAt };
  }

  async function accessToken(fresh: boolean, signal?: AbortSignal): Promise<string> {
    if (!fresh && session) {
      const current = await session.catch(() => null);
      if (current && Date.now() < current.renewAt) return current.token;
    }
    const next = signIn(signal);
    session = next;
    next.catch(() => {
      if (session === next) session = null;
    });
    return (await next).token;
  }

  async function gql<T>(query: string, variables: Record<string, unknown> = {}, signal?: AbortSignal): Promise<T> {
    /** Set when the server refused a token: only then is a fresh one needed. */
    let tokenRefused = false;
    for (let attempt = 0; ; attempt += 1) {
      const bearer = mode === "login";
      const headers = bearer ? { Authorization: `Bearer ${await accessToken(tokenRefused, signal)}` } : basic;
      const body = await post<T>(query, variables, headers, signal);
      const errors = body.errors ?? [];
      if (errors.length === 0 && body.data) {
        confirmed = true;
        return body.data;
      }
      if (isUnauthorized(errors)) {
        if (!hasLogin) throw new SelfHostedError("login-required", "The server wants a login.");
        if (attempt === 0) {
          // Basic refused: the server is in a login mode. Or the token expired.
          if (bearer) tokenRefused = true;
          else confirmed = false;
          mode = "login";
          continue;
        }
        // A token the server just issued is ignored only under SIMPLE_LOGIN,
        // which authenticates with a browser session cookie instead.
        throw confirmed
          ? new SelfHostedError("unauthorized", "The server refused the login.")
          : new SelfHostedError("unsupported-login", "The server uses Simple Login.");
      }
      if (isForbidden(errors)) throw new SelfHostedError("forbidden", firstLine(errors[0]?.message));
      if (isSchemaMismatch(errors)) throw new SelfHostedError("outdated", firstLine(errors[0]?.message));
      throw new SelfHostedError("invalid-response", firstLine(errors[0]?.message) || "No data in the response.");
    }
  }

  /** Settles the auth mode once, before an image request needs to know it. */
  function detectMode(): Promise<void> {
    if (confirmed || !hasLogin) return Promise.resolve();
    if (!detection) {
      detection = gql(AUTH_PROBE).then(() => undefined);
      detection.catch(() => {
        detection = null;
      });
    }
    return detection;
  }

  /**
   * Whether thumbnails accept Basic with `opds=true` under a login mode
   * (upstream #2482). A thumbnail that does not exist answers 404 past the
   * auth check and 401 before it, so the probe downloads nothing.
   */
  function thumbnailFallback(): Promise<boolean> {
    if (!thumbnailsTakeBasic) {
      thumbnailsTakeBasic = transport({
        url: withOpdsFlag(buildUrl(server, "/api/v1/manga/0/thumbnail")),
        headers: basic,
      }).then((response) => response.status !== 401);
      thumbnailsTakeBasic.catch(() => {
        thumbnailsTakeBasic = null;
      });
    }
    return thumbnailsTakeBasic;
  }

  const mapManga = (m: GqlManga): Manga => ({
    key: String(m.id),
    title: m.title,
    cover: absolute(m.thumbnailUrl),
    ...(m.author ? { authors: [m.author] } : {}),
    ...(m.artist ? { artists: [m.artist] } : {}),
    ...(m.description?.trim() ? { description: m.description.trim() } : {}),
    tags: m.genre ?? [],
    status: STATUS[m.status ?? ""] ?? 0,
  });

  async function list(page: number, inLibrary: boolean, title?: string): Promise<MangaPageResult> {
    const data = await gql<{ mangas: { nodes: GqlManga[]; pageInfo: { hasNextPage: boolean } } }>(
      `query($first:Int!,$offset:Int!,$condition:MangaConditionInput,$filter:MangaFilterInput){
        mangas(first:$first,offset:$offset,condition:$condition,filter:$filter,orderBy:TITLE,orderByType:ASC){
          nodes{id title thumbnailUrl} pageInfo{hasNextPage}}}`,
      {
        first: PAGE_SIZE,
        offset: (Math.max(page, 1) - 1) * PAGE_SIZE,
        condition: inLibrary ? { inLibrary: true } : null,
        filter: title ? { title: { includesInsensitive: title } } : null,
      },
    );
    return { entries: data.mangas.nodes.map(mapManga), hasNextPage: data.mangas.pageInfo.hasNextPage };
  }

  const mapChapter = (c: GqlChapter, position: number): Chapter => {
    const uploaded = Number(c.uploadDate);
    return {
      key: String(c.id),
      title: c.name,
      ...(c.chapterNumber != null && c.chapterNumber >= 0 ? { chapterNumber: c.chapterNumber } : {}),
      ...(Number.isFinite(uploaded) && uploaded > 0 ? { dateUploaded: uploaded } : {}),
      ...(c.scanlator ? { scanlator: c.scanlator } : {}),
      sourceOrder: c.sourceOrder ?? position,
    };
  };

  return {
    kind: "suwayomi",

    async testConnection(signal) {
      const data = await gql<{ aboutServer?: { name?: string; version?: string } }>(
        "{aboutServer{name version}}",
        {},
        signal,
      );
      if (!data.aboutServer?.name?.toLowerCase().includes("suwayomi")) {
        throw new SelfHostedError("invalid-response", "This address does not look like a Suwayomi server.");
      }
      // aboutServer is public under the login modes: make sure the login works too.
      await gql(AUTH_PROBE, {}, signal);
      return data.aboutServer.version ? { version: data.aboutServer.version } : {};
    },

    async getListings(): Promise<Listing[]> {
      return [
        { id: LISTING_LIBRARY, name: "Library" },
        { id: LISTING_ALL, name: "All" },
      ];
    },
    async getFilters(): Promise<Filter[]> {
      return [];
    },
    getMangaListForListing: (listing, page) => list(page, listing.id !== LISTING_ALL),
    search: (query, page) => list(page, false, query?.trim() || undefined),

    async getMangaDetails(manga) {
      const data = await gql<{ manga: GqlManga }>(`query($id:Int!){manga(id:$id){${MANGA_FIELDS}}}`, {
        id: Number(manga.key),
      });
      return { ...mapManga(data.manga), url: buildUrl(server, `/manga/${manga.key}`) };
    },

    async getChapterList(manga) {
      const id = Number(manga.key);
      const read = () =>
        gql<{ chapters: { nodes: GqlChapter[] } }>(
          `query($id:Int!){chapters(condition:{mangaId:$id},orderBy:SOURCE_ORDER,orderByType:ASC){
            nodes{id name chapterNumber sourceOrder uploadDate scanlator}}}`,
          { id },
        ).then((data) => data.chapters.nodes);
      let nodes = await read();
      if (nodes.length === 0) {
        // Never fetched from the source yet.
        nodes = (
          await gql<{ fetchChapters: { chapters: GqlChapter[] } }>(
            `mutation($id:Int!){fetchChapters(input:{mangaId:$id}){chapters{id name chapterNumber sourceOrder uploadDate scanlator}}}`,
            { id },
          )
        ).fetchChapters.chapters;
      }
      return nodes.map(mapChapter);
    },

    async getPageList(_manga, chapter): Promise<SelfHostedPageRef[]> {
      const data = await gql<{ fetchChapterPages: { pages: string[] } }>(
        `mutation($id:Int!){fetchChapterPages(input:{chapterId:$id}){pages}}`,
        { id: Number(chapter.key) },
      );
      return data.fetchChapterPages.pages.map((path, index) => ({ index, url: absolute(path)! }));
    },

    async imageRequest(url) {
      if (!hasLogin) return { url, headers: {} };
      await detectMode().catch(() => undefined);
      if (mode === "basic") return { url, headers: { ...basic } };
      if (isThumbnailUrl(url) && !(await thumbnailFallback().catch(() => false))) {
        return { url, headers: { Authorization: `Bearer ${await accessToken(false)}` } };
      }
      return { url: withOpdsFlag(url), headers: { ...basic } };
    },
    isServerUrl: (url) => url === server || url.startsWith(`${server}/`),
    dispose() {
      session = null;
      detection = null;
      thumbnailsTakeBasic = null;
    },
  };
}
