import { describe, expect, test } from "bun:test";
import {
  MOBILE_DUAL_READER_SAMPLE_CACHE_SIZE,
  getMobileDualReaderLruEntry,
  setMobileDualReaderLruEntry,
} from "./mobileDualReaderMemoryCache";

describe("mobile dual-reader in-memory LRU", () => {
  test("evicts the least-recently-used sample", () => {
    const cache = new Map<string, number>();
    setMobileDualReaderLruEntry(cache, "a", 1, 3);
    setMobileDualReaderLruEntry(cache, "b", 2, 3);
    setMobileDualReaderLruEntry(cache, "c", 3, 3);

    expect(getMobileDualReaderLruEntry(cache, "a")).toBe(1);
    setMobileDualReaderLruEntry(cache, "d", 4, 3);

    expect([...cache.entries()]).toEqual([
      ["c", 3],
      ["a", 1],
      ["d", 4],
    ]);
    expect(getMobileDualReaderLruEntry(cache, "b")).toBeUndefined();
  });

  test("refreshes an updated entry without growing the cache", () => {
    const cache = new Map<string, number>();
    setMobileDualReaderLruEntry(cache, "a", 1, 2);
    setMobileDualReaderLruEntry(cache, "b", 2, 2);
    setMobileDualReaderLruEntry(cache, "a", 10, 2);
    setMobileDualReaderLruEntry(cache, "c", 3, 2);

    expect([...cache.entries()]).toEqual([
      ["a", 10],
      ["c", 3],
    ]);
  });

  test("bounds a long reading session at the production capacity", () => {
    const cache = new Map<number, number>();
    for (let page = 0; page < 500; page += 1) {
      setMobileDualReaderLruEntry(cache, page, page);
    }

    expect(cache.size).toBe(MOBILE_DUAL_READER_SAMPLE_CACHE_SIZE);
    expect([...cache.keys()][0]).toBe(
      500 - MOBILE_DUAL_READER_SAMPLE_CACHE_SIZE,
    );
    expect([...cache.keys()].at(-1)).toBe(499);
  });
});
