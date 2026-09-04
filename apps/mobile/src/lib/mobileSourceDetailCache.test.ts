import { describe, expect, test } from "bun:test";
import {
  createMobileSourceDetailCache,
  decodeMobileSourceDetailCache,
  encodeMobileSourceDetailCache,
  makeMobileSourceDetailCacheKey,
  MOBILE_SOURCE_DETAIL_CACHE_MAX_ENTRIES,
  MOBILE_SOURCE_DETAIL_CACHE_TTL_MS,
  type MobileSourceDetailCachePayload,
  type MobileSourceDetailCacheStore,
} from "./mobileSourceDetailCacheCore";

function payload(
  overrides: Partial<MobileSourceDetailCachePayload> = {},
): MobileSourceDetailCachePayload {
  return {
    metadata: { title: "Example Manga", authors: ["Author"] },
    chapters: [
      { id: "ch-2", chapterNumber: 2 },
      { id: "ch-1", chapterNumber: 1 },
    ],
    fetchedAt: 1_000,
    ...overrides,
  };
}

function memoryStore(files = new Map<string, string>()) {
  const counts = { readAll: 0, read: 0, write: 0, remove: 0 };
  const store: MobileSourceDetailCacheStore = {
    async readAll() {
      counts.readAll += 1;
      return [...files.values()];
    },
    async read(key) {
      counts.read += 1;
      return files.get(key) ?? null;
    },
    async write(key, raw) {
      counts.write += 1;
      files.set(key, raw);
    },
    async remove(key) {
      counts.remove += 1;
      files.delete(key);
    },
  };
  return { files, store, counts };
}

