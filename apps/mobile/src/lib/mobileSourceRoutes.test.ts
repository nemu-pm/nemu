import { describe, expect, test } from "bun:test";
import {
  getMobileSourceBrowseHref,
  getMobileSourceBrowseSearchHref,
  getMobileSourceMangaBackAction,
  getMobileSourceMangaHref,
  getMobileSourceReaderBackAction,
  getMobileSourceReaderHref,
  getMobileSourceRouteParamCandidates,
  normalizeMobileReaderRouteLabel,
  normalizeMobileSourceRouteParam,
  parseMobileReaderRouteNumber,
} from "./mobileSourceRoutes";

describe("mobile source routes", () => {
  test("encodes source browse route params as single path segments", () => {
    expect(
      getMobileSourceBrowseHref({
        registryId: "tachiyomi-local",
        sourceId: "en/example",
      }),
    ).toBe("/browse/tachiyomi-local/en%2Fexample");
  });

  test("carries a trimmed search query into source browse navigation", () => {
    expect(
      getMobileSourceBrowseSearchHref({
        registryId: "aidoku-community",
        sourceId: "zh/example",
        query: "  怪兽 8号 & friends  ",
      }),
    ).toBe(
      "/browse/aidoku-community/zh%2Fexample?q=%E6%80%AA%E5%85%BD%208%E5%8F%B7%20%26%20friends",
    );
  });

  test("encodes source manga route params as single path segments", () => {
    expect(
      getMobileSourceMangaHref({
        registryId: "aidoku-community",
        sourceId: "ja.raw",
        mangaId: "title/123?lang=ja",
      }),
    ).toBe("/sources/aidoku-community/ja.raw/title%2F123%3Flang%3Dja");
  });

  test("carries a bounded listing title into source manga navigation", () => {
    expect(
      getMobileSourceMangaHref({
        registryId: "aidoku-community",
        sourceId: "ja.raw",
        mangaId: "/manga/example-raw/",
        mangaTitle: " 後宮真贋判定人 ",
      }),
    ).toBe(
      "/sources/aidoku-community/ja.raw/%2Fmanga%2Fexample-raw%2F?mangaTitle=%E5%BE%8C%E5%AE%AE%E7%9C%9F%E8%B4%8B%E5%88%A4%E5%AE%9A%E4%BA%BA",
    );
    expect(
      getMobileSourceMangaHref({
        registryId: "registry",
        sourceId: "source",
        mangaId: "same-title",
        mangaTitle: "same-title",
      }),
    ).toBe("/sources/registry/source/same-title");
  });

  test("never throws on malformed third-party route ids", () => {
    expect(
      getMobileSourceMangaHref({
        registryId: "aidoku-community",
        sourceId: "en.mangadex",
        mangaId: "bad\ud800manga",
      }),
    ).toBe("/sources/aidoku-community/en.mangadex/bad%EF%BF%BDmanga");
    expect(
      getMobileSourceReaderHref({
        registryId: "aidoku-community",
        sourceId: "en.mangadex",
        mangaId: "manga",
        mangaTitle: null,
        chapter: { id: "bad\udfffchapter" },
      }),
    ).toBe("/sources/aidoku-community/en.mangadex/manga/bad%EF%BF%BDchapter");
  });

  test("uses native history when source manga has a parent screen", () => {
    expect(
      getMobileSourceMangaBackAction({
        canGoBack: true,
        registryId: "aidoku-community",
        sourceId: "en.mangadex",
      }),
    ).toEqual({ type: "back" });
  });

  test("falls back to source home for a cold source-manga deep link", () => {
    expect(
      getMobileSourceMangaBackAction({
        canGoBack: false,
        registryId: "aidoku/community",
        sourceId: "en/mangadex",
      }),
    ).toEqual({
      type: "replace",
      href: "/browse/aidoku%2Fcommunity/en%2Fmangadex",
    });
  });

  test("falls back to the manga detail for a cold reader deep link", () => {
    expect(
      getMobileSourceReaderBackAction({
        canGoBack: false,
        registryId: "aidoku/community",
        sourceId: "en/mangadex",
        mangaId: "series/one",
        mangaTitle: "Series One",
      }),
    ).toEqual({
      type: "replace",
      href: "/sources/aidoku%2Fcommunity/en%2Fmangadex/series%2Fone?mangaTitle=Series%20One",
    });
    expect(
      getMobileSourceReaderBackAction({
        canGoBack: true,
        registryId: "registry",
        sourceId: "source",
        mangaId: "manga",
      }),
    ).toEqual({ type: "back" });
  });

  test("encodes reader routes and preserves page query params", () => {
    expect(
      getMobileSourceReaderHref({
        registryId: "aidoku-community",
        sourceId: "ja/raw",
        mangaId: "series/one",
        mangaTitle: null,
        chapter: { id: "ch/1" },
        page: 12,
      }),
    ).toBe("/sources/aidoku-community/ja%2Fraw/series%2Fone/ch%2F1?page=12");
  });

  test("carries known reader labels without exposing unescaped query data", () => {
    expect(
      getMobileSourceReaderHref({
        registryId: "aidoku-community",
        sourceId: "en.mangadex",
        mangaId: "manga-id",
        mangaTitle: " One Piece & Friends ",
        chapter: {
          id: "chapter-id",
          title: "Ch. 1 / Start?",
          chapterNumber: 1,
          volumeNumber: 2.5,
        },
      }),
    ).toBe(
      "/sources/aidoku-community/en.mangadex/manga-id/chapter-id?mangaTitle=One%20Piece%20%26%20Friends&chapterTitle=Ch.%201%20%2F%20Start%3F&chapterNumber=1&volumeNumber=2.5",
    );
  });

  test("omits empty reader labels", () => {
    expect(
      getMobileSourceReaderHref({
        registryId: "registry",
        sourceId: "source",
        mangaId: "manga",
        mangaTitle: "   ",
        chapter: { id: "chapter", title: "chapter" },
      }),
    ).toBe("/sources/registry/source/manga/chapter");
  });

  test("normalizes route params back to runtime ids", () => {
    expect(normalizeMobileSourceRouteParam("ja%2Fraw")).toBe("ja/raw");
    expect(normalizeMobileSourceRouteParam(["series%2Fone", "ignored"])).toBe(
      "series/one",
    );
    expect(normalizeMobileSourceRouteParam("plain")).toBe("plain");
  });

  test("exposes raw and decoded candidates for defensive matching", () => {
    expect(getMobileSourceRouteParamCandidates("ja%2Fraw")).toEqual([
      "ja%2Fraw",
      "ja/raw",
    ]);
    expect(getMobileSourceRouteParamCandidates("ja/raw")).toEqual(["ja/raw"]);
  });

  test("bounds friendly reader context and rejects opaque ids", () => {
    expect(normalizeMobileReaderRouteLabel(" chapter-id ", "chapter-id")).toBe(
      "",
    );
    expect(
      normalizeMobileReaderRouteLabel(" Friendly title ", "chapter-id"),
    ).toBe("Friendly title");
    expect(normalizeMobileReaderRouteLabel("x".repeat(300))).toHaveLength(256);
    expect(
      normalizeMobileReaderRouteLabel(`${"x".repeat(255)}😀rest`).endsWith(
        "😀",
      ),
    ).toBe(true);
    expect(normalizeMobileReaderRouteLabel("bad\ud800label")).toBe("bad�label");
    expect(parseMobileReaderRouteNumber("1188.5")).toBe(1188.5);
    expect(parseMobileReaderRouteNumber("1e3")).toBe(1000);
    expect(parseMobileReaderRouteNumber("0x10")).toBeUndefined();
    expect(parseMobileReaderRouteNumber("Infinity")).toBeUndefined();
    expect(parseMobileReaderRouteNumber("1000000001")).toBeUndefined();
  });
});
