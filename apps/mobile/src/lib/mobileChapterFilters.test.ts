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

  test("normalizes malformed persisted preferences", () => {
    expect(normalizeMobileChapterListPreference({ languages: ["ja", "ja", 1] })).toEqual({
      sortDirection: "desc",
      unreadOnly: false,
      languages: ["ja"],
    });
  });
});
