import { afterEach, describe, expect, setSystemTime, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createSuwayomiBackend, jwtExpiry, suwayomiAuthHeaders } from "./suwayomi";
import { SelfHostedError, type SelfHostedErrorCode, type SelfHostedRequest, type SelfHostedTransport } from "./http";
import { selfHostedErrorMessage } from "./messages";
import { getMobileStrings } from "@/lib/mobileI18n";

const fixture = (name: string) => readFileSync(join(import.meta.dir, "fixtures/suwayomi", name), "utf8");
const SERVER = "http://192.168.1.20:4567";

function gqlServer(answer: (query: string) => string | { status: number; body: string }) {
  const seen: SelfHostedRequest[] = [];
  const transport: SelfHostedTransport = async (request) => {
    seen.push(request);
    const result = answer((request.json as { query: string }).query);
    return typeof result === "string"
      ? { status: 200, headers: {}, body: result }
      : { status: result.status, headers: {}, body: result.body };
  };
  return { transport, seen };
}

describe("suwayomi backend", () => {
  test("basic credentials only when a login is saved", () => {
    expect(suwayomiAuthHeaders({})).toEqual({});
    expect(suwayomiAuthHeaders({ username: "reader", password: "pw" })).toEqual({ Authorization: "Basic cmVhZGVyOnB3" });
  });

  test("tests the connection through aboutServer and rejects other servers", async () => {
    const ok = createSuwayomiBackend({ server: SERVER, credentials: {}, transport: gqlServer(() => fixture("about.json")).transport });
    await expect(ok.testConnection()).resolves.toEqual({ version: "v2.4.2366" });
    const other = createSuwayomiBackend({
      server: SERVER,
      credentials: {},
      transport: gqlServer(() => '{"data":{"aboutServer":{"name":"Other"}}}').transport,
    });
    await expect(other.testConnection()).rejects.toMatchObject({ code: "invalid-response" });
    const denied = createSuwayomiBackend({
      server: SERVER,
      credentials: {},
      transport: gqlServer(() => ({ status: 401, body: "" })).transport,
    });
    await expect(denied.testConnection()).rejects.toMatchObject({ code: "login-required" });
  });

  test("lists the library with absolute covers and sends the login", async () => {
    const { transport, seen } = gqlServer(() => fixture("library.json"));
    const backend = createSuwayomiBackend({ server: SERVER, credentials: { username: "a", password: "b" }, transport });
    const result = await backend.getMangaListForListing({ id: "library", name: "Library" }, 1);
    expect(result.entries).toEqual([
      expect.objectContaining({ key: "1", title: "Gamma", cover: `${SERVER}/api/v1/manga/1/thumbnail` }),
    ]);
    expect(result.hasNextPage).toBe(false);
    expect(seen[0]?.url).toBe(`${SERVER}/api/graphql`);
    expect(seen[0]?.headers?.Authorization).toStartWith("Basic ");
    expect((seen[0]?.json as { variables: { condition: unknown } }).variables.condition).toEqual({ inLibrary: true });
  });

  test("searches the whole catalogue by title", async () => {
    const { transport, seen } = gqlServer(() => fixture("library.json"));
    const backend = createSuwayomiBackend({ server: SERVER, credentials: {}, transport });
    await backend.search("gam", 2, []);
    const vars = (seen[0]?.json as { variables: { offset: number; condition: unknown; filter: unknown } }).variables;
    expect(vars.offset).toBe(30);
    expect(vars.condition).toBeNull();
    expect(vars.filter).toEqual({ title: { includesInsensitive: "gam" } });
  });

  test("maps details, chapters and pages", async () => {
    const chapters = JSON.parse(fixture("chapters.json")).data.fetchChapters.chapters;
    const { transport } = gqlServer((query) => {
      if (query.includes("fetchChapterPages")) return fixture("pages.json");
      if (query.includes("fetchChapters")) return fixture("chapters.json");
      if (query.includes("chapters(")) return '{"data":{"chapters":{"nodes":[]}}}';
      return fixture("manga.json");
    });
    const backend = createSuwayomiBackend({ server: SERVER, credentials: {}, transport });
    expect(await backend.getMangaDetails({ key: "1" })).toMatchObject({ title: "Gamma", status: 0 });
    const list = await backend.getChapterList({ key: "1" });
    expect(list.map((c) => c.title)).toEqual(chapters.map((c: { name: string }) => c.name));
    expect(list[0]).toMatchObject({ key: "1", chapterNumber: 1 });
    expect(typeof list[0]?.dateUploaded).toBe("number");
    const pages = await backend.getPageList({ key: "1" }, { key: "1" });
    expect(pages).toHaveLength(6);
    expect(pages[0]).toEqual({ index: 0, url: `${SERVER}/api/v1/manga/1/chapter/1/page/0` });
  });

  test("graphql errors surface as invalid responses", async () => {
    const backend = createSuwayomiBackend({
      server: SERVER,
      credentials: {},
      transport: gqlServer(() => '{"errors":[{"message":"boom"}]}').transport,
    });
    await expect(backend.getListings().then(() => backend.search("x", 1, []))).rejects.toMatchObject({ code: "invalid-response" });
  });
});

