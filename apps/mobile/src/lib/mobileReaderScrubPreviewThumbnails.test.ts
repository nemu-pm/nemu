import { describe, expect, test } from "bun:test";
import {
  ReaderScrubPreviewThumbnailCache,
  planReaderScrubPreviewPrefetch,
  readerScrubPreviewTargetPages,
} from "./mobileReaderScrubPreviewThumbnails";
import { buildMobileReaderSpreads } from "./mobileReaderSpreads";

describe("scrub preview thumbnails", () => {
  test("single pages preview the page, spreads the whole spread", () => {
    expect(readerScrubPreviewTargetPages(4, 10, null)).toEqual([4]);
    expect(readerScrubPreviewTargetPages(99, 10, null)).toEqual([9]);
    expect(readerScrubPreviewTargetPages(null, 10, null)).toEqual([]);
    const spreads = buildMobileReaderSpreads(6, "manga"); // [0] [1,2] [3,4] [5]
    expect(readerScrubPreviewTargetPages(1, 6, spreads)).toEqual([1, 2]);
    expect(readerScrubPreviewTargetPages(0, 6, spreads)).toEqual([0]);
  });

  test("prefetch warms the nearest pages first, both directions, inside the chapter", () => {
    expect(planReaderScrubPreviewPrefetch([5], 20, 3)).toEqual([6, 4, 7, 3, 8, 2]);
    expect(planReaderScrubPreviewPrefetch([1, 2], 4, 2)).toEqual([3, 0]);
    expect(planReaderScrubPreviewPrefetch([], 4, 2)).toEqual([]);
  });

  test("the LRU keeps the most recently used thumbnails", () => {
    const cache = new ReaderScrubPreviewThumbnailCache(2);
    cache.set("a", "file:a");
    cache.set("b", "file:b");
    expect(cache.get("a")).toBe("file:a");
    cache.set("c", "file:c");
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBe("file:a");
    expect(cache.size).toBe(2);
  });
});
