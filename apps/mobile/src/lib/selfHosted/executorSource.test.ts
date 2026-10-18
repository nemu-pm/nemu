import { beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createSelfHostedExecutorSource, selfHostedCookieScope } from "./executorSource";
import { clearSelfHostedImageScopes, selfHostedImageCookieScope } from "./imageScopes";
import type { SelfHostedRequest, SelfHostedTransport } from "./http";

const fixture = (name: string) => readFileSync(join(import.meta.dir, "fixtures/komga", name), "utf8");
const SERVER = "http://192.168.1.20:25600";
const series = JSON.parse(fixture("series-detail.json")) as { id: string };
const book = (JSON.parse(fixture("series-books.json")) as { content: { id: string }[] }).content[0]!.id;

function transport(routes: Record<string, { status?: number; body: string }>) {
  const seen: SelfHostedRequest[] = [];
  const fn: SelfHostedTransport = async (request) => {
    seen.push(request);
    const route = routes[request.url];
    return route ? { status: route.status ?? 200, headers: {}, body: route.body } : { status: 404, headers: {}, body: "{}" };
  };
  return { fn, seen };
}

const base = (extra: Partial<Parameters<typeof createSelfHostedExecutorSource>[0]> = {}) => ({
  source: {
    registryId: "self-hosted",
    sourceId: "komga.home",
    hasAuthentication: true,
    selfHosted: { kind: "komga" as const, server: SERVER },
  },
  settings: { apiKey: "K" },
  executionScope: "profile-a",
  language: () => "en" as const,
  ...extra,
});

beforeEach(() => clearSelfHostedImageScopes());

describe("self-hosted executor source", () => {
  test("serves pages as plain urls with a stable per-page id", async () => {
    const t = transport({ [`${SERVER}/api/v1/books/${book}/pages`]: { body: fixture("book-pages.json") } });
    const source = createSelfHostedExecutorSource(base({ transport: t.fn }));
    const pages = await source.getPageList({ key: series.id }, { key: book });
    // The recorded server analyzed the book, so the page size comes along.
    expect(pages[0]).toEqual({
      index: 0, url: `${SERVER}/api/v1/books/${book}/pages/1`, id: `${book}:1`, width: 400, height: 600,
    });
    expect(pages.every((page) => !page.url?.includes("K"))).toBe(true);
  });

  test("decorates only its own server's images and records them for the scoped grant", async () => {
    const t = transport({});
    const source = createSelfHostedExecutorSource(base({ transport: t.fn }));
    const url = `${SERVER}/api/v1/books/${book}/pages/1`;
    const request = await source.modifyImageRequest(url);
    expect(request).toEqual({ url, headers: { "X-API-Key": "K" } });
    expect(selfHostedImageCookieScope(url)).toBe(selfHostedCookieScope("komga.home", "profile-a"));
    expect(selfHostedImageCookieScope(url)).toBe("profile-a::self-hosted:komga.home");

    const foreign = "http://192.168.1.20:25601/api/v1/books/x/pages/1";
    expect(await source.modifyImageRequest(foreign)).toEqual({ url: foreign, headers: {} });
    expect(selfHostedImageCookieScope(foreign)).toBeUndefined();
  });

  test("never grants a scope to a url the executor did not hand out", () => {
    expect(selfHostedImageCookieScope(`${SERVER}/api/v1/series/${series.id}/thumbnail`)).toBeUndefined();
  });

  test("reports a server synced without its login as needing sign-in, in the app language", async () => {
    const t = transport({});
    const english = createSelfHostedExecutorSource(base({ settings: {}, transport: t.fn }));
    await expect(english.getListings()).rejects.toMatchObject({ code: "unauthorized" });
    await expect(english.getListings()).rejects.toThrow("login isn't on this device");

    const chinese = createSelfHostedExecutorSource(base({ settings: {}, transport: t.fn, language: () => "zh" }));
    await expect(chinese.getListings()).rejects.toThrow("登录信息");
    expect(t.seen).toHaveLength(0);
  });

  test("a server that never had a login needs none", async () => {
    const t = transport({ [`${SERVER}/api/v1/libraries`]: { body: fixture("libraries.json") } });
    const source = createSelfHostedExecutorSource(
      base({ settings: {}, transport: t.fn, source: { ...base().source, hasAuthentication: false } }),
    );
    expect((await source.getListings()).length).toBeGreaterThan(0);
  });

  test("localizes server failures", async () => {
    const t = transport({ [`${SERVER}/api/v1/libraries`]: { status: 401, body: "{}" } });
    const source = createSelfHostedExecutorSource(base({ transport: t.fn, language: () => "zh" }));
    await expect(source.getListings()).rejects.toThrow("服务器不接受这个登录信息");
  });

  test("picks up a changed login without a new session", async () => {
    const t = transport({ [`${SERVER}/api/v1/libraries`]: { body: fixture("libraries.json") } });
    const source = createSelfHostedExecutorSource(base({ transport: t.fn }));
    await source.getListings();
    await source.updateSettings({ apiKey: "NEW" });
    await source.getListings();
    expect(t.seen.map((request) => request.headers?.["X-API-Key"])).toEqual(["K", "NEW"]);
  });

  test("a row without an address refuses to run", async () => {
    const source = createSelfHostedExecutorSource(base({ source: { registryId: "self-hosted", sourceId: "komga.x" } }));
    await expect(source.getListings()).rejects.toThrow("no address");
  });

  test("offers browsing and searching, and no home, login handler or image processor", async () => {
    const source = createSelfHostedExecutorSource(base({ transport: transport({}).fn }));
    expect(await source.hasListings()).toBe(true);
    expect(await source.hasHomeProvider()).toBe(false);
    expect(await source.handlesBasicLogin()).toBe(false);
    expect(await source.hasImageProcessor()).toBe(false);
  });
});
