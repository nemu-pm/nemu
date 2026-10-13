import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createKavitaBackend } from "./kavita";
import type { SelfHostedRequest, SelfHostedResponse, SelfHostedTransport } from "./http";

const fixture = (name: string) => readFileSync(join(import.meta.dir, "fixtures/kavita", name), "utf8");

const SERVER = "http://192.168.1.20:5100";

type Route = (request: SelfHostedRequest) => SelfHostedResponse;

const ok = (body: string, headers: Record<string, string> = {}): SelfHostedResponse => ({ status: 200, headers, body });

function server(routes: Record<string, Route>) {
  const seen: SelfHostedRequest[] = [];
  const transport: SelfHostedTransport = async (request) => {
    seen.push(request);
    const key = `${request.method ?? "GET"} ${request.url.replace(SERVER, "")}`;
    const route = routes[key];
    if (!route) return { status: 404, headers: {}, body: "{}" };
    return route(request);
  };
  return { transport, seen };
}

const authenticate = `POST /api/Plugin/authenticate?apiKey=KEY&pluginName=nemu`;
const baseRoutes: Record<string, Route> = {
  [authenticate]: () => ok(fixture("login.json")),
  "POST /api/Account/login": () => ok(fixture("login.json")),
  "GET /api/Library/libraries": () => ok(fixture("libraries.json")),
};

