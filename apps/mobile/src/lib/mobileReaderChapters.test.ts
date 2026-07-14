import { describe, expect, test } from "bun:test";
import type { ChapterSummary } from "@/data/schema";
import { getMobileReaderChapterNavigation } from "./mobileReaderChapters";

const chapters: ChapterSummary[] = [
  { id: "c3", chapterNumber: 3, title: "Latest" },
  { id: "c2", chapterNumber: 2, title: "Middle" },
  { id: "c1", chapterNumber: 1, title: "Start" },
];

describe("mobile reader chapter navigation", () => {
  test("derives previous and next chapters from newest-first source chapters", () => {
    expect(getMobileReaderChapterNavigation(chapters, "c2", "ltr")).toMatchObject({
      previousChapter: { id: "c1" },
      nextChapter: { id: "c3" },
      leftChapter: { id: "c1" },
      rightChapter: { id: "c3" },
    });
  });

  test("swaps left and right chapter controls in RTL mode", () => {
    expect(getMobileReaderChapterNavigation(chapters, "c2", "rtl")).toMatchObject({
      previousChapter: { id: "c1" },
      nextChapter: { id: "c3" },
      leftChapter: { id: "c3" },
      rightChapter: { id: "c1" },
    });
  });

  test("returns null edges when there is no adjacent chapter", () => {
    expect(getMobileReaderChapterNavigation(chapters, "c1", "ltr")).toMatchObject({
      previousChapter: null,
      nextChapter: { id: "c2" },
      leftChapter: null,
      rightChapter: { id: "c2" },
    });
    expect(getMobileReaderChapterNavigation(chapters, "missing", "ltr")).toEqual({
      previousChapter: null,
      nextChapter: null,
      leftChapter: null,
      rightChapter: null,
    });
  });
});
