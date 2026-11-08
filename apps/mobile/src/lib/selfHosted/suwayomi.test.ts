import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createSuwayomiBackend, suwayomiAuthHeaders } from "./suwayomi";
import type { SelfHostedRequest, SelfHostedTransport } from "./http";

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
    await expect(denied.testConnection()).rejects.toMatchObject({ code: "unauthorized" });
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
