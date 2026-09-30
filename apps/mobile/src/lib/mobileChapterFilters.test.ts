import { describe, expect, test } from "bun:test";
import {
  filterAndSortMobileChapters,
  getMobileChapterLanguages,
  normalizeMobileChapterListPreference,
  type MobileChapterListPreference,
} from "./mobileChapterFilters";
import { buildMobileChapterRows } from "./mobileChapterRows";

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

  // 漫画人 (zh.manhuaren) 海贼王: no chapter numbers, numeric section ids of
  // varying length, newest first. Ordering them by id read "977 | 976,
  // 656 | 655, 975 | 654…" in the two-column chapter grid.
  const unnumberedNewestFirst = [
    { id: "1837412", title: "第1194话 万事皆会变" },
    { id: "1831640", title: "第1193话 练习中" },
    { id: "996385", title: "第977话 宴会不开啦!!!" },
    { id: "992900", title: "第976话 请指教!!!" },
    { id: "987172", title: "第975话 锦卫门的妙计" },
    { id: "113231", title: "第657话 首级" },
    { id: "99254", title: "第656话 燃烧岛大冒险" },
    { id: "98906", title: "第655话 庞克哈萨德" },
  ];
  const allChapters: MobileChapterListPreference = {
    sortDirection: "desc",
    unreadOnly: false,
    languages: [],
  };

  test("keeps the source order of chapters without numbers", () => {
    const ids = unnumberedNewestFirst.map((chapter) => chapter.id);
    expect(
      filterAndSortMobileChapters(unnumberedNewestFirst, {}, allChapters).map(
        (chapter) => chapter.id,
      ),
    ).toEqual(ids);
    expect(
      filterAndSortMobileChapters(unnumberedNewestFirst, {}, {
        ...allChapters,
        sortDirection: "asc",
      }).map((chapter) => chapter.id),
    ).toEqual([...ids].reverse());
  });

  test("fills the two-column grid row by row in list order", () => {
    const rows = buildMobileChapterRows(
      filterAndSortMobileChapters(unnumberedNewestFirst, {}, allChapters),
    ).map((row) => row.chapters.map((chapter) => chapter.title?.split(" ")[0]));
    expect(rows).toEqual([
      ["第1194话", "第1193话"],
      ["第977话", "第976话"],
      ["第975话", "第657话"],
      ["第656话", "第655话"],
    ]);
  });

  test("filters without reordering what is left", () => {
    expect(
      filterAndSortMobileChapters(
        unnumberedNewestFirst,
        { "1831640": { completed: true } as never, "99254": { completed: true } as never },
        { ...allChapters, unreadOnly: true },
      ).map((chapter) => chapter.id),
    ).toEqual(["1837412", "996385", "992900", "987172", "113231", "98906"]);
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
