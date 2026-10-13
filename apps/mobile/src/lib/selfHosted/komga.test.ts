import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createKomgaBackend, komgaAuthHeaders } from "./komga";
import { SelfHostedError, type SelfHostedRequest, type SelfHostedTransport } from "./http";

const fixture = (name: string) => readFileSync(join(import.meta.dir, "fixtures/komga", name), "utf8");

const SERVER = "http://192.168.1.20:25600";

function replay(routes: Record<string, { status?: number; body: string }>) {
  const seen: SelfHostedRequest[] = [];
  const transport: SelfHostedTransport = async (request) => {
    seen.push(request);
    const route = routes[request.url];
    if (!route) return { status: 404, headers: {}, body: "{}" };
    return { status: route.status ?? 200, headers: {}, body: route.body };
  };
  return { transport, seen };
}

const routes = {
  [`${SERVER}/api/v2/users/me`]: { body: fixture("users-me.json") },
  [`${SERVER}/api/v1/libraries`]: { body: fixture("libraries.json") },
  [`${SERVER}/api/v1/series?sort=metadata.titleSort%2Casc&page=0&size=30`]: { body: fixture("series-page.json") },
  [`${SERVER}/api/v1/series?sort=metadata.titleSort%2Casc&search=beta&page=0&size=30`]: {
    body: fixture("series-search.json"),
  },
  [`${SERVER}/api/v1/series/latest?page=0&size=30`]: { body: fixture("series-latest.json") },
};

const series = JSON.parse(fixture("series-detail.json")) as { id: string };
const books = JSON.parse(fixture("series-books.json")) as { content: { id: string }[] };

