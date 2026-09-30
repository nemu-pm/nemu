import { describe, expect, test } from "bun:test";
import {
  createMobileSourceDetailCache,
  decodeMobileSourceDetailCache,
  encodeMobileSourceDetailCache,
  makeMobileSourceDetailCacheKey,
  getMobileSourceDetailMetadataAgeMs,
  MOBILE_SOURCE_DETAIL_CACHE_MAX_CHAPTERS,
  MOBILE_SOURCE_DETAIL_CACHE_MAX_ENTRIES,
  MOBILE_SOURCE_DETAIL_CACHE_MEMORY_ENTRIES,
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
  const counts = { readAll: 0, read: 0, write: 0, remove: 0, prune: 0 };
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
      // Insertion order = write order, like file modification times.
      files.delete(key);
      files.set(key, raw);
    },
    async remove(key) {
      counts.remove += 1;
      files.delete(key);
    },
    async prune(maxEntries, keep) {
      counts.prune += 1;
      let overflow = files.size - maxEntries;
      for (const key of [...files.keys()]) {
        if (overflow <= 0) break;
        if (keep.has(key)) continue;
        files.delete(key);
        overflow -= 1;
      }
    },
  };
  return { files, store, counts };
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

  test("drops version 1 entries, whose chapter lists were id-sorted", () => {
    const raw = encodeMobileSourceDetailCache(
      makeMobileSourceDetailCacheKey("a", "b", "c"),
      payload(),
    );
    expect(decodeMobileSourceDetailCache(raw)).not.toBeNull();
    expect(
      decodeMobileSourceDetailCache(JSON.stringify({ ...JSON.parse(raw), v: 1 })),
    ).toBeNull();
  });

  test("rejects malformed metadata and chapters", () => {
    const base = { v: 2, key: "a:b:c" };
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

  test("prunes disk to the entry cap, least recently written first", async () => {
    const { files, store, counts } = memoryStore();
    const cache = createMobileSourceDetailCache(store);
    const keys = Array.from(
      { length: MOBILE_SOURCE_DETAIL_CACHE_MAX_ENTRIES + 1 },
      (_, index) =>
        makeMobileSourceDetailCacheKey("a", "b", `manga-${index}`),
    );
    for (const [index, key] of keys.entries()) {
      await cache.setCached(key, payload(), 1_000 + index);
    }
    await cache.compact();
    expect(counts.prune).toBeGreaterThan(0);
    expect(files.size).toBe(MOBILE_SOURCE_DETAIL_CACHE_MAX_ENTRIES);
    expect(files.has(keys[0]!)).toBe(false);
    expect(files.has(keys[keys.length - 1]!)).toBe(true);
  });

  test("an entry painted this session survives pruning", async () => {
    const { files, store } = memoryStore();
    const cache = createMobileSourceDetailCache(store);
    const keys = Array.from(
      { length: MOBILE_SOURCE_DETAIL_CACHE_MAX_ENTRIES },
      (_, index) => makeMobileSourceDetailCacheKey("a", "b", `manga-${index}`),
    );
    for (const [index, key] of keys.entries()) {
      await cache.setCached(key, payload(), 1_000 + index);
    }
    // keys[0] is the oldest write; the user opening it protects it.
    await cache.getCached(keys[0]!, 5_000);
    await cache.setCached(
      makeMobileSourceDetailCacheKey("a", "b", "manga-new"),
      payload(),
      6_000,
    );
    await cache.compact();
    expect(files.has(keys[0]!)).toBe(true);
    expect(files.has(keys[1]!)).toBe(false);
  });

  test("background chapter writes do not pin entries against pruning", async () => {
    const { files, store } = memoryStore();
    const cache = createMobileSourceDetailCache(store);
    const keys = Array.from(
      { length: MOBILE_SOURCE_DETAIL_CACHE_MAX_ENTRIES + 1 },
      (_, index) => makeMobileSourceDetailCacheKey("a", "b", `manga-${index}`),
    );
    for (const [index, key] of keys.entries()) {
      await cache.setCachedChapters(
        key,
        { chapters: payload().chapters, fetchedAt: 1_000 + index, fallbackTitle: "T" },
        5_000,
      );
    }
    await cache.compact();
    expect(files.size).toBe(MOBILE_SOURCE_DETAIL_CACHE_MAX_ENTRIES);
    expect(files.has(keys[0]!)).toBe(false);
  });

  test("keeps only a small working set decoded in memory", async () => {
    const { store, counts } = memoryStore();
    const cache = createMobileSourceDetailCache(store);
    const keys = Array.from(
      { length: MOBILE_SOURCE_DETAIL_CACHE_MEMORY_ENTRIES + 1 },
      (_, index) => makeMobileSourceDetailCacheKey("a", "b", `manga-${index}`),
    );
    for (const [index, key] of keys.entries()) {
      await cache.setCached(key, payload(), 1_000 + index);
    }
    const before = counts.read;
    // The newest is resident; the oldest fell out of memory and is re-read.
    expect(await cache.getCached(keys[keys.length - 1]!, 5_000)).not.toBeNull();
    expect(counts.read).toBe(before);
    expect(await cache.getCached(keys[0]!, 5_000)).not.toBeNull();
    expect(counts.read).toBe(before + 1);
  });

  test("a new cache instance reads persisted entries; corrupt ones are misses", async () => {
    const { files, store } = memoryStore();
    const seed = createMobileSourceDetailCache(store);
    const key = makeMobileSourceDetailCacheKey("a", "b", "c");
    const corrupt = makeMobileSourceDetailCacheKey("a", "b", "corrupt");
    await seed.setCached(key, payload(), 1_000);
    files.set(corrupt, "{not json");
    const reopened = createMobileSourceDetailCache(memoryStore(files).store);
    expect(await reopened.getCached(key, 2_000)).toEqual({
      payload: payload(),
      ageMs: 1_000,
      isStale: false,
    });
    expect(await reopened.getCached(corrupt, 2_000)).toBeNull();
  });

  test("storage failures never throw and degrade to memory-only", async () => {
    const failingStore: MobileSourceDetailCacheStore = {
      async readAll() {
        throw new Error("storage unavailable");
      },
      async read() {
        throw new Error("storage unavailable");
      },
      async prune() {
        throw new Error("prune failed");
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

  test("reads never scan the store, however many entries exist", async () => {
    const { files, keys } = await seedFiles(32);
    const { store, counts } = memoryStore(files);
    const cache = createMobileSourceDetailCache(store);

    for (const key of keys.slice(0, 8)) {
      expect(await cache.getCached(key, 5_000)).not.toBeNull();
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(counts.readAll).toBe(0);
    expect(counts.read).toBe(8);
  });
});

describe("mobile source detail cache chapter-only updates", () => {
  const key = makeMobileSourceDetailCacheKey("a", "b", "c");
  const fresh = [
    { id: "ch-3", chapterNumber: 3 },
    { id: "ch-2", chapterNumber: 2 },
    { id: "ch-1", chapterNumber: 1 },
  ];

  test("keeps the cached metadata and records its own age", async () => {
    const cache = createMobileSourceDetailCache(memoryStore().store);
    await cache.setCached(key, payload({ fetchedAt: 1_000 }), 1_000);
    const stored = await cache.setCachedChapters(
      key,
      { chapters: fresh, fetchedAt: 9_000, fallbackTitle: "Placeholder" },
      9_000,
    );
    expect(stored).toEqual({
      metadata: payload().metadata,
      chapters: fresh,
      fetchedAt: 9_000,
      metadataFetchedAt: 1_000,
    });
    const hit = await cache.getCached(key, 10_000);
    expect(hit?.payload.chapters).toEqual(fresh);
    expect(hit?.ageMs).toBe(1_000);
    expect(getMobileSourceDetailMetadataAgeMs(hit!.payload, 10_000)).toBe(9_000);
  });

  test("without cached details, stores a title-only placeholder", async () => {
    const cache = createMobileSourceDetailCache(memoryStore().store);
    const stored = await cache.setCachedChapters(
      key,
      { chapters: fresh, fetchedAt: 9_000, fallbackTitle: " 放课后少年花子君 " },
      9_000,
    );
    expect(stored).toEqual({
      metadata: { title: "放课后少年花子君" },
      chapters: fresh,
      fetchedAt: 9_000,
      partialMetadata: true,
    });
    expect(getMobileSourceDetailMetadataAgeMs(stored!, 10_000)).toBe(
      Number.POSITIVE_INFINITY,
    );
    // A later chapter refresh keeps the placeholder marked as such.
    const again = await cache.setCachedChapters(
      key,
      { chapters: fresh.slice(1), fetchedAt: 9_500, fallbackTitle: "Other" },
      9_500,
    );
    expect(again?.partialMetadata).toBe(true);
    expect(again?.metadata.title).toBe("放课后少年花子君");
  });

  test("never invents an entry without any title", async () => {
    const cache = createMobileSourceDetailCache(memoryStore().store);
    expect(
      await cache.setCachedChapters(
        key,
        { chapters: fresh, fetchedAt: 9_000, fallbackTitle: "  " },
        9_000,
      ),
    ).toBeNull();
    expect(await cache.getCached(key)).toBeNull();
  });

  test("round-trips metadata age and placeholder flags through storage", () => {
    const raw = encodeMobileSourceDetailCache(key, {
      ...payload({ fetchedAt: 5_000 }),
      metadataFetchedAt: 4_000,
      partialMetadata: true,
    });
    expect(decodeMobileSourceDetailCache(raw, 6_000)).toEqual({
      key,
      ...payload({ fetchedAt: 5_000 }),
      metadataFetchedAt: 4_000,
      partialMetadata: true,
    });
    expect(
      decodeMobileSourceDetailCache(
        encodeMobileSourceDetailCache(key, {
          ...payload(),
          metadataFetchedAt: 99_999,
        }),
        6_000,
      ),
    ).toBeNull();
  });

  test("caches long-running series up to the chapter cap", () => {
    const many = Array.from(
      { length: MOBILE_SOURCE_DETAIL_CACHE_MAX_CHAPTERS },
      (_, index) => ({ id: `c${index}`, chapterNumber: index }),
    );
    expect(MOBILE_SOURCE_DETAIL_CACHE_MAX_CHAPTERS).toBeGreaterThanOrEqual(10_000);
    expect(
      decodeMobileSourceDetailCache(
        encodeMobileSourceDetailCache(key, payload({ chapters: many })),
        2_000,
      )?.chapters.length,
    ).toBe(MOBILE_SOURCE_DETAIL_CACHE_MAX_CHAPTERS);
    expect(
      decodeMobileSourceDetailCache(
        encodeMobileSourceDetailCache(
          key,
          payload({ chapters: [...many, { id: "extra" }] }),
        ),
        2_000,
      ),
    ).toBeNull();
  });
});
