import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { dhashWordFromHex, type MultiDhash } from "@nemu/core/dual-reader";
import {
  clearMobileDualReaderDhashCache,
  getCachedMobileDualReadHash,
  removeCachedMobileDualReadHash,
  setCachedMobileDualReadHash,
  type MobileDualReadHashCacheKey,
} from "./mobileDualReaderDhashCache";
import {
  DUAL_READER_CONFIG_DIR,
  DUAL_READER_DHASH_DIR,
  readJsonCache,
  setMobileDualReaderFileCacheBackend,
  writeBoundedJsonCache,
  writeJsonCache,
  type DualReaderFileCacheBackend,
} from "./mobileDualReaderPersistence";
import { selectMobileDualReaderDhashCacheEvictions } from "./mobileDualReaderDhashCachePolicy";

function createFakeBackend(): DualReaderFileCacheBackend & {
  listCalls: number;
  store: Map<string, string>;
} {
  const store = new Map<string, string>();
  const modifiedAt = new Map<string, number>();
  const keyOf = (dir: string, fileName: string) => `${dir}/${fileName}`;
  const backend: DualReaderFileCacheBackend & {
    listCalls: number;
    store: Map<string, string>;
  } = {
    listCalls: 0,
    store,
    async readText(dir, fileName) {
      return store.get(keyOf(dir, fileName)) ?? null;
    },
    async writeText(dir, fileName, text) {
      const id = keyOf(dir, fileName);
      store.set(id, text);
      modifiedAt.set(id, Date.now());
    },
    async remove(dir, fileName) {
      const id = keyOf(dir, fileName);
      store.delete(id);
      modifiedAt.delete(id);
    },
    async listFiles(dir) {
      backend.listCalls += 1;
      const prefix = `${dir}/`;
      return [...store.entries()]
        .filter(([id]) => id.startsWith(prefix))
        .map(([id, text]) => ({
          fileName: id.slice(prefix.length),
          sizeBytes: new TextEncoder().encode(text).byteLength,
          modifiedAtMs: modifiedAt.get(id) ?? 0,
        }));
    },
  };
  return backend;
}

function makeHash(): MultiDhash {
  return {
    full: {
      h: dhashWordFromHex("deadbeef"),
      v: dhashWordFromHex("feedface"),
    },
    left: { h: dhashWordFromHex("1"), v: dhashWordFromHex("2") },
    right: { h: dhashWordFromHex("3"), v: dhashWordFromHex("4") },
    // top/bottom/center/trimmed intentionally omitted to exercise optional fields.
  };
}

const key: MobileDualReadHashCacheKey = {
  registryId: "reg-1",
  sourceId: "src-1",
  mangaId: "manga-1",
  chapterId: "ch-1",
  pageIndex: 3,
};

