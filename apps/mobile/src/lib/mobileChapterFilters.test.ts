import { describe, expect, test } from "bun:test";
import {
  filterAndSortMobileChapters,
  getMobileChapterLanguages,
  normalizeMobileChapterListPreference,
} from "./mobileChapterFilters";

describe("mobile chapter filters", () => {
  const chapters = [
    { id: "en-2", chapterNumber: 2, lang: "en" },
    { id: "ja-1", chapterNumber: 1, lang: "ja" },
    { id: "zh-3", chapterNumber: 3, lang: "zh" },
  ];

  test("orders languages by the shared ja, zh, en priority", () => {
    expect(getMobileChapterLanguages(chapters)).toEqual(["ja", "zh", "en"]);
  });

  test("filters unread and selected languages before sorting", () => {
    expect(
      filterAndSortMobileChapters(
        chapters,
        { "zh-3": { completed: true } as never },
        { sortDirection: "asc", unreadOnly: true, languages: ["ja", "zh"] },
      ).map((chapter) => chapter.id),
    ).toEqual(["ja-1"]);
  });

  test("keeps ja, zh, en ahead of the alphabetical tail", () => {
    expect(
      getMobileChapterLanguages([
        { id: "fr", chapterNumber: 1, lang: "fr" },
        { id: "en", chapterNumber: 2, lang: "en" },
        { id: "multi", chapterNumber: 3, lang: "multi" },
        { id: "de", chapterNumber: 4, lang: "de" },
        { id: "zh", chapterNumber: 5, lang: "zh" },
        { id: "ja", chapterNumber: 6, lang: "ja" },
      ]),
    ).toEqual(["ja", "zh", "en", "multi", "de", "fr"]);
  });

  test("keeps chapter language variants beside their base language", () => {
    expect(
      getMobileChapterLanguages([
        { id: "vi", chapterNumber: 1, lang: "vi" },
        { id: "zh-Hant", chapterNumber: 2, lang: "zh-Hant" },
        { id: "pt-BR", chapterNumber: 3, lang: "pt-BR" },
        { id: "zh-hans", chapterNumber: 4, lang: "zh-hans" },
        { id: "pt", chapterNumber: 5, lang: "pt" },
        { id: "zh-TW", chapterNumber: 6, lang: "zh-TW" },
        { id: "zh", chapterNumber: 7, lang: "zh" },
        { id: "es-419", chapterNumber: 8, lang: "es-419" },
        { id: "es", chapterNumber: 9, lang: "es" },
        { id: "ja", chapterNumber: 10, lang: "ja" },
      ]),
    ).toEqual([
      "ja",
      "zh",
      "zh-hans",
      "zh-Hant",
      "zh-TW",
      "es",
      "es-419",
      "pt",
      "pt-BR",
      "vi",
    ]);
  });

  test("normalizes malformed persisted preferences", () => {
    expect(normalizeMobileChapterListPreference({ languages: ["ja", "ja", 1] })).toEqual({
      sortDirection: "desc",
      unreadOnly: false,
      languages: ["ja"],
    });
  });
});