describe("kavita backend", () => {
  test("exchanges an api key for a session and verifies it by listing libraries", async () => {
    const { transport, seen } = server(baseRoutes);
    const backend = createKavitaBackend({ server: SERVER, credentials: { apiKey: "KEY" }, transport });
    await expect(backend.testConnection()).resolves.toEqual({ version: "0.9.1.4" });
    expect(seen[0]?.url).toBe(`${SERVER}/api/Plugin/authenticate?apiKey=KEY&pluginName=nemu`);
    expect(seen[1]?.headers?.Authorization).toBe("Bearer TEST-JWT");
  });

  test("signs in with a username and password", async () => {
    const { transport, seen } = server(baseRoutes);
    const backend = createKavitaBackend({
      server: SERVER,
      credentials: { username: "reader", password: "pw" },
      transport,
    });
    await backend.testConnection();
    expect(seen[0]?.json).toEqual({ username: "reader", password: "pw" });
  });

  test("reports a wrong login, a missing login and a server that is not Kavita", async () => {
    const wrong = createKavitaBackend({
      server: SERVER,
      credentials: { apiKey: "KEY" },
      transport: server({ [authenticate]: () => ({ status: 401, headers: {}, body: "{}" }) }).transport,
    });
    await expect(wrong.testConnection()).rejects.toMatchObject({ code: "unauthorized" });

    const none = createKavitaBackend({ server: SERVER, credentials: {}, transport: server({}).transport });
    await expect(none.testConnection()).rejects.toMatchObject({ code: "unauthorized" });

    const other = createKavitaBackend({ server: SERVER, credentials: { apiKey: "KEY" }, transport: server({}).transport });
    await expect(other.testConnection()).rejects.toMatchObject({ code: "invalid-response" });
  });

  test("signs in again once when the session is rejected", async () => {
    let logins = 0;
    let first = true;
    const { transport } = server({
      [authenticate]: () => {
        logins += 1;
        return ok(fixture("login.json"));
      },
      "GET /api/Library/libraries": () => {
        if (first) {
          first = false;
          return { status: 401, headers: {}, body: "{}" };
        }
        return ok(fixture("libraries.json"));
      },
    });
    const backend = createKavitaBackend({ server: SERVER, credentials: { apiKey: "KEY" }, transport });
    await backend.getListings();
    expect(logins).toBe(2);
  });

  test("gives up when a fresh session is rejected too", async () => {
    const { transport } = server({
      [authenticate]: () => ok(fixture("login.json")),
      "GET /api/Library/libraries": () => ({ status: 401, headers: {}, body: "{}" }),
    });
    const backend = createKavitaBackend({ server: SERVER, credentials: { apiKey: "KEY" }, transport });
    await expect(backend.getListings()).rejects.toMatchObject({ code: "unauthorized" });
  });

  test("lists series with pagination from the response header and image-format filter", async () => {
    const { transport, seen } = server({
      ...baseRoutes,
      "POST /api/Series/all-v2?PageNumber=1&PageSize=30": () =>
        ok(fixture("series-all.json"), { pagination: '{"currentPage":1,"itemsPerPage":30,"totalItems":40,"totalPages":2}' }),
    });
    const backend = createKavitaBackend({ server: SERVER, credentials: { apiKey: "KEY" }, transport });
    const result = await backend.getMangaListForListing({ id: "all", name: "All" }, 1);
    expect(result.hasNextPage).toBe(true);
    expect(result.entries.map((entry) => entry.title)).toEqual(["Alpha Series", "Beta Series"]);
    expect(result.entries[0]?.cover).toBe(`${SERVER}/api/Image/series-cover?seriesId=1`);
    const body = seen.at(-1)?.json as { statements: { field: number; value: string }[] };
    expect(body.statements[0]).toMatchObject({ field: 21, value: "0,1" });
  });

  test("searches by series name", async () => {
    const { transport, seen } = server({
      ...baseRoutes,
      "POST /api/Series/all-v2?PageNumber=1&PageSize=30": () => ok(fixture("series-search.json")),
    });
    const backend = createKavitaBackend({ server: SERVER, credentials: { apiKey: "KEY" }, transport });
    const result = await backend.search("beta", 1, []);
    expect(result.hasNextPage).toBe(false);
    const body = seen.at(-1)?.json as { statements: { field: number; comparison: number; value: string }[] };
    expect(body.statements[1]).toEqual({ comparison: 7, field: 1, value: "beta" });
  });

  test("maps volumes to chapters in reading order with page counts known from chapter info", async () => {
    const { transport } = server({
      ...baseRoutes,
      "GET /api/Series/series-detail?seriesId=1": () => ok(fixture("series-detail.json")),
      "GET /api/Reader/chapter-info?chapterId=1": () => ok(fixture("chapter-info.json")),
    });
    const backend = createKavitaBackend({ server: SERVER, credentials: { apiKey: "KEY" }, transport });
    const chapters = await backend.getChapterList({ key: "1" });
    expect(chapters.map((chapter) => chapter.title)).toEqual(["Volume 1", "Volume 2", "Volume 3"]);
    expect(chapters.map((chapter) => chapter.chapterNumber)).toEqual([1, 2, 3]);
    expect(chapters.map((chapter) => chapter.volumeNumber)).toEqual([1, 2, 3]);
    expect(typeof chapters[0]?.dateUploaded).toBe("number");

    const pages = await backend.getPageList({ key: "1" }, { key: "1" });
    expect(pages).toHaveLength(6);
    expect(pages[0]).toEqual({ index: 0, url: `${SERVER}/api/Reader/image?chapterId=1&page=0` });
    expect(pages[5]?.url).toBe(`${SERVER}/api/Reader/image?chapterId=1&page=5`);
  });

  test("keeps the image key out of stored urls and adds it only to the fetched image request", async () => {
    const { transport } = server(baseRoutes);
    const backend = createKavitaBackend({ server: SERVER, credentials: { apiKey: "KEY" }, transport });

    const page = await backend.imageRequest(`${SERVER}/api/Reader/image?chapterId=1&page=0`);
    expect(page.url).toBe(`${SERVER}/api/Reader/image?chapterId=1&page=0&apiKey=KEY`);
    expect(page.headers).toEqual({});

    const coverUrl = `${SERVER}/api/Image/series-cover?seriesId=1`;
    const cover = await backend.imageRequest(coverUrl);
    expect(cover.url).toBe(`${coverUrl}&apiKey=KEY`);
    // The stored cover url is untouched, so a synced library never holds the key.
    expect(coverUrl).not.toContain("KEY");

    // Anything else of the server is passed through untouched.
    const other = `${SERVER}/api/Series/1`;
    expect((await backend.imageRequest(other)).url).toBe(other);
  });

  test("the image request is identical on every sign-in, so cached images stay valid", async () => {
    const first = createKavitaBackend({ server: SERVER, credentials: { apiKey: "KEY" }, transport: server(baseRoutes).transport });
    const second = createKavitaBackend({ server: SERVER, credentials: { apiKey: "KEY" }, transport: server(baseRoutes).transport });
    const url = `${SERVER}/api/Image/series-cover?seriesId=1`;
    expect(await first.imageRequest(url)).toEqual(await second.imageRequest(url));
  });

  test("uses the account's image-only key for pages after a password login", async () => {
    const { transport } = server(baseRoutes);
    const backend = createKavitaBackend({
      server: SERVER,
      credentials: { username: "reader", password: "pw" },
      transport,
    });
    const page = await backend.imageRequest(`${SERVER}/api/Reader/image?chapterId=2&page=1`);
    expect(page.url.endsWith("&apiKey=TEST-IMAGE-KEY")).toBe(true);
  });

  test("describes series details", async () => {
    const { transport } = server({
      ...baseRoutes,
      "GET /api/Series/1": () => ok(fixture("series.json")),
      "GET /api/Series/metadata?seriesId=1": () => ok(fixture("series-metadata.json")),
    });
    const backend = createKavitaBackend({ server: SERVER, credentials: { apiKey: "KEY" }, transport });
    const details = await backend.getMangaDetails({ key: "1" });
    expect(details).toMatchObject({ key: "1", title: "Alpha Series", status: 1, contentRating: 0 });
  });

  test("lists only image libraries as separate listings", async () => {
    const libraries = JSON.stringify([
      { id: 1, name: "Manga", type: 0 },
      { id: 2, name: "Novels", type: 4 },
      { id: 3, name: "Comics", type: 1 },
    ]);
    const { transport } = server({ ...baseRoutes, "GET /api/Library/libraries": () => ok(libraries) });
    const backend = createKavitaBackend({ server: SERVER, credentials: { apiKey: "KEY" }, transport });
    expect((await backend.getListings()).map((listing) => listing.id)).toEqual([
      "all",
      "recent",
      "updated",
      "library:1",
      "library:3",
    ]);
  });
});
