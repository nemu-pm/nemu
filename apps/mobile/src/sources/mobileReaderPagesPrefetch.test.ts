import { describe, expect, test } from "bun:test";
import {
  MOBILE_READER_PAGES_PREFETCH_TTL_MS,
  MobileReaderPagesPrefetchCache,
  isMobileReaderPagesPrefetchFresh,
  makeMobileReaderPagesPrefetchKey,
} from "./mobileReaderPagesPrefetch";

function tick(times: number[]): () => number {
  let index = 0;
  return () => times[Math.min(index++, times.length - 1)]!;
}

describe("mobile reader pages prefetch", () => {
  test("key covers everything that changes a page list", () => {
    const base = {
      registryId: "aidoku",
      sourceId: "src",
      mangaId: "manga",
      chapterId: "ch-2",
      processPageImages: false,
    };
    const key = makeMobileReaderPagesPrefetchKey(base);
    expect(makeMobileReaderPagesPrefetchKey(base)).toBe(key);
    for (const variation of [
      { ...base, registryId: "other" },
      { ...base, sourceId: "other" },
      { ...base, mangaId: "other" },
      { ...base, chapterId: "ch-3" },
      { ...base, processPageImages: true },
    ]) {
      expect(makeMobileReaderPagesPrefetchKey(variation)).not.toBe(key);
    }
  });

  test("freshness is bounded by the TTL and rejects clock rewinds", () => {
    expect(
      isMobileReaderPagesPrefetchFresh({ startedAt: 1_000, now: 1_000 }),
    ).toBe(true);
    expect(
      isMobileReaderPagesPrefetchFresh({
        startedAt: 1_000,
        now: 999 + MOBILE_READER_PAGES_PREFETCH_TTL_MS,
      }),
    ).toBe(true);
    expect(
      isMobileReaderPagesPrefetchFresh({
        startedAt: 1_000,
        now: 1_000 + MOBILE_READER_PAGES_PREFETCH_TTL_MS,
      }),
    ).toBe(false);
    expect(
      isMobileReaderPagesPrefetchFresh({ startedAt: 1_000, now: 999 }),
    ).toBe(false);
  });

  test("take returns the pending result exactly once", async () => {
    const cache = new MobileReaderPagesPrefetchCache<string>(2, 1_000, () => 0);
    cache.start("a", () => Promise.resolve("pages"));
    await expect(cache.take("a")).resolves.toBe("pages");
    expect(cache.take("a")).toBeNull();
  });

  test("a failed prefetch resolves to null instead of throwing", async () => {
    const cache = new MobileReaderPagesPrefetchCache<string>(2, 1_000, () => 0);
    cache.start("a", () => Promise.reject(new Error("offline")));
    await expect(cache.take("a")).resolves.toBeNull();
  });

  test("a fresh in-flight prefetch is not restarted", async () => {
    const cache = new MobileReaderPagesPrefetchCache<string>(2, 1_000, () => 0);
    let runs = 0;
    const run = () => {
      runs += 1;
      return Promise.resolve(`run-${runs}`);
    };
    cache.start("a", run);
    cache.start("a", run);
    expect(runs).toBe(1);
    await expect(cache.take("a")).resolves.toBe("run-1");
  });

  test("expired entries are re-run on start and dropped on take", async () => {
    let disposed: Array<string | null> = [];
    const cache = new MobileReaderPagesPrefetchCache<string>(
      2,
      100,
      tick([0, 50, 200, 200, 400]),
    );
    cache.start("a", () => Promise.resolve("first"), (r) => disposed.push(r));
    // now=50: still fresh — take succeeds.
    await expect(cache.take("a")).resolves.toBe("first");

    disposed = [];
    const stale = new MobileReaderPagesPrefetchCache<string>(
      2,
      100,
      tick([0, 200]),
    );
    stale.start("a", () => Promise.resolve("first"), (r) => disposed.push(r));
    expect(stale.take("a")).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(disposed).toEqual(["first"]);
  });

  test("evicts the oldest entry beyond the bound and disposes it", async () => {
    const disposed: Array<string | null> = [];
    const cache = new MobileReaderPagesPrefetchCache<string>(1, 1_000, () => 0);
    cache.start("a", () => Promise.resolve("a-pages"), (r) => disposed.push(r));
    cache.start("b", () => Promise.resolve("b-pages"), (r) => disposed.push(r));
    expect(cache.size()).toBe(1);
    expect(cache.take("a")).toBeNull();
    await expect(cache.take("b")).resolves.toBe("b-pages");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(disposed).toEqual(["a-pages"]);
  });

  test("clear disposes everything without surfacing results", async () => {
    const disposed: Array<string | null> = [];
    const cache = new MobileReaderPagesPrefetchCache<string>(2, 1_000, () => 0);
    cache.start("a", () => Promise.resolve("a-pages"), (r) => disposed.push(r));
    cache.start("b", () => Promise.resolve("b-pages"), (r) => disposed.push(r));
    cache.clear();
    expect(cache.size()).toBe(0);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(disposed.sort()).toEqual(["a-pages", "b-pages"]);
  });
});
