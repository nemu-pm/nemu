import { afterEach, describe, expect, test } from "bun:test";
import {
  loadMobileSourceMangaViewer,
  normalizeMobileSourceMangaViewer,
  parseMobileSourceMangaViewers,
  rememberMobileSourceMangaViewer,
  resetMobileSourceMangaViewersForTests,
  serializeMobileSourceMangaViewers,
} from "./mobileSourceMangaViewer";

describe("source manga viewer memory", () => {
  afterEach(() => resetMobileSourceMangaViewersForTests());

  test("only Aidoku's five viewers are kept", () => {
    expect([0, 1, 2, 3, 4].map(normalizeMobileSourceMangaViewer)).toEqual([0, 1, 2, 3, 4]);
    expect(normalizeMobileSourceMangaViewer(5)).toBeNull();
    expect(normalizeMobileSourceMangaViewer("4")).toBeNull();
    expect(normalizeMobileSourceMangaViewer(undefined)).toBeNull();
  });

  test("round-trips, drops malformed entries and keeps the newest past the limit", () => {
    const map = new Map([
      ["a", 1 as const],
      ["b", 4 as const],
    ]);
    expect(parseMobileSourceMangaViewers(serializeMobileSourceMangaViewers(map))).toEqual(map);
    expect([...parseMobileSourceMangaViewers(serializeMobileSourceMangaViewers(map, 1)).keys()]).toEqual(["b"]);
    expect(parseMobileSourceMangaViewers(JSON.stringify({ entries: [["x", 9], [1, 4]] })).size).toBe(0);
    expect(parseMobileSourceMangaViewers("{").size).toBe(0);
  });

  test("remembers what a details fetch reported", async () => {
    expect(await loadMobileSourceMangaViewer("aidoku:multi.webtoon:1")).toBeNull();
    rememberMobileSourceMangaViewer("aidoku:multi.webtoon:1", 4);
    rememberMobileSourceMangaViewer("aidoku:ja.shonenjumpplus:2", 1);
    rememberMobileSourceMangaViewer("aidoku:x:3", undefined);
    expect(await loadMobileSourceMangaViewer("aidoku:multi.webtoon:1")).toBe(4);
    expect(await loadMobileSourceMangaViewer("aidoku:ja.shonenjumpplus:2")).toBe(1);
    expect(await loadMobileSourceMangaViewer("aidoku:x:3")).toBeNull();
  });
});