const LOGIN = { username: "reader", password: "p@ss wörd" };
const BASIC = suwayomiAuthHeaders(LOGIN).Authorization;

const base64Url = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
const makeJwt = (claims: Record<string, unknown>) => `${base64Url({ alg: "HS256" })}.${base64Url(claims)}.sig`;

/**
 * A Suwayomi server in one `authMode`, answering with responses recorded from
 * real servers (v2.4.2366, v2.4.2490): `aboutServer` is public except under
 * BASIC_AUTH, every other field wants a signed-in user, the `login` mutation
 * issues a JWT, and only UI_LOGIN accepts it. SIMPLE_LOGIN signs in through
 * `/login.html`: the GET starts a session and puts a CSRF token in the form,
 * the POST answers 303 and rotates the session id. The transport stands in
 * for native's per-server cookie jar: it holds the one session cookie, and
 * only a response that is not followed past keeps it.
 */
function suwayomiServer(
  mode: "none" | "basic_auth" | "simple_login" | "ui_login",
  { tokenSeconds = 300, thumbnailFallback = true, formPassword = LOGIN.password } = {},
) {
  const seen: SelfHostedRequest[] = [];
  const issued = new Map<string, number>();
  /** Server side: session id -> CSRF token and whether it is signed in. */
  const sessions = new Map<string, { csrf: string; signedIn: boolean }>();
  /** Client side: the session cookie the jar holds. */
  let cookie: string | undefined;
  let serial = 0;
  const reply = (body: string, status = 200) => ({ status, headers: {}, body });
  const transport: SelfHostedTransport = async (request) => {
    seen.push(request);
    const auth = request.headers?.Authorization;
    const basicValid = auth === BASIC;
    if (mode === "basic_auth" && !basicValid) return reply("Unauthorized", 401);
    const session = cookie === undefined ? undefined : sessions.get(cookie);
    const sessionValid = mode === "simple_login" && session?.signedIn === true;
    if (request.url === `${SERVER}/login.html`) {
      if (request.method === "POST") {
        const form = request.form ?? {};
        if (!session || form["csrf-token"] !== session.csrf) return reply("<form>expired</form>");
        if (form.user !== LOGIN.username || form.pass !== formPassword) return reply("<form>failed</form>");
        // `changeSessionId()`: the cookie on the redirect is the signed-in one.
        sessions.delete(cookie!);
        const rotated = `s${(serial += 1)}`;
        sessions.set(rotated, { csrf: "", signedIn: true });
        // A followed redirect would drop it, as native networking does.
        if (request.followRedirects === false) cookie = rotated;
        return { status: 303, headers: { location: "/" }, body: "" };
      }
      const csrf = `csrf${(serial += 1)}`;
      if (session) session.csrf = csrf;
      else {
        cookie = `s${(serial += 1)}`;
        sessions.set(cookie, { csrf, signedIn: false });
      }
      return reply(`<form method="POST"><input type="hidden" name="csrf-token" value="${csrf}"/></form>`);
    }
    if (request.url.includes("/api/v1/")) {
      const fallback = /[?&]opds=true/.test(request.url) && basicValid && (thumbnailFallback || !request.url.includes("/thumbnail"));
      const expiry = auth?.startsWith("Bearer ") ? issued.get(auth.slice(7)) : undefined;
      const bearer = mode === "ui_login" && expiry !== undefined && Date.now() < expiry;
      const allowed = mode === "none" || mode === "basic_auth" || fallback || bearer || sessionValid;
      return reply("", allowed ? 404 : 401);
    }
    const { query, variables } = request.json as { query: string; variables: { u?: string; p?: string } };
    if (query.includes("login(")) {
      if (mode === "none" || mode === "basic_auth") {
        return reply('{"errors":[{"message":"Exception while fetching data (/login) : Cannot login while already logged-in"}]}');
      }
      if (variables.u !== LOGIN.username || variables.p !== LOGIN.password) return reply(fixture("login-incorrect.json"));
      serial += 1;
      const exp = Math.floor(Date.now() / 1000) + tokenSeconds;
      const token = makeJwt({ iss: "suwayomi-server", token_type: "access", exp, n: serial });
      issued.set(token, exp * 1000);
      return reply(JSON.stringify({ data: { login: { accessToken: token } } }));
    }
    if (query.includes("aboutServer")) return reply(fixture("about.json"));
    const expiry = auth?.startsWith("Bearer ") ? issued.get(auth.slice(7)) : undefined;
    const signedIn =
      mode === "none" ||
      mode === "basic_auth" ||
      (mode === "ui_login" && expiry !== undefined && Date.now() < expiry) ||
      sessionValid;
    if (!signedIn) return reply(fixture("unauthorized.json"));
    if (query.includes("totalCount")) return reply('{"data":{"mangas":{"totalCount":1}}}');
    return reply(fixture("library.json"));
  };
  const graphql = () => seen.filter((r) => r.url.endsWith("/api/graphql"));
  const logins = () => graphql().filter((r) => (r.json as { query: string }).query.includes("login(")).length;
  const formLogins = () => seen.filter((r) => r.url.endsWith("/login.html") && r.method === "POST").length;
  /** A server restart: tokens and sessions are gone. */
  const forget = () => {
    issued.clear();
    sessions.clear();
  };
  return { transport, seen, graphql, logins, formLogins, forget };
}

