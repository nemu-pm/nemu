import { afterEach, describe, expect, test } from "bun:test";
import {
  loadMobileSourceMangaViewer,
  normalizeMobileSourceMangaViewer,
  parseMobileSourceMangaViewers,
  peekMobileSourceMangaViewer,
  rememberMobileSourceMangaViewer,
  resetMobileSourceMangaViewersForTests,
  serializeMobileSourceMangaViewers,
  subscribeMobileSourceMangaViewers,
} from "./mobileSourceMangaViewer";

describe("source manga viewer memory", () => {
  afterEach(() => resetMobileSourceMangaViewersForTests());

  test("a viewer heard from a source is known at once, and says so", async () => {
    let changes = 0;
    subscribeMobileSourceMangaViewers(() => {
      changes += 1;
    });
    expect(peekMobileSourceMangaViewer("a")).toBeNull();
    rememberMobileSourceMangaViewer("a", 1);
    await loadMobileSourceMangaViewer("a");
    await Bun.sleep(0);
    expect(peekMobileSourceMangaViewer("a")).toBe(1);
    expect(changes).toBeGreaterThan(0);
  });

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