/** Let the deferred (post-paint) hydration timer run to completion. */
async function flushDeferredHydration(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("mobile source detail cache key", () => {
  test("reuses the established source-key shape", () => {
    expect(
      makeMobileSourceDetailCacheKey("aidoku-community", "en.example", "manga"),
    ).toBe("aidoku-community:en.example:manga");
  });
});

describe("mobile source detail cache codec", () => {
  test("round-trips a detail payload", () => {
    const key = makeMobileSourceDetailCacheKey("a", "b", "c");
    const raw = encodeMobileSourceDetailCache(key, payload());
    expect(decodeMobileSourceDetailCache(raw, 2_000)).toEqual({
      key,
      ...payload(),
    });
  });

  test("rejects invalid JSON and unknown versions", () => {
    expect(decodeMobileSourceDetailCache("{not json")).toBeNull();
    expect(
      decodeMobileSourceDetailCache(JSON.stringify({ v: 99, ...payload() })),
    ).toBeNull();
  });

  test("rejects malformed metadata and chapters", () => {
    const base = { v: 1, key: "a:b:c" };
    expect(
      decodeMobileSourceDetailCache(
        JSON.stringify({ ...base, ...payload(), metadata: { title: "" } }),
      ),
    ).toBeNull();
    expect(
      decodeMobileSourceDetailCache(
        JSON.stringify({ ...base, ...payload(), metadata: "junk" }),
      ),
    ).toBeNull();
    expect(
      decodeMobileSourceDetailCache(
        JSON.stringify({
          ...base,
          ...payload(),
          chapters: [{ id: "ok" }, { title: "missing id" }],
        }),
      ),
    ).toBeNull();
  });

  test("rejects future fetchedAt", () => {
    const key = makeMobileSourceDetailCacheKey("a", "b", "c");
    const raw = encodeMobileSourceDetailCache(key, payload());
    expect(decodeMobileSourceDetailCache(raw, 999)).toBeNull();
    expect(decodeMobileSourceDetailCache(raw, 1_000)).not.toBeNull();
  });
});

describe("mobile source detail cache behavior", () => {
  test("misses return null and hits report age and staleness", async () => {
    const cache = createMobileSourceDetailCache(memoryStore().store);
    const key = makeMobileSourceDetailCacheKey("a", "b", "c");
    expect(await cache.getCached(key)).toBeNull();
    await cache.setCached(key, payload(), 1_000);
    expect(await cache.getCached(key, 1_000 + 60_000)).toEqual({
      payload: payload(),
      ageMs: 60_000,
      isStale: false,
    });
    expect(await cache.getCached(key, 1_000 + MOBILE_SOURCE_DETAIL_CACHE_TTL_MS + 1)).toEqual({
      payload: payload(),
      ageMs: MOBILE_SOURCE_DETAIL_CACHE_TTL_MS + 1,
      isStale: true,
    });
  });

  test("clear(key) removes one entry and clear() removes everything", async () => {
    const { files, store } = memoryStore();
    const cache = createMobileSourceDetailCache(store);
    const first = makeMobileSourceDetailCacheKey("a", "b", "one");
    const second = makeMobileSourceDetailCacheKey("a", "b", "two");
    await cache.setCached(first, payload(), 1_000);
    await cache.setCached(second, payload(), 1_000);
    await cache.clear(first);
    expect(await cache.getCached(first)).toBeNull();
    expect(await cache.getCached(second)).not.toBeNull();
    await cache.clear();
    expect(await cache.getCached(second)).toBeNull();
    expect(files.size).toBe(0);
  });

  test("clearForSource removes only that source's entries", async () => {
    const { files, store } = memoryStore();
    const cache = createMobileSourceDetailCache(store);
    const kept = makeMobileSourceDetailCacheKey("a", "b", "one");
    const removed = makeMobileSourceDetailCacheKey("x", "y", "two");
    await cache.setCached(kept, payload(), 1_000);
    await cache.setCached(removed, payload(), 1_000);
    await cache.clearForSource("x:y");
    expect(await cache.getCached(removed)).toBeNull();
    expect(await cache.getCached(kept)).not.toBeNull();
    expect(files.has(removed)).toBe(false);
  });

  test("evicts the least recently read entry beyond the LRU cap", async () => {
    const { files, store } = memoryStore();
    const cache = createMobileSourceDetailCache(store);
    const keys = Array.from(
      { length: MOBILE_SOURCE_DETAIL_CACHE_MAX_ENTRIES + 1 },
      (_, index) =>
        makeMobileSourceDetailCacheKey("a", "b", `manga-${index}`),
    );
    for (const [index, key] of keys.entries()) {
      await cache.setCached(key, payload(), 1_000 + index);
    }
    expect(await cache.getCached(keys[0])).toBeNull();
    expect(await cache.getCached(keys[keys.length - 1])).not.toBeNull();
    expect(files.has(keys[0])).toBe(false);
    expect(files.size).toBe(MOBILE_SOURCE_DETAIL_CACHE_MAX_ENTRIES);
  });

  test("reading an entry keeps it alive over newer inserts", async () => {
    const { store } = memoryStore();
    const cache = createMobileSourceDetailCache(store);
    const keys = Array.from(
      { length: MOBILE_SOURCE_DETAIL_CACHE_MAX_ENTRIES },
      (_, index) => makeMobileSourceDetailCacheKey("a", "b", `manga-${index}`),
    );
    for (const [index, key] of keys.entries()) {
      await cache.setCached(key, payload(), 1_000 + index);
    }
    await cache.getCached(keys[0], 5_000);
    await cache.setCached(
      makeMobileSourceDetailCacheKey("a", "b", "manga-new"),
      payload(),
      6_000,
    );
    expect(await cache.getCached(keys[0])).not.toBeNull();
    expect(await cache.getCached(keys[1])).toBeNull();
  });

  test("hydrates valid entries from storage, skipping corrupt ones", async () => {
    const { store } = memoryStore();
    const seed = createMobileSourceDetailCache(store);
    const key = makeMobileSourceDetailCacheKey("a", "b", "c");
    await seed.setCached(key, payload(), 1_000);
    const storeWithJunk: MobileSourceDetailCacheStore = {
      async readAll() {
        return [...(await store.readAll()), "{not json", JSON.stringify({ v: 1 })];
      },
      write: store.write,
      remove: store.remove,
    };
    const rehydrated = createMobileSourceDetailCache(storeWithJunk);
    expect(await rehydrated.getCached(key, 2_000)).toEqual({
      payload: payload(),
      ageMs: 1_000,
      isStale: false,
    });
  });

  test("storage failures never throw and degrade to memory-only", async () => {
    const failingStore: MobileSourceDetailCacheStore = {
      async readAll() {
        throw new Error("storage unavailable");
      },
      async write() {
        throw new Error("write failed");
      },
      async remove() {
        throw new Error("remove failed");
      },
    };
    const cache = createMobileSourceDetailCache(failingStore);
    const key = makeMobileSourceDetailCacheKey("a", "b", "c");
    await cache.setCached(key, payload(), 1_000);
    expect(await cache.getCached(key, 2_000)).toEqual({
      payload: payload(),
      ageMs: 1_000,
      isStale: false,
    });
    await cache.clear();
    await cache.clearForSource("a:b");
    expect(await cache.getCached(key)).toBeNull();
  });

  test("rejects payloads that cannot survive a serialization round-trip", async () => {
    const { files, store } = memoryStore();
    const cache = createMobileSourceDetailCache(store);
    const key = makeMobileSourceDetailCacheKey("a", "b", "c");
    await cache.setCached(
      key,
      payload({ metadata: { title: "ok", authors: [1 as unknown as string] } }),
      1_000,
    );
    await cache.setCached(key, payload({ fetchedAt: Number.NaN }), 1_000);
    expect(await cache.getCached(key)).toBeNull();
    expect(files.size).toBe(0);
  });
});

describe("mobile source detail cache cold-read cost", () => {
  async function seedFiles(count: number) {
    const files = new Map<string, string>();
    const seed = createMobileSourceDetailCache(memoryStore(files).store);
    const keys = Array.from({ length: count }, (_, index) =>
      makeMobileSourceDetailCacheKey("a", "b", `manga-${index}`),
    );
    for (const [index, key] of keys.entries()) {
      await seed.setCached(key, payload(), 1_000 + index);
    }
    return { files, keys };
  }

  test("a cold hit reads exactly one entry and never scans the store", async () => {
    const { files, keys } = await seedFiles(8);
    const { store, counts } = memoryStore(files);
    const cache = createMobileSourceDetailCache(store);

    const hit = await cache.getCached(keys[3], 2_000);

    expect(hit).not.toBeNull();
    expect(hit?.payload.metadata.title).toBe("Example Manga");
    expect(counts.read).toBe(1);
    expect(counts.readAll).toBe(0);
  });

  test("a cold miss also costs one read, not a full scan", async () => {
    const { files } = await seedFiles(8);
    const { store, counts } = memoryStore(files);
    const cache = createMobileSourceDetailCache(store);

    expect(
      await cache.getCached(makeMobileSourceDetailCacheKey("a", "b", "absent")),
    ).toBeNull();
    expect(counts.read).toBe(1);
    expect(counts.readAll).toBe(0);
  });

  test("hydration for LRU bookkeeping runs once, after the paint path", async () => {
    const { files, keys } = await seedFiles(8);
    const { store, counts } = memoryStore(files);
    const cache = createMobileSourceDetailCache(store);

    await cache.getCached(keys[3], 2_000);
    expect(counts.readAll).toBe(0);

    await flushDeferredHydration();
    expect(counts.readAll).toBe(1);

    // Everything else is now resident: further reads cost no store access.
    const before = counts.read;
    expect(await cache.getCached(keys[0], 2_000)).not.toBeNull();
    expect(counts.read).toBe(before);
    expect(counts.readAll).toBe(1);
  });

  test("the entry read on the paint path stays youngest after hydration", async () => {
    const { files, keys } = await seedFiles(
      MOBILE_SOURCE_DETAIL_CACHE_MAX_ENTRIES,
    );
    const { store } = memoryStore(files);
    const cache = createMobileSourceDetailCache(store);

    // keys[0] is the oldest on disk; reading it first must protect it.
    expect(await cache.getCached(keys[0], 5_000)).not.toBeNull();
    await flushDeferredHydration();
    await cache.setCached(
      makeMobileSourceDetailCacheKey("a", "b", "manga-new"),
      payload(),
      6_000,
    );

    expect(await cache.getCached(keys[0])).not.toBeNull();
    expect(await cache.getCached(keys[1])).toBeNull();
  });

  test("adapters without a single-entry read still hydrate from readAll", async () => {
    const { files, keys } = await seedFiles(4);
    const backing = memoryStore(files);
    const counts = backing.counts;
    const scanOnlyStore: MobileSourceDetailCacheStore = {
      readAll: backing.store.readAll,
      write: backing.store.write,
      remove: backing.store.remove,
    };
    const cache = createMobileSourceDetailCache(scanOnlyStore);

    expect(await cache.getCached(keys[1], 2_000)).not.toBeNull();
    expect(counts.readAll).toBe(1);
    expect(counts.read).toBe(0);
  });
});
