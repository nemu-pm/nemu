import { afterEach, describe, expect, it, mock } from "bun:test";
import type { CacheStore } from "@/data/cache";
import type { InstalledSource } from "@/data/schema";
import { AidokuUrlRegistry, type InstalledSourceStore } from "./url-registry";

function createCacheStore(): CacheStore & { values: Map<string, unknown> } {
  const values = new Map<string, unknown>();

  return {
    values,
    async get(key) {
      const value = values.get(key);
      return value instanceof ArrayBuffer ? value : null;
    },
    async set(key, data) {
      values.set(key, data);
    },
    async getJson<T>(key: string) {
      return (values.get(key) as T | undefined) ?? null;
    },
    async setJson<T>(key: string, data: T) {
      values.set(key, data);
    },
    async delete(key) {
      values.delete(key);
    },
    async clear() {
      values.clear();
    },
  };
}

function createInstalledStore(savedSources?: InstalledSource[]): InstalledSourceStore {
  const values = new Map<string, InstalledSource>();

  return {
    async saveInstalledSource(source) {
      values.set(source.id, source);
      savedSources?.push(source);
    },
    async getInstalledSource(id) {
      return values.get(id) ?? null;
    },
  };
}

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("AidokuUrlRegistry", () => {
  it("saves install metadata that can sync to mobile", async () => {
    const savedSources: InstalledSource[] = [];
    const cache = createCacheStore();
    const registry = new AidokuUrlRegistry(
      "aidoku-community",
      "Aidoku Community",
      "https://example.test/index.min.json",
      createInstalledStore(savedSources),
      cache,
    );

    const aixBytes = new Uint8Array([1, 2, 3]).buffer;
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "https://example.test/index.min.json") {
        return new Response(
          JSON.stringify({
            sources: [
              {
                id: "en.example",
                name: "Example",
                version: 3,
                iconURL: "icons/example.png",
                downloadURL: "sources/example.aix",
                languages: ["en"],
                contentRating: 1,
              },
            ],
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      if (url === "https://example.test/sources/example.aix") {
        return new Response(aixBytes);
      }

      return new Response(null, { status: 404 });
    }) as unknown as typeof fetch;

    await registry.installSource("en.example");

    expect(savedSources[0]).toMatchObject({
      id: "aidoku-community:en.example",
      registryId: "aidoku-community",
      sourceKind: "aidoku",
      sourceId: "en.example",
      name: "Example",
      icon: "https://example.test/icons/example.png",
      languages: ["en"],
      contentRating: 1,
      downloadUrl: "https://example.test/sources/example.aix",
      version: 3,
    });
    expect(typeof savedSources[0]?.updatedAt).toBe("number");
    expect(new Uint8Array(cache.values.get("aix:aidoku-community:en.example") as ArrayBuffer)).toEqual(
      new Uint8Array(aixBytes),
    );
  });

  it("resolves relative registry assets while preserving absolute URLs", async () => {
    const fetchUrls: string[] = [];
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      const url = String(input);
      fetchUrls.push(url);

      if (url === "https://registry.example/root/index.min.json") {
        return new Response(
          JSON.stringify({
            sources: [
              {
                id: "absolute",
                name: "Absolute",
                version: 1,
                iconURL: "https://cdn.example/icons/absolute.png",
                downloadURL: "https://cdn.example/sources/absolute.aix",
                languages: ["ja"],
              },
              {
                id: "relative",
                name: "Relative",
                version: 2,
                iconURL: "icons/relative.png",
                downloadURL: "sources/relative.aix",
                languages: ["en"],
              },
            ],
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      return new Response(new Uint8Array([1, 2, 3]));
    }) as unknown as typeof fetch;

    const registry = new AidokuUrlRegistry(
      "test",
      "Test",
      "https://registry.example/root/index.min.json",
      createInstalledStore(),
      createCacheStore(),
    );

    const sources = await registry.listSources();
    expect(sources.find((source) => source.id === "absolute")?.icon).toBe(
      "https://cdn.example/icons/absolute.png",
    );
    expect(sources.find((source) => source.id === "relative")?.icon).toBe(
      "https://registry.example/root/icons/relative.png",
    );

    await registry.installSource("absolute");
    await registry.installSource("relative");

    expect(fetchUrls).toContain("https://cdn.example/sources/absolute.aix");
    expect(fetchUrls).toContain("https://registry.example/root/sources/relative.aix");
    expect(fetchUrls).not.toContain(
      "https://registry.example/root/https://cdn.example/sources/absolute.aix",
    );
  });
});
