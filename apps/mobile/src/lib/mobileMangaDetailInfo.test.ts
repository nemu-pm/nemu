import { describe, expect, test } from "bun:test";
import { formatMobileExploreChapterNumber } from "./mobileContinueReadingCopy";
import { getMobileStrings } from "./mobileI18n";
import {
  buildMobileDetailInfoRows,
  buildMobileDetailMetaCandidates,
  formatMobileDetailDate,
  pickMobileDetailMetaLine,
  splitMobileDescriptionParagraphs,
  withoutMobileDescriptionLicence,
} from "./mobileMangaDetailInfo";

describe("splitMobileDescriptionParagraphs", () => {
  test("one paragraph per non-empty line, trimmed", () => {
    expect(splitMobileDescriptionParagraphs("  First line.\r\n\r\nSecond line. \nThird")).toEqual([
      "First line.",
      "Second line.",
      "Third",
    ]);
  });

  test("blank text has no paragraphs", () => {
    expect(splitMobileDescriptionParagraphs(" \n\n ")).toEqual([]);
  });
});

describe("withoutMobileDescriptionLicence", () => {
  test("drops the line that only restates the licence, and the blank line it leaves", () => {
    expect(
      withoutMobileDescriptionLicence(
        "A webcomic.\n\nLicence: Creative Commons Attribution 4.0 (CC BY 4.0), https://example.org\n\nBy David Revoy.",
      ),
    ).toBe("A webcomic.\n\nBy David Revoy.");
    expect(withoutMobileDescriptionLicence("许可：CC BY 4.0\n简介")).toBe("简介");
  });

  test("a description without a licence line is unchanged", () => {
    const text = "Licensed to kill, a spy story.\nSecond line";
    expect(withoutMobileDescriptionLicence(text)).toBe(text);
  });
});

describe("buildMobileDetailInfoRows", () => {
  const strings = getMobileStrings("zh");

  test("rows in order, each only when known; genres as chips without the licence tag", () => {
    const rows = buildMobileDetailInfoRows(
      {
        status: "连载中",
        latest: "第 39 章",
        source: "Pepper&Carrot",
        languages: ["英语"],
        authors: ["David Revoy", "Someone"],
        license: "CC BY 4.0",
        tags: ["Fantasy", "cc by 4.0", "Comedy", "Fantasy", " "],
        added: null,
        lastRead: "2026年10月15日",
      },
      strings,
    );
    expect(rows.map((row) => row.key)).toEqual([
      "status",
      "latest",
      "source",
      "language",
      "author",
      "license",
      "genre",
      "lastRead",
    ]);
    expect(rows.map((row) => row.label)).toEqual(["状态", "最新章节", "书源", "语言", "作者", "许可", "类型", "上次阅读"]);
    expect(rows.find((row) => row.key === "author")?.value).toBe("David Revoy、Someone");
    expect(rows.find((row) => row.key === "genre")?.chips).toEqual(["Fantasy", "Comedy"]);
  });

  test("nothing known, no rows", () => {
    expect(buildMobileDetailInfoRows({ authors: [], tags: [] }, strings)).toEqual([]);
  });
});

describe("formatMobileDetailDate", () => {
  test("a day in the app's language; nothing for no timestamp", () => {
    const day = Date.UTC(2026, 9, 16, 12);
    expect(formatMobileDetailDate(day, "zh")).toContain("2026");
    expect(formatMobileDetailDate(day, "en")).toContain("2026");
    expect(formatMobileDetailDate(0, "en")).toBeNull();
    expect(formatMobileDetailDate(undefined, "ja")).toBeNull();
  });
});

describe("detail meta line fit", () => {
  const strings = getMobileStrings("zh");

  test("ongoing: the genre goes first, then the volume or title, then the latest for the count; the status stays", () => {
    expect(
      buildMobileDetailMetaCandidates(
        { status: "连载中", latest: "第 3 卷 第 39 章", latestNumber: "第 39 章", chapters: 39, genre: "Science Fiction" },
        strings,
      ),
    ).toEqual([
      "连载中 · 更新至第 3 卷 第 39 章 · Science Fiction",
      "连载中 · 更新至第 3 卷 第 39 章",
      "连载中 · 更新至第 39 章",
      "连载中 · 共 39 章",
      "连载中",
    ]);
  });

  test("a finished series counts its chapters; a latest that is its number is not repeated", () => {
    expect(
      buildMobileDetailMetaCandidates(
        { status: "已完结", completed: true, latest: "第 12 章", latestNumber: "第 12 章", chapters: 12, genre: "Comedy" },
        strings,
      ),
    ).toEqual(["已完结 · 共 12 章 · Comedy", "已完结 · 共 12 章", "已完结"]);
    expect(
      buildMobileDetailMetaCandidates({ status: "连载中", latest: "第 9 章", latestNumber: "第 9 章" }, strings),
    ).toEqual(["连载中 · 更新至第 9 章", "连载中"]);
  });

  const candidates = ["A · B · Genre", "A · B", "A"];

  test("the longest candidate that stays on one line; never a cut genre", () => {
    expect(pickMobileDetailMetaLine(candidates, [1, 1, 1], { hasGenre: true })).toBe("A · B · Genre");
    expect(pickMobileDetailMetaLine(candidates, [2, 1, 1], { hasGenre: true })).toBe("A · B");
    expect(pickMobileDetailMetaLine(candidates, [2, 2, 1], { hasGenre: true })).toBe("A");
    // Nothing fits (a status longer than the line): the status alone, truncated by the caller.
    expect(pickMobileDetailMetaLine(candidates, [3, 2, 2], { hasGenre: true })).toBe("A");
  });

  test("until measured, the line without the genre stands in", () => {
    expect(pickMobileDetailMetaLine(candidates, [], { hasGenre: true })).toBe("A · B");
    expect(pickMobileDetailMetaLine(["A · B", "A"], [], { hasGenre: false })).toBe("A · B");
    expect(pickMobileDetailMetaLine([], [], { hasGenre: false })).toBeNull();
  });
});

describe("formatMobileExploreChapterNumber", () => {
  const strings = getMobileStrings("en");

  test("the number alone, without its volume or title; nothing without a number", () => {
    expect(formatMobileExploreChapterNumber({ id: "a", chapterNumber: 131, volumeNumber: 12, title: "A long title" }, strings)).toBe("Ch.131");
    expect(formatMobileExploreChapterNumber({ id: "b", title: "Prologue" }, strings)).toBeNull();
  });
});
