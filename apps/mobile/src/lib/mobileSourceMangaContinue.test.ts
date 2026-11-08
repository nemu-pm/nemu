import { describe, expect, test } from "bun:test";
import type { ChapterSummary, LocalMangaProgress } from "@/data/schema";
import {
  getMobileSourceMangaContinueTarget,
  resolveMobileContinueTarget,
} from "./mobileSourceMangaContinue";

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

describe("mobile source manga continue target ordering", () => {
  test("an oldest-first source starts at chapter 1, not the newest chapter", () => {
    const ascending: ChapterSummary[] = [
      { id: "c1", chapterNumber: 1 },
      { id: "c2", chapterNumber: 2 },
      { id: "c138", chapterNumber: 138 },
    ];
    expect(getMobileSourceMangaContinueTarget(ascending, null)).toEqual({
      chapter: ascending[0],
      isContinuation: false,
    });
  });

  test("volume-grouped lists with trailing volume-less chapters start at Vol. 1 Ch. 1", () => {
    const grouped: ChapterSummary[] = [
      { id: "v2c9", chapterNumber: 9, volumeNumber: 2 },
      { id: "v1c1", chapterNumber: 1, volumeNumber: 1 },
      { id: "c137", chapterNumber: 137 },
      { id: "c138", chapterNumber: 138 },
    ];
    expect(getMobileSourceMangaContinueTarget(grouped, null).chapter?.id).toBe("v1c1");
  });

  test("resumes by chapter number when the progress chapter id was re-keyed", () => {
    const stale: LocalMangaProgress = {
      ...progress("gone")!,
      lastReadChapterNumber: 2,
    };
    expect(getMobileSourceMangaContinueTarget(chapters, stale)).toEqual({
      chapter: chapters[1],
      isContinuation: true,
    });
  });
});

describe("Continue on a finished chapter (card, detail page and reader agree)", () => {
  const done = (...ids: string[]) =>
    Object.fromEntries(ids.map((id) => [id, { completed: true }]));

  test("the finished last-read chapter hands over to the next unread one", () => {
    expect(getMobileSourceMangaContinueTarget(chapters, progress("c2"), done("c2"))).toEqual({
      chapter: chapters[0],
      isContinuation: true,
    });
  });

  test("the card resolves from the cached list exactly as the detail page does", () => {
    for (const read of ["c1", "c2", "c3"]) {
      const completion = done(read);
      expect(
        resolveMobileContinueTarget({
          chapters,
          progress: progress(read),
          chapterProgress: completion,
          latestChapter: chapters[0],
        }),
      ).toEqual(getMobileSourceMangaContinueTarget(chapters, progress(read), completion));
    }
  });

  test("finished the latest chapter: caught up on it", () => {
    expect(getMobileSourceMangaContinueTarget(chapters, progress("c3"), done("c3"))).toEqual({
      chapter: chapters[0],
      isContinuation: true,
      caughtUp: true,
    });
  });

  test("without a list the card names the progress' chapter", () => {
    expect(
      resolveMobileContinueTarget({
        chapters: null,
        progress: progress("c2"),
        chapterProgress: done("c2"),
        latestChapter: chapters[0],
      }),
    ).toEqual({
      chapter: { id: "c2", title: undefined, chapterNumber: undefined, volumeNumber: undefined },
      isContinuation: true,
    });
    expect(
      resolveMobileContinueTarget({
        chapters: null,
        progress: progress("c3"),
        chapterProgress: done("c3"),
        latestChapter: chapters[0],
      }).caughtUp,
    ).toBe(true);
  });

  test("a cached list that lost the chapter keeps resuming it", () => {
    expect(
      resolveMobileContinueTarget({
        chapters,
        progress: progress("gone"),
        chapterProgress: {},
        latestChapter: chapters[0],
      }).chapter?.id,
    ).toBe("gone");
  });
});
