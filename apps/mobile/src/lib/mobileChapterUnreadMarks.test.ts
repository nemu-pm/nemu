import { describe, expect, test } from "bun:test";
import { mergeChapterProgressForSave } from "@nemu/core";
import type { ChapterSummary, LocalChapterProgress, LocalMangaProgress } from "@/data/schema";
import {
  buildMobileChapterReadMarks,
  buildMobileChapterUnreadMarks,
  selectMobileChapterProgressToMarkUnread,
} from "./mobileChapterReadMarks";
import {
  mergeMobileRetargetedChapterProgress,
  mergeMobileRetargetedMangaProgress,
} from "./mobileSourceLinks";

const source = { registryId: "reg", sourceId: "src", sourceMangaId: "m" };
// The source's order: newest first.
const chapters: ChapterSummary[] = [3, 2, 1].map((n) => ({ id: `c${n}`, chapterNumber: n, title: `Ch ${n}` }));

function row(chapterId: string, patch: Partial<LocalChapterProgress> = {}): LocalChapterProgress {
  return {
    id: `reg:src:m:${chapterId}`,
    ...source,
    sourceChapterId: chapterId,
    progress: 19,
    total: 20,
    completed: true,
    lastReadAt: 1_000,
    updatedAt: 1_000,
    ...patch,
  };
}

const summary: LocalMangaProgress = {
  id: "reg:src:m",
  ...source,
  libraryItemId: "lib",
  lastReadAt: 1_200,
  lastReadSourceChapterId: "c2",
  lastReadChapterNumber: 2,
  updatedAt: 1_200,
};

const progressById = {
  c1: row("c1", { lastReadAt: 1_100, chapterNumber: 1 }),
  c2: row("c2", { completed: false, progress: 7, lastReadAt: 1_200, chapterNumber: 2 }),
};

describe("Mark as Unread", () => {
  test("covers only chapters that hold reading", () => {
    expect(
      selectMobileChapterProgressToMarkUnread(chapters, progressById, { kind: "all" }).map((p) => p.sourceChapterId),
    ).toEqual(["c2", "c1"]);
    expect(selectMobileChapterProgressToMarkUnread(chapters, progressById, { kind: "chapter", chapterId: "c3" })).toEqual([]);
    const reset = buildMobileChapterUnreadMarks({
      marked: [progressById.c1],
      progressById,
      mangaProgress: summary,
    }).chapterProgress[0]!;
    expect(
      selectMobileChapterProgressToMarkUnread(chapters, { c1: reset }, { kind: "chapter", chapterId: "c1" }),
    ).toEqual([]);
  });

  test("saves rows with no reading behind a reset clock newer than the stored row", () => {
    const { chapterProgress } = buildMobileChapterUnreadMarks({
      marked: [progressById.c1],
      progressById,
      mangaProgress: summary,
    });
    expect(chapterProgress).toHaveLength(1);
    const [reset] = chapterProgress;
    expect(reset).toMatchObject({
      id: progressById.c1.id,
      sourceChapterId: "c1",
      chapterNumber: 1,
      progress: 0,
      total: 0,
      completed: false,
      lastReadAt: 0,
    });
    expect(reset!.resetAt).toBeGreaterThan(progressById.c1.updatedAt);
    expect(reset!.updatedAt).toBe(reset!.resetAt!);
    // The store's merge keeps the reset over the read row.
    expect(mergeChapterProgressForSave(progressById.c1, reset!)).toMatchObject({
      progress: 0,
      completed: false,
      resetAt: reset!.resetAt,
    });
  });

  test("a chapter that is not Continue's leaves Continue alone", () => {
    expect(
      buildMobileChapterUnreadMarks({ marked: [progressById.c1], progressById, mangaProgress: summary }).mangaProgress,
    ).toBeNull();
  });

  test("Continue's chapter moves Continue back to the newest chapter still read", () => {
    const { chapterProgress, mangaProgress } = buildMobileChapterUnreadMarks({
      marked: [progressById.c2],
      progressById,
      mangaProgress: summary,
    });
    expect(mangaProgress).toMatchObject({
      id: summary.id,
      libraryItemId: "lib",
      lastReadAt: 1_100,
      lastReadSourceChapterId: "c1",
      lastReadChapterNumber: 1,
      updatedAt: chapterProgress[0]!.updatedAt,
    });
  });

  test("the whole work clears Continue", () => {
    const { chapterProgress, mangaProgress } = buildMobileChapterUnreadMarks({
      marked: selectMobileChapterProgressToMarkUnread(chapters, progressById, { kind: "all" }),
      progressById,
      mangaProgress: summary,
    });
    expect(chapterProgress.map((p) => p.sourceChapterId)).toEqual(["c2", "c1"]);
    expect(mangaProgress).toMatchObject({ id: summary.id, lastReadAt: 0, libraryItemId: "lib" });
    expect(mangaProgress?.lastReadSourceChapterId).toBeUndefined();
    expect(mangaProgress!.updatedAt).toBe(Math.max(...chapterProgress.map((p) => p.updatedAt)));
  });

  test("nothing to mark saves nothing", () => {
    expect(buildMobileChapterUnreadMarks({ marked: [], progressById, mangaProgress: summary })).toEqual({
      chapterProgress: [],
      mangaProgress: null,
    });
  });

  test("Mark as Read after Mark as Unread reads again", () => {
    const [reset] = buildMobileChapterUnreadMarks({
      marked: [progressById.c1],
      progressById,
      mangaProgress: summary,
    }).chapterProgress;
    const { chapterProgress } = buildMobileChapterReadMarks({
      marked: [chapters[2]!],
      chapters,
      progressById: { ...progressById, c1: reset },
      source,
      mangaProgress: summary,
      now: reset!.updatedAt + 1,
    });
    const read = chapterProgress.find((p) => p.sourceChapterId === "c1")!;
    expect(mergeChapterProgressForSave(reset!, read)).toMatchObject({ completed: true, resetAt: reset!.resetAt });
  });
});

describe("moving progress to another library item keeps a reset", () => {
  const reset = { ...row("c1"), progress: 0, total: 0, completed: false, lastReadAt: 0, resetAt: 2_000, updatedAt: 2_000 };

  test("pages from before the reset do not come back", () => {
    for (const [existing, incoming] of [
      [row("c1"), reset],
      [reset, row("c1")],
    ] as const) {
      const [merged] = mergeMobileRetargetedChapterProgress([incoming], [existing]);
      expect(merged).toMatchObject({ progress: 0, completed: false, resetAt: 2_000 });
    }
  });

  test("a reset chapter never becomes the work's last read", () => {
    expect(mergeMobileRetargetedMangaProgress([reset], [])).toEqual([]);
  });
});
