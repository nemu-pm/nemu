import { describe, expect, test } from "bun:test";
import type { ChapterSummary, LocalMangaProgress } from "@/data/schema";
import { getMobileSourceMangaContinueTarget } from "./mobileSourceMangaContinue";

const chapters: ChapterSummary[] = [
  { id: "c3", chapterNumber: 3 },
  { id: "c2", chapterNumber: 2 },
  { id: "c1", chapterNumber: 1 },
];

function progress(chapterId: string | null): LocalMangaProgress | null {
  if (!chapterId) return null;
  return {
    id: "progress",
    registryId: "aidoku-community",
    sourceId: "en.example",
    sourceMangaId: "manga",
    lastReadAt: 1,
    lastReadSourceChapterId: chapterId,
    updatedAt: 1,
  };
}

describe("mobile source manga continue target", () => {
  test("continues the last read chapter when it still exists", () => {
    expect(getMobileSourceMangaContinueTarget(chapters, progress("c2"))).toEqual({
      chapter: chapters[1],
      isContinuation: true,
    });
  });

  test("matches web live source detail fallback for stale progress", () => {
    expect(getMobileSourceMangaContinueTarget(chapters, progress("deleted"))).toEqual({
      chapter: chapters[2],
      isContinuation: false,
    });
  });

  test("starts from the oldest chapter without progress", () => {
    expect(getMobileSourceMangaContinueTarget(chapters, progress(null))).toEqual({
      chapter: chapters[2],
      isContinuation: false,
    });
  });

  test("returns no target when there are no chapters", () => {
    expect(getMobileSourceMangaContinueTarget([], progress("c2"))).toEqual({
      chapter: null,
      isContinuation: false,
    });
  });
});