describe("suwayomi auth modes", () => {
  afterEach(() => setSystemTime());

  const connect = (server: ReturnType<typeof suwayomiServer>, credentials = {}) =>
    createSuwayomiBackend({ server: SERVER, credentials, transport: server.transport });

  test("no authentication: no login needed, none sent", async () => {
    const server = suwayomiServer("none");
    const backend = connect(server);
    await expect(backend.testConnection()).resolves.toEqual({ version: "v2.4.2366" });
    expect(await backend.imageRequest(`${SERVER}/api/v1/manga/1/thumbnail`)).toEqual({
      url: `${SERVER}/api/v1/manga/1/thumbnail`,
      headers: {},
    });
  });

  test("basic auth: a missing or wrong login is told apart, images keep their URL", async () => {
    await expect(connect(suwayomiServer("basic_auth")).testConnection()).rejects.toMatchObject({ code: "login-required" });
    await expect(
      connect(suwayomiServer("basic_auth"), { ...LOGIN, password: "nope" }).testConnection(),
    ).rejects.toMatchObject({ code: "unauthorized" });
    const server = suwayomiServer("basic_auth");
    const backend = connect(server, LOGIN);
    await backend.testConnection();
    await backend.search("gam", 1, []);
    expect(server.logins()).toBe(0);
    expect(await backend.imageRequest(`${SERVER}/api/v1/manga/1/chapter/1/page/0`)).toEqual({
      url: `${SERVER}/api/v1/manga/1/chapter/1/page/0`,
      headers: { Authorization: BASIC },
    });
  });

  test("UI login: a public aboutServer no longer passes for a working login", async () => {
    // The old check stopped at aboutServer, so the source saved and every
    // later query failed as "not a Suwayomi server".
    await expect(connect(suwayomiServer("ui_login")).testConnection()).rejects.toMatchObject({ code: "login-required" });
    await expect(
      connect(suwayomiServer("ui_login"), { ...LOGIN, password: "nope" }).testConnection(),
    ).rejects.toMatchObject({ code: "unauthorized", message: "Incorrect username or password." });
  });

  test("UI login: signs in once and sends the token", async () => {
    const server = suwayomiServer("ui_login");
    const backend = connect(server, LOGIN);
    await expect(backend.testConnection()).resolves.toEqual({ version: "v2.4.2366" });
    const result = await backend.getMangaListForListing({ id: "library", name: "Library" }, 1);
    expect(result.entries.map((entry) => entry.title)).toEqual(["Gamma"]);
    await backend.search("gam", 1, []);
    expect(server.logins()).toBe(1);
    expect(server.graphql().at(-1)?.headers?.Authorization).toStartWith("Bearer ");
  });

  test("UI login: images take a stable Basic login with the server's opds flag", async () => {
    const server = suwayomiServer("ui_login");
    const backend = connect(server, LOGIN);
    const page = await backend.imageRequest(`${SERVER}/api/v1/manga/1/chapter/1/page/0`);
    expect(page).toEqual({ url: `${SERVER}/api/v1/manga/1/chapter/1/page/0?opds=true`, headers: { Authorization: BASIC } });
    const cover = await backend.imageRequest(`${SERVER}/api/v1/manga/1/thumbnail`);
    expect(cover).toEqual({ url: `${SERVER}/api/v1/manga/1/thumbnail?opds=true`, headers: { Authorization: BASIC } });
    // Unchanged across sign-ins, so cached images stay valid.
    server.forget();
    setSystemTime(new Date(Date.now() + 3_600_000));
    expect(await backend.imageRequest(`${SERVER}/api/v1/manga/1/thumbnail`)).toEqual(cover);
  });

  test("UI login: thumbnails of a server without the Basic fallback get the token", async () => {
    const server = suwayomiServer("ui_login", { thumbnailFallback: false });
    const backend = connect(server, LOGIN);
    const cover = await backend.imageRequest(`${SERVER}/api/v1/manga/1/thumbnail`);
    expect(cover.url).toBe(`${SERVER}/api/v1/manga/1/thumbnail`);
    expect(cover.headers.Authorization).toStartWith("Bearer ");
    const page = await backend.imageRequest(`${SERVER}/api/v1/manga/1/chapter/1/page/0`);
    expect(page.headers).toEqual({ Authorization: BASIC });
  });

  test("UI login: renews the token before it expires, and once when it is refused", async () => {
    const server = suwayomiServer("ui_login", { tokenSeconds: 300 });
    const backend = connect(server, LOGIN);
    await backend.testConnection();
    expect(server.logins()).toBe(1);
    setSystemTime(new Date(Date.now() + 290_000));
    await backend.search(null, 1, []);
    expect(server.logins()).toBe(2);
    const refused = server.graphql().filter((r) => r.headers?.Authorization?.startsWith("Bearer ")).length;
    // A server restart forgets its tokens: one refusal, one new sign-in, the query goes through.
    server.forget();
    await backend.search(null, 1, []);
    expect(server.logins()).toBe(3);
    expect(server.graphql().filter((r) => r.headers?.Authorization?.startsWith("Bearer ")).length).toBe(refused + 2);
  });

  test("UI login: requests that find out about it together sign in once", async () => {
    const server = suwayomiServer("ui_login");
    const backend = connect(server, LOGIN);
    await Promise.all([backend.search("a", 1, []), backend.search("b", 1, []), backend.search("c", 1, [])]);
    expect(server.logins()).toBe(1);
  });

  test("Simple Login: signs in through the login form and keeps its session", async () => {
    const server = suwayomiServer("simple_login");
    const backend = connect(server, LOGIN);
    await expect(backend.testConnection()).resolves.toEqual({ version: "v2.4.2366" });
    // Basic refused, then a token issued but ignored, then the form.
    expect(server.logins()).toBe(1);
    expect(server.formLogins()).toBe(1);
    const [form, post] = server.seen.filter((r) => r.url.endsWith("/login.html"));
    expect(form).toMatchObject({ url: `${SERVER}/login.html`, followRedirects: false });
    expect(post).toMatchObject({
      method: "POST",
      followRedirects: false,
      form: { user: LOGIN.username, pass: LOGIN.password, "csrf-token": expect.stringMatching(/^csrf/) },
    });
    // The form carries the login, never a header.
    expect(post?.headers?.Authorization).toBeUndefined();
    const result = await backend.getMangaListForListing({ id: "library", name: "Library" }, 1);
    expect(result.entries.map((entry) => entry.title)).toEqual(["Gamma"]);
    await backend.search("gam", 1, []);
    expect(server.formLogins()).toBe(1);
    // The session is the cookie: API requests carry no credential header.
    expect(server.graphql().at(-1)?.headers).toEqual({});
  });

  test("Simple Login: a wrong login is refused, by the token login or by the form", async () => {
    await expect(
      connect(suwayomiServer("simple_login"), { ...LOGIN, password: "nope" }).testConnection(),
    ).rejects.toMatchObject({ code: "unauthorized" });
    // The form compares with the server's settings, which can differ from its user table.
    await expect(
      connect(suwayomiServer("simple_login", { formPassword: "other" }), LOGIN).testConnection(),
    ).rejects.toMatchObject({ code: "unauthorized" });
    await expect(connect(suwayomiServer("simple_login")).testConnection()).rejects.toMatchObject({
      code: "login-required",
    });
  });

  test("Simple Login: signs in again once when the session has expired", async () => {
    const server = suwayomiServer("simple_login");
    const backend = connect(server, LOGIN);
    await backend.testConnection();
    server.forget();
    await expect(backend.search(null, 1, [])).resolves.toMatchObject({ entries: [expect.objectContaining({ title: "Gamma" })] });
    expect(server.formLogins()).toBe(2);
    expect(server.logins()).toBe(1);
  });

  test("Simple Login: requests that find out about it together sign in once", async () => {
    const server = suwayomiServer("simple_login");
    const backend = connect(server, LOGIN);
    await Promise.all([backend.search("a", 1, []), backend.search("b", 1, []), backend.search("c", 1, [])]);
    expect(server.formLogins()).toBe(1);
    expect(server.logins()).toBe(1);
  });

  test("Simple Login: images keep the stable Basic login, which the session also covers", async () => {
    for (const thumbnailFallback of [true, false]) {
      const server = suwayomiServer("simple_login", { thumbnailFallback });
      const backend = connect(server, LOGIN);
      const page = await backend.imageRequest(`${SERVER}/api/v1/manga/1/chapter/1/page/0`);
      expect(page).toEqual({ url: `${SERVER}/api/v1/manga/1/chapter/1/page/0?opds=true`, headers: { Authorization: BASIC } });
      // A server without upstream #2482 lets the thumbnail through on the session cookie.
      expect(await backend.imageRequest(`${SERVER}/api/v1/manga/1/thumbnail`)).toEqual({
        url: `${SERVER}/api/v1/manga/1/thumbnail?opds=true`,
        headers: { Authorization: BASIC },
      });
    }
  });

  test("a schema without the queries means an outdated server", async () => {
    const backend = createSuwayomiBackend({
      server: SERVER,
      credentials: {},
      transport: gqlServer(() => fixture("validation-error.json")).transport,
    });
    await expect(backend.testConnection()).rejects.toMatchObject({ code: "outdated" });
  });

  test("each failure has its own sentence", () => {
    const strings = getMobileStrings("en");
    const codes: SelfHostedErrorCode[] = ["login-required", "unauthorized", "outdated", "unreachable"];
    const sentences = codes.map((code) => selfHostedErrorMessage(new SelfHostedError(code), strings, "suwayomi"));
    expect(new Set(sentences).size).toBe(codes.length);
    expect(sentences[2]).toContain("Suwayomi");
  });

  test("reads a token's expiry", () => {
    expect(jwtExpiry(makeJwt({ exp: 1_794_305_500 }))).toBe(1_794_305_500_000);
    expect(jwtExpiry("not-a-jwt")).toBeNull();
    expect(jwtExpiry(makeJwt({ sub: "1" }))).toBeNull();
  });
});
