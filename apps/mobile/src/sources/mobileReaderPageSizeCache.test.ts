import { describe, expect, test } from "bun:test";
import {
  decodeMobileReaderPageSizes,
  encodeMobileReaderPageSizes,
  loadMobileReaderPageSizes,
  makeMobileReaderPageSizeChapterKey,
  saveMobileReaderPageSize,
} from "./mobileReaderPageSizeCache";

describe("mobile reader page size cache", () => {
  test("round-trips sizes", () => {
    const sizes = new Map([
      ["p1", { width: 800, height: 1200 }],
      ["p2", { width: 760, height: 11000 }],
    ]);
    expect(decodeMobileReaderPageSizes(encodeMobileReaderPageSizes(sizes, 10), 20)).toEqual(sizes);
  });

  test("drops invalid, expired and future entries", () => {
    const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
    expect(
      decodeMobileReaderPageSizes(
        encode({ v: 1, savedAt: 10, sizes: { a: [1, 2], b: [0, 3], c: "x", d: [1, Number.NaN] } }),
        20,
      ),
    ).toEqual(new Map([["a", { width: 1, height: 2 }]]));
    expect(decodeMobileReaderPageSizes(encode({ v: 1, savedAt: 30, sizes: { a: [1, 2] } }), 20).size).toBe(0);
    expect(
      decodeMobileReaderPageSizes(encode({ v: 1, savedAt: 0, sizes: { a: [1, 2] } }), 40 * 24 * 3600 * 1000).size,
    ).toBe(0);
    expect(decodeMobileReaderPageSizes(encode({ v: 2, savedAt: 10, sizes: {} }), 20).size).toBe(0);
    expect(decodeMobileReaderPageSizes(new TextEncoder().encode("{"), 20).size).toBe(0);
  });

  test("a measured size is loadable for the chapter (pending, then written)", async () => {
    const key = makeMobileReaderPageSizeChapterKey({
      registryId: "r",
      sourceId: "s",
      mangaId: "m",
      chapterId: `c-${Math.random()}`,
    });
    saveMobileReaderPageSize(key, "p1", { width: 800, height: 1200 });
    expect((await loadMobileReaderPageSizes(key)).get("p1")).toEqual({ width: 800, height: 1200 });
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    expect((await loadMobileReaderPageSizes(key)).get("p1")).toEqual({ width: 800, height: 1200 });
  });
});