describe("mobileDualReaderDhashCache", () => {
  let backend: ReturnType<typeof createFakeBackend>;
  beforeEach(() => {
    backend = createFakeBackend();
    setMobileDualReaderFileCacheBackend(backend);
  });
  afterEach(() => {
    setMobileDualReaderFileCacheBackend(null);
  });

  test("set then get round-trips a MultiDhash including optional variants", async () => {
    await setCachedMobileDualReadHash(key, makeHash());
    const got = await getCachedMobileDualReadHash(key);
    expect(got).not.toBeNull();
    expect(got!.full.h).toEqual(dhashWordFromHex("deadbeef"));
    expect(got!.full.v).toEqual(dhashWordFromHex("feedface"));
    expect(got!.left).toEqual({
      h: dhashWordFromHex("1"),
      v: dhashWordFromHex("2"),
    });
    expect(got!.right).toEqual({
      h: dhashWordFromHex("3"),
      v: dhashWordFromHex("4"),
    });
    expect(got!.top).toBeUndefined();
    expect(got!.trimmed).toBeUndefined();
  });

  test("get returns null when no entry exists", async () => {
    const got = await getCachedMobileDualReadHash(key);
    expect(got).toBeNull();
  });

  test("evicts signed hashes written by the old Android Number shim", async () => {
    await setCachedMobileDualReadHash(key, makeHash());
    const persistedId = [...backend.store.keys()].find((id) =>
      id.startsWith(`${DUAL_READER_DHASH_DIR}/`),
    );
    expect(persistedId).toBeDefined();
    const persisted = JSON.parse(backend.store.get(persistedId!)!) as {
      hash: { full: { h: string } };
    };
    persisted.hash.full.h = "-80000000";
    backend.store.set(persistedId!, JSON.stringify(persisted));

    expect(await getCachedMobileDualReadHash(key)).toBeNull();
    expect(backend.store.has(persistedId!)).toBe(false);
  });

  test("evicts v2 entries produced by the old Number-shim algorithm", async () => {
    await setCachedMobileDualReadHash(key, makeHash());
    const persistedId = [...backend.store.keys()].find((id) =>
      id.startsWith(`${DUAL_READER_DHASH_DIR}/`),
    );
    expect(persistedId).toBeDefined();
    const persisted = JSON.parse(backend.store.get(persistedId!)!) as {
      version: number;
    };
    persisted.version = 2;
    backend.store.set(persistedId!, JSON.stringify(persisted));

    expect(await getCachedMobileDualReadHash(key)).toBeNull();
    expect(backend.store.has(persistedId!)).toBe(false);
  });

  test("remove drops the entry", async () => {
    await setCachedMobileDualReadHash(key, makeHash());
    await removeCachedMobileDualReadHash(key);
    const got = await getCachedMobileDualReadHash(key);
    expect(got).toBeNull();
  });

  test("keys are namespaced per page index (parity with web key shape)", async () => {
    await setCachedMobileDualReadHash(key, makeHash());
    const other = await getCachedMobileDualReadHash({ ...key, pageIndex: 4 });
    expect(other).toBeNull();
  });

  test("indexes the dHash directory once instead of scanning on every write", async () => {
    for (let pageIndex = 0; pageIndex < 8; pageIndex += 1) {
      await setCachedMobileDualReadHash({ ...key, pageIndex }, makeHash());
    }
    expect(backend.listCalls).toBe(1);
  });

  test("bounded pruning evicts only dHashes and leaves config intact", async () => {
    const smallPolicy = {
      maxBytes: 10_000,
      maxEntries: 2,
      maxAgeMs: 10_000,
      selectEvictions: (
        entries: ReadonlyArray<{
          fileName: string;
          sizeBytes: number;
          modifiedAtMs: number;
        }>,
        nowMs: number,
        protectedFileName: string,
      ) =>
        selectMobileDualReaderDhashCacheEvictions(
          entries.map((entry) => ({
            id: entry.fileName,
            sizeBytes: entry.sizeBytes,
            modifiedAtMs: entry.modifiedAtMs,
          })),
          { maxBytes: 10_000, maxEntries: 2, maxAgeMs: 10_000 },
          nowMs,
          protectedFileName,
        ),
    };

    await writeJsonCache(DUAL_READER_CONFIG_DIR, "config:keep", { keep: true });
    await writeBoundedJsonCache(
      DUAL_READER_DHASH_DIR,
      "dhash:a",
      { value: "a" },
      smallPolicy,
      100,
    );
    await writeBoundedJsonCache(
      DUAL_READER_DHASH_DIR,
      "dhash:b",
      { value: "b" },
      smallPolicy,
      200,
    );
    await writeBoundedJsonCache(
      DUAL_READER_DHASH_DIR,
      "dhash:c",
      { value: "c" },
      smallPolicy,
      300,
    );

    expect(
      await readJsonCache<{ value: string }>(DUAL_READER_DHASH_DIR, "dhash:a"),
    ).toBeNull();
    expect(
      await readJsonCache<{ value: string }>(DUAL_READER_DHASH_DIR, "dhash:b"),
    ).toEqual({ value: "b" });
    expect(
      await readJsonCache<{ value: string }>(DUAL_READER_DHASH_DIR, "dhash:c"),
    ).toEqual({ value: "c" });
    expect(
      await readJsonCache<{ keep: boolean }>(
        DUAL_READER_CONFIG_DIR,
        "config:keep",
      ),
    ).toEqual({ keep: true });
    expect(backend.listCalls).toBe(1);
  });

  test("clear removes every dHash, preserves config, and rebuilds the bounded index", async () => {
    await writeJsonCache(DUAL_READER_CONFIG_DIR, "config:keep", { keep: true });
    await setCachedMobileDualReadHash(key, makeHash());
    await setCachedMobileDualReadHash({ ...key, pageIndex: 4 }, makeHash());

    await clearMobileDualReaderDhashCache();

    expect(await getCachedMobileDualReadHash(key)).toBeNull();
    expect(
      await getCachedMobileDualReadHash({ ...key, pageIndex: 4 }),
    ).toBeNull();
    expect(
      await readJsonCache<{ keep: boolean }>(
        DUAL_READER_CONFIG_DIR,
        "config:keep",
      ),
    ).toEqual({ keep: true });

    await setCachedMobileDualReadHash({ ...key, pageIndex: 5 }, makeHash());
    expect(
      await getCachedMobileDualReadHash({ ...key, pageIndex: 5 }),
    ).not.toBeNull();
    expect(backend.listCalls).toBe(3);
  });

  test("clear waits for an older in-flight dHash write and removes its result", async () => {
    const originalWrite = backend.writeText.bind(backend);
    let releaseWrite: (() => void) | undefined;
    let markWriteStarted: (() => void) | undefined;
    const writeStarted = new Promise<void>((resolve) => {
      markWriteStarted = resolve;
    });
    const writeReleased = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });
    backend.writeText = async (dir, fileName, text) => {
      markWriteStarted?.();
      await writeReleased;
      await originalWrite(dir, fileName, text);
    };

    const write = setCachedMobileDualReadHash(key, makeHash());
    await writeStarted;
    const clear = clearMobileDualReaderDhashCache();
    releaseWrite?.();
    await Promise.all([write, clear]);

    expect(await getCachedMobileDualReadHash(key)).toBeNull();
  });
});
