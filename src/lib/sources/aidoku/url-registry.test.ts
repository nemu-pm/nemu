import { afterEach, describe, expect, it, mock } from "bun:test";
import type { CacheStore } from "@/data/cache";
import type { InstalledSource } from "@/data/schema";
import { AidokuUrlRegistry, type InstalledSourceStore } from "./url-registry";

function createCacheStore(): CacheStore {
  const values = new Map<string, unknown>();

  return {
    async get(key) {
      return (values.get(key) as ArrayBuffer | undefined) ?? null;
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

function createInstalledStore(): InstalledSourceStore {
  const values = new Map<string, InstalledSource>();

  return {
    async saveInstalledSource(source) {
      values.set(source.id, source);
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
          { headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response(new Uint8Array([1, 2, 3]));
    }) as unknown as typeof fetch;

    const registry = new AidokuUrlRegistry(
      "test",
      "Test",
      "https://registry.example/root/index.min.json",
      createInstalledStore(),
      createCacheStore()
    );

    const sources = await registry.listSources();
    expect(sources.find((source) => source.id === "absolute")?.icon).toBe(
      "https://cdn.example/icons/absolute.png"
    );
    expect(sources.find((source) => source.id === "relative")?.icon).toBe(
      "https://registry.example/root/icons/relative.png"
    );

    await registry.installSource("absolute");
    await registry.installSource("relative");

    expect(fetchUrls).toContain("https://cdn.example/sources/absolute.aix");
    expect(fetchUrls).toContain("https://registry.example/root/sources/relative.aix");
    expect(fetchUrls).not.toContain(
      "https://registry.example/root/https://cdn.example/sources/absolute.aix"
    );
  });
});
