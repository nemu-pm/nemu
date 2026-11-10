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
 * - SIMPLE_LOGIN: the web login form (`/login.html`) sets a session cookie on
 *   its 303 redirect. That one request does not follow redirects, so native
 *   networking keeps the cookie in this server's own cookie scope (in memory,
 *   sent to this host only) for the API requests after it. Signed in again
 *   once when the session has expired (30 minutes idle by default).
 *
 * The mode is not readable before signing in, so it is found out: Basic first
 * (it is what BASIC_AUTH wants and the other modes ignore), then the `login`
 * mutation when the API answers Unauthorized, then the login form when a token
 * the server just issued is ignored (SIMPLE_LOGIN issues tokens but only
 * honours its session). `aboutServer` needs no login outside BASIC_AUTH, so
 * the connection test also runs a query that does.
 *
 * Images (`/api/v1/...`) take Basic too. Under a login mode the server accepts
 * it only with `opds=true`, which is added at fetch time; a stable header keeps
 * the image caches (keyed by URL and headers) valid across sign-ins. Page
 * images have that fallback in every release with UI_LOGIN; thumbnails only
 * since upstream #2482 (after v2.4.2366), so an older server gets the current
 * Bearer token for thumbnails instead. Under SIMPLE_LOGIN image requests also
 * carry the session cookie (same cookie scope), which lets an older server's
 * thumbnails through.
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
/** The web login form, relative to the server address (which carries any subpath). */
const LOGIN_FORM_PATH = "/login.html";

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

/** The login form's CSRF token (the server binds it to the session cookie it set with the form). */
function formCsrfToken(html: string): string | undefined {
  const input = html.match(/<input\b[^>]*\bname="csrf-token"[^>]*>/i)?.[0];
  return input?.match(/\bvalue="([^"]*)"/i)?.[1];
}

type AuthMode = "basic" | "token" | "session";
/** A sign-in: the headers it adds (none for a session, whose cookie native keeps). */
type Credential = { mode: AuthMode; serial: number; headers: Record<string, string>; renewAt: number };

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

  /**
   * "basic" until the API refuses it; then "token" (UI_LOGIN, a Bearer token);
   * then "session" (SIMPLE_LOGIN, a cookie) if the server ignores its tokens.
   */
  let mode: AuthMode = "basic";
  /** Whether a request has gone through with the current mode. */
  let confirmed = false;
  let detection: Promise<void> | null = null;
  /** The current sign-in; `serial` tells a refused one from a newer one. */
  let signedIn: Promise<Credential> | null = null;
  let serial = 0;
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

  async function signInWithToken(signal?: AbortSignal): Promise<Omit<Credential, "mode" | "serial">> {
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
    return { headers: { Authorization: `Bearer ${token}` }, renewAt };
  }

  /**
   * The web login form: GET it for the session cookie and CSRF token, POST
   * the login without following the redirect. Success is a 303 that sets the
   * signed-in session cookie; a refusal is the form again (200).
   */
  async function signInWithSession(signal?: AbortSignal): Promise<Omit<Credential, "mode" | "serial">> {
    const url = buildUrl(server, LOGIN_FORM_PATH);
    const accept = { Accept: "text/html" };
    const form = await transport({ url, headers: accept, followRedirects: false, signal });
    const formFailure = errorForStatus(form.status);
    if (formFailure) throw formFailure;
    const csrf = formCsrfToken(form.body);
    const response = await transport({
      url,
      method: "POST",
      headers: accept,
      form: { user: credentials.username ?? "", pass: credentials.password ?? "", ...(csrf ? { "csrf-token": csrf } : {}) },
      followRedirects: false,
      signal,
    });
    if (response.status >= 300 && response.status < 400) return { headers: {}, renewAt: Infinity };
    if (response.status === 200) throw new SelfHostedError("unauthorized", "The login was refused.");
    throw errorForStatus(response.status) ?? new SelfHostedError("invalid-response", `HTTP ${response.status}`, response.status);
  }

  /**
   * The current sign-in for `mode`, or a new one when there is none, it is
   * about to expire, or it is the one the server just refused (`refused`).
   * Requests that find out together share one sign-in.
   */
  async function credential(refused: number | null, signal?: AbortSignal): Promise<Credential> {
    const wanted = mode;
    // Another request may start a sign-in while this one waits: then wait for that one.
    while (signedIn) {
      const pending = signedIn;
      const current = await pending.catch(() => null);
      if (current && current.mode === wanted && current.serial !== refused && Date.now() < current.renewAt) {
        return current;
      }
      if (signedIn === pending) break;
    }
    const id = ++serial;
    const next = (wanted === "session" ? signInWithSession(signal) : signInWithToken(signal)).then(
      (signIn): Credential => ({ ...signIn, mode: wanted, serial: id }),
    );
    signedIn = next;
    next.catch(() => {
      if (signedIn === next) signedIn = null;
    });
    return next;
  }

  async function gql<T>(query: string, variables: Record<string, unknown> = {}, signal?: AbortSignal): Promise<T> {
    /** Sign-ins issued after this, during this request, are fresh. */
    const startSerial = serial;
    /** The sign-in the server refused, so that a new one is made. */
    let refused: number | null = null;
    // basic, token, token renewed, session, session renewed.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const used = mode;
      const signIn: Credential | null = used === "basic" ? null : await credential(refused, signal);
      const body = await post<T>(query, variables, signIn ? signIn.headers : basic, signal);
      const errors = body.errors ?? [];
      if (errors.length === 0 && body.data) {
        if (mode === used) confirmed = true;
        return body.data;
      }
      if (isUnauthorized(errors)) {
        if (!hasLogin) throw new SelfHostedError("login-required", "The server wants a login.");
        if (!signIn) {
          // Basic refused: the server is in a login mode.
          if (mode === "basic") {
            mode = "token";
            confirmed = false;
          }
          continue;
        }
        if (signIn.serial <= startSerial) {
          // An older sign-in: it expired or the server restarted. Sign in again.
          refused = signIn.serial;
          continue;
        }
        if (signIn.mode === "token") {
          // A token the server just issued is ignored only under SIMPLE_LOGIN,
          // which authenticates with its session cookie instead.
          if (mode === "token") {
            mode = "session";
            confirmed = false;
          }
          refused = null;
          continue;
        }
        throw new SelfHostedError("unauthorized", "The server refused the login.");
      }
      if (isForbidden(errors)) throw new SelfHostedError("forbidden", firstLine(errors[0]?.message));
      if (isSchemaMismatch(errors)) throw new SelfHostedError("outdated", firstLine(errors[0]?.message));
      throw new SelfHostedError("invalid-response", firstLine(errors[0]?.message) || "No data in the response.");
    }
    throw new SelfHostedError("unauthorized", "The server refused the login.");
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
        // The current sign-in: a Bearer token (a session adds no header, its cookie rides along).
        return { url, headers: { ...(await credential(null)).headers } };
      }
      return { url: withOpdsFlag(url), headers: { ...basic } };
    },
    isServerUrl: (url) => url === server || url.startsWith(`${server}/`),
    dispose() {
      signedIn = null;
      detection = null;
      thumbnailsTakeBasic = null;
    },
  };
}
