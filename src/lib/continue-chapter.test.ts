import { describe, expect, test } from "bun:test";
import { resolveContinueChapter } from "@nemu/core/library";
import type { Chapter } from "@/lib/sources";
import type { LocalMangaProgress } from "@/data/schema";

// The web manga pages (`pages/manga.tsx`, `pages/library-manga.tsx`) pick the
// "Start reading / Continue" chapter with the shared core helper. These pin
// the web-facing behaviour with the web's own chapter/progress types.
describe("web continue chapter", () => {
  const progress = (chapterId: string): LocalMangaProgress =>
    ({
      id: "reg:src:manga",
      registryId: "reg",
      sourceId: "src",
      sourceMangaId: "manga",
      lastReadAt: 1,
      lastReadSourceChapterId: chapterId,
      updatedAt: 1,
    }) as LocalMangaProgress;

  test("Start reading opens chapter 1 for an oldest-first source (was the newest chapter)", () => {
    const chapters: Chapter[] = [
      { id: "1", chapterNumber: 1 },
      { id: "2", chapterNumber: 2 },
      { id: "138", chapterNumber: 138 },
    ];
    expect(resolveContinueChapter(chapters, undefined)).toEqual({
      chapter: chapters[0],
      isContinuation: false,
    });
  });

  test("Start reading still opens chapter 1 for a newest-first source", () => {
    const chapters: Chapter[] = [
      { id: "3", chapterNumber: 3 },
      { id: "2", chapterNumber: 2 },
      { id: "1", chapterNumber: 1 },
    ];
    expect(resolveContinueChapter(chapters, undefined).chapter?.id).toBe("1");
  });

  test("Continue resumes the in-progress chapter", () => {
    const chapters: Chapter[] = [
      { id: "3", chapterNumber: 3 },
      { id: "2", chapterNumber: 2 },
      { id: "1", chapterNumber: 1 },
    ];
    expect(resolveContinueChapter(chapters, progress("2"))).toEqual({
      chapter: chapters[1],
      isContinuation: true,
    });
  });
});