describe("komga backend", () => {
  test("prefers the api key over basic credentials", () => {
    expect(komgaAuthHeaders({ apiKey: "K", username: "u", password: "p" })).toEqual({ "X-API-Key": "K" });
    expect(komgaAuthHeaders({ username: "reader", password: "pw" })).toEqual({
      Authorization: "Basic cmVhZGVyOnB3",
    });
    expect(komgaAuthHeaders({})).toEqual({});
  });

  test("tests the connection against the current-user endpoint and sends the login", async () => {
    const { transport, seen } = replay(routes);
    const backend = createKomgaBackend({ server: SERVER, credentials: { apiKey: "K" }, transport });
    await backend.testConnection();
    expect(seen[0]?.url).toBe(`${SERVER}/api/v2/users/me`);
    expect(seen[0]?.headers).toEqual({ "X-API-Key": "K" });
  });

  test("falls back to the v1 endpoint on servers without v2", async () => {
    const { transport } = replay({ [`${SERVER}/api/v1/users/me`]: { body: fixture("users-me.json") } });
    const backend = createKomgaBackend({ server: SERVER, credentials: {}, transport });
    await expect(backend.testConnection()).resolves.toEqual({});
  });

  test("reports bad credentials and non-komga servers distinctly", async () => {
    const unauthorized = createKomgaBackend({
      server: SERVER,
      credentials: {},
      transport: replay({ [`${SERVER}/api/v2/users/me`]: { status: 401, body: "{}" } }).transport,
    });
    await expect(unauthorized.testConnection()).rejects.toMatchObject({ code: "unauthorized" });

    const notKomga = createKomgaBackend({
      server: SERVER,
      credentials: {},
      transport: replay({ [`${SERVER}/api/v2/users/me`]: { body: '{"hello":"world"}' } }).transport,
    });
    await expect(notKomga.testConnection()).rejects.toMatchObject({ code: "invalid-response" });

    const html = createKomgaBackend({
      server: SERVER,
      credentials: {},
      transport: replay({ [`${SERVER}/api/v2/users/me`]: { body: "<html>" } }).transport,
    });
    await expect(html.testConnection()).rejects.toBeInstanceOf(SelfHostedError);

    const down = createKomgaBackend({
      server: SERVER,
      credentials: {},
      transport: async () => {
        throw new SelfHostedError("unreachable", "timeout");
      },
    });
    await expect(down.testConnection()).rejects.toMatchObject({ code: "unreachable" });
  });

  test("lists series as manga with covers, status and authors", async () => {
    const { transport } = replay(routes);
    const backend = createKomgaBackend({ server: SERVER, credentials: {}, transport });
    const all = await backend.getMangaListForListing({ id: "all", name: "All" }, 1);
    expect(all.hasNextPage).toBe(false);
    expect(all.entries.map((entry) => entry.title)).toEqual(["Alpha Series", "Beta Series"]);
    expect(all.entries[0]).toMatchObject({
      key: series.id,
      cover: `${SERVER}/api/v1/series/${series.id}/thumbnail`,
      status: 1,
    });
  });

  test("searches by title and lists the latest additions", async () => {
    const { transport } = replay(routes);
    const backend = createKomgaBackend({ server: SERVER, credentials: {}, transport });
    expect((await backend.search("beta", 1, [])).entries.length).toBeGreaterThan(0);
    expect((await backend.getMangaListForListing({ id: "latest", name: "Latest" }, 1)).entries.length).toBe(2);
  });

  test("offers libraries as listings only when there is a choice", async () => {
    const { transport } = replay(routes);
    const backend = createKomgaBackend({ server: SERVER, credentials: {}, transport });
    expect((await backend.getListings()).map((listing) => listing.id)).toEqual(["all", "latest", "new", "updated"]);

    const two = createKomgaBackend({
      server: SERVER,
      credentials: {},
      transport: replay({
        [`${SERVER}/api/v1/libraries`]: { body: JSON.stringify([{ id: "L1", name: "Manga" }, { id: "L2", name: "Comics" }]) },
      }).transport,
    });
    expect((await two.getListings()).map((listing) => listing.id)).toContain("library:L2");
  });

  test("maps books to chapters sorted by number", async () => {
    const { transport, seen } = replay({
      [`${SERVER}/api/v1/series/${series.id}/books?unpaged=true&sort=metadata.numberSort%2Casc`]: {
        body: fixture("series-books.json"),
      },
    });
    const backend = createKomgaBackend({ server: SERVER, credentials: {}, transport });
    const chapters = await backend.getChapterList({ key: series.id });
    expect(chapters.map((chapter) => chapter.chapterNumber)).toEqual([1, 2, 3]);
    expect(chapters[0]).toMatchObject({ key: books.content[0]!.id, title: "Alpha Series v01" });
    expect(typeof chapters[0]!.dateUploaded).toBe("number");
    expect(seen).toHaveLength(1);
  });

  test("serves pages in order and converts types the image loaders cannot decode", async () => {
    const bookId = books.content[0]!.id;
    const pages = JSON.parse(fixture("book-pages.json")) as { number: number; mediaType: string }[];
    pages[1]!.mediaType = "image/tiff";
    const { transport } = replay({
      [`${SERVER}/api/v1/books/${bookId}/pages`]: { body: JSON.stringify(pages) },
    });
    const backend = createKomgaBackend({ server: SERVER, credentials: { apiKey: "K" }, transport });
    const refs = await backend.getPageList({ key: series.id }, { key: bookId });
    expect(refs.map((ref) => ref.index)).toEqual(refs.map((_, i) => i));
    expect(refs[0]!.url).toBe(`${SERVER}/api/v1/books/${bookId}/pages/1`);
    expect(refs[1]!.url).toBe(`${SERVER}/api/v1/books/${bookId}/pages/2?convert=jpeg`);
    expect(await backend.imageRequest(refs[0]!.url)).toEqual({ url: refs[0]!.url, headers: { "X-API-Key": "K" } });
  });

  test("recognises only its own server's urls", () => {
    const backend = createKomgaBackend({ server: SERVER, credentials: {}, transport: replay({}).transport });
    expect(backend.isServerUrl(`${SERVER}/api/v1/series/1/thumbnail`)).toBe(true);
    expect(backend.isServerUrl("http://192.168.1.20:25601/api")).toBe(false);
    expect(backend.isServerUrl("http://192.168.1.20:25600.evil.test/x")).toBe(false);
  });
});
