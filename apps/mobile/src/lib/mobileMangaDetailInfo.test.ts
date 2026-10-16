import { describe, expect, test } from "bun:test";
import { getMobileStrings } from "./mobileI18n";
import {
  buildMobileDetailInfoRows,
  formatMobileDetailDate,
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
