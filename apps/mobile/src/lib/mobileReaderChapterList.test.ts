import { describe, expect, test } from "bun:test";
import type { ChapterSummary } from "@/data/schema";
import { DEFAULT_MOBILE_CHAPTER_LIST_PREFERENCE } from "./mobileChapterFilters";
import {
  buildMobileReaderChapterList,
  mobileReaderChapterListInitialScroll,
  mobileReaderChapterListMetrics,
  mobileReaderChapterListOffsets,
  mobileReaderChapterListTapAction,
  MOBILE_READER_CHAPTER_LIST_BOTTOM_PADDING,
  MOBILE_READER_CHAPTER_LIST_PADDING,
} from "./mobileReaderChapterList";

const chapter = (id: string, extra: Partial<ChapterSummary> = {}): ChapterSummary => ({ id, ...extra });
const ids = (list: ReturnType<typeof buildMobileReaderChapterList>) =>
  list.items.flatMap((item) => (item.kind === "chapter" ? [item.chapter.id] : []));
const preference = DEFAULT_MOBILE_CHAPTER_LIST_PREFERENCE;

describe("buildMobileReaderChapterList", () => {
  const newestFirst = [chapter("3"), chapter("2"), chapter("1")];

  test("keeps the detail page's order: newest first by default, reversed for ascending", () => {
    expect(ids(buildMobileReaderChapterList(newestFirst, preference, "2"))).toEqual(["3", "2", "1"]);
    expect(
      ids(buildMobileReaderChapterList(newestFirst, { ...preference, sortDirection: "asc" }, "2")),
    ).toEqual(["1", "2", "3"]);
  });

  test("does not reorder the list it was given", () => {
    const input = [...newestFirst];
    buildMobileReaderChapterList(input, { ...preference, sortDirection: "asc" }, "2");
    expect(input.map((item) => item.id)).toEqual(["3", "2", "1"]);
  });

  test("Unread Only never hides chapters from a list you jump around in", () => {
    expect(ids(buildMobileReaderChapterList(newestFirst, { ...preference, unreadOnly: true }, "2"))).toHaveLength(3);
  });

  test("the page's language filter applies, but the open chapter stays listed", () => {
    const chapters = [chapter("3", { lang: "en" }), chapter("2", { lang: "ja" }), chapter("1", { lang: "en" })];
    const list = buildMobileReaderChapterList(chapters, { ...preference, languages: ["en"] }, "2");
    expect(ids(list)).toEqual(["3", "2", "1"]);
    expect(ids(buildMobileReaderChapterList(chapters, { ...preference, languages: ["ja"] }, "1"))).toEqual(["2", "1"]);
  });

  test("a saved language none of the chapters has does not empty the list", () => {
    const chapters = [chapter("2", { lang: "en" }), chapter("1", { lang: "en" })];
    expect(ids(buildMobileReaderChapterList(chapters, { ...preference, languages: ["fr"] }, "1"))).toEqual(["2", "1"]);
  });

  test("volume headers head their runs, and the rows drop the volume", () => {
    const chapters = [
      chapter("4", { volumeNumber: 2, chapterNumber: 4 }),
      chapter("3", { volumeNumber: 2, chapterNumber: 3 }),
      chapter("2", { volumeNumber: 1, chapterNumber: 2 }),
      chapter("1", { volumeNumber: 1, chapterNumber: 1 }),
    ];
    const list = buildMobileReaderChapterList(chapters, preference, "2");
    expect(list.items.map((item) => item.kind)).toEqual(["header", "chapter", "chapter", "header", "chapter", "chapter"]);
    expect(list.dropVolume).toBe(true);
    expect(list.currentIndex).toBe(4);
  });

  test("no volumes: no headers, and a missing chapter has no index", () => {
    const list = buildMobileReaderChapterList(newestFirst, preference, "gone");
    expect(list.items.every((item) => item.kind === "chapter")).toBe(true);
    expect(list.dropVolume).toBe(false);
    expect(list.currentIndex).toBeNull();
  });
});

describe("mobileReaderChapterListMetrics", () => {
  test("rows hold title and subtitle at the default size", () => {
    expect(mobileReaderChapterListMetrics(1)).toEqual({ rowHeight: 58, headerHeight: 46 });
  });

  test("grow with the text up to its cap, and never shrink or break", () => {
    expect(mobileReaderChapterListMetrics(1.3).rowHeight).toBe(70);
    expect(mobileReaderChapterListMetrics(3)).toEqual(mobileReaderChapterListMetrics(1.6));
    expect(mobileReaderChapterListMetrics(0.8)).toEqual(mobileReaderChapterListMetrics(1));
    expect(mobileReaderChapterListMetrics(Number.NaN)).toEqual(mobileReaderChapterListMetrics(1));
  });
});

describe("mobileReaderChapterListOffsets", () => {
  test("adds up headers and rows from the top padding", () => {
    const metrics = { rowHeight: 50, headerHeight: 40 };
    const { offsets, end } = mobileReaderChapterListOffsets(
      [{ kind: "header" }, { kind: "chapter" }, { kind: "chapter" }],
      metrics,
    );
    const top = MOBILE_READER_CHAPTER_LIST_PADDING;
    expect(offsets).toEqual([top, top + 40, top + 90]);
    expect(end).toBe(top + 140);
  });
});

describe("mobileReaderChapterListInitialScroll", () => {
  const metrics = { rowHeight: 50, headerHeight: 40 };
  const rows = (count: number) => Array.from({ length: count }, () => ({ kind: "chapter" as const }));
  const viewportHeight = 500;
  const initial = (count: number, currentIndex: number | null) => {
    const { offsets, end } = mobileReaderChapterListOffsets(rows(count), metrics);
    return mobileReaderChapterListInitialScroll({ offsets, end, metrics, currentIndex, viewportHeight });
  };
  const top = (index: number) => MOBILE_READER_CHAPTER_LIST_PADDING + index * metrics.rowHeight;

  test("the top of the list, the current chapter near it, or no current chapter: opens at the top", () => {
    const atTop = { index: 0, offset: 0 };
    expect(initial(1000, 0)).toEqual(atTop);
    expect(initial(1000, 2)).toEqual(atTop);
    expect(initial(1000, null)).toEqual(atTop);
  });

  test("mid-list, the current chapter sits a third of the way down the sheet", () => {
    const { index, offset } = initial(1000, 500);
    expect(offset).toBe(top(500) - 135);
    // The item mounted at starts at or just above that place.
    expect(top(index)).toBeLessThanOrEqual(offset);
    expect(top(index + 1)).toBeGreaterThan(offset);
  });

  test("the last chapter opens wholly in view, the list's end at the sheet's", () => {
    const { offsets, end } = mobileReaderChapterListOffsets(rows(1000), metrics);
    const { offset } = initial(1000, 999);
    expect(offset + viewportHeight).toBe(end + MOBILE_READER_CHAPTER_LIST_BOTTOM_PADDING);
    expect(offsets[999]! + metrics.rowHeight).toBeLessThanOrEqual(offset + viewportHeight);
  });

  test("a list shorter than the sheet stays at the top", () => {
    expect(initial(3, 2)).toEqual({ index: 0, offset: 0 });
  });
});

describe("mobileReaderChapterListTapAction", () => {
  const action = (
    target: ChapterSummary,
    accessory: Parameters<typeof mobileReaderChapterListTapAction>[0]["accessory"],
    completed = false,
  ) => mobileReaderChapterListTapAction({ chapter: target, completed, accessory, currentChapterId: "open" });

  test("the open chapter just closes the sheet, even a locked one", () => {
    expect(action(chapter("open"), { status: "unread" })).toEqual({ kind: "close" });
    expect(action(chapter("open", { locked: true }), { status: "locked" })).toEqual({ kind: "close" });
  });

  test("a locked chapter says so and does not open", () => {
    expect(action(chapter("a", { locked: true }), { status: "locked" })).toEqual({ kind: "locked" });
  });

  test("a locked chapter already read still opens, as on the detail page", () => {
    expect(action(chapter("a", { locked: true }), { status: "completed" }, true)).toEqual({ kind: "open", startAt: "start" });
  });

  test("in progress opens at its saved page; unread and read at the first", () => {
    const inProgress = { status: "progress", page: 4, total: 20, ratio: 0.2 } as const;
    expect(action(chapter("a"), inProgress)).toEqual({ kind: "open", startAt: "saved" });
    expect(action(chapter("a"), { status: "unread" })).toEqual({ kind: "open", startAt: "start" });
    expect(action(chapter("a"), { status: "completed" }, true)).toEqual({ kind: "open", startAt: "start" });
  });

  test("a read chapter with a re-read spot opens there, as its row says", () => {
    const reread = { status: "progress", page: 7, total: 20, ratio: 0.35 } as const;
    expect(action(chapter("a"), reread, true)).toEqual({ kind: "open", startAt: "saved" });
  });
});
