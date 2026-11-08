import { describe, expect, test } from "bun:test";
import type { ChapterSummary, LocalChapterProgress, LocalMangaProgress } from "@/data/schema";
import {
  buildMobileChapterReadMarks,
  resolveMobileShareUrl,
  selectMobileChaptersToMarkRead,
} from "./mobileChapterReadMarks";

const source = { registryId: "reg", sourceId: "src", sourceMangaId: "m" };
// The source's order: newest first.
const chapters: ChapterSummary[] = [5, 4, 3, 2, 1].map((n) => ({ id: `c${n}`, chapterNumber: n, title: `Ch ${n}` }));

function row(chapterId: string, patch: Partial<LocalChapterProgress> = {}): LocalChapterProgress {
  return {
    id: `p-${chapterId}`,
    ...source,
    sourceChapterId: chapterId,
    progress: 3,
    total: 20,
    completed: false,
    lastReadAt: 1_000,
    updatedAt: 1_000,
    ...patch,
  };
}

function manga(chapterId: string, lastReadAt = 1_000): LocalMangaProgress {
  return { id: "mp", ...source, lastReadAt, lastReadSourceChapterId: chapterId, updatedAt: lastReadAt };
}

describe("which chapters a mark covers", () => {
  const progress = { c2: { completed: true } };

  test("one chapter, unless it is read already", () => {
    expect(selectMobileChaptersToMarkRead(chapters, progress, { kind: "chapter", chapterId: "c4" }).map((c) => c.id)).toEqual(["c4"]);
    expect(selectMobileChaptersToMarkRead(chapters, progress, { kind: "chapter", chapterId: "c2" })).toEqual([]);
  });

  test("every chapter before it in reading order, skipping the read ones, newest first", () => {
    expect(selectMobileChaptersToMarkRead(chapters, progress, { kind: "previous", chapterId: "c4" }).map((c) => c.id)).toEqual(["c3", "c1"]);
    expect(selectMobileChaptersToMarkRead(chapters, progress, { kind: "previous", chapterId: "c1" })).toEqual([]);
  });

  test("the whole work", () => {
    expect(selectMobileChaptersToMarkRead(chapters, progress, { kind: "all" }).map((c) => c.id)).toEqual(["c5", "c4", "c3", "c1"]);
  });

  test("an unknown chapter covers nothing", () => {
    expect(selectMobileChaptersToMarkRead(chapters, {}, { kind: "previous", chapterId: "gone" })).toEqual([]);
  });
});

describe("the rows a mark saves", () => {
  test("completed rows that keep any page progress already made, so the high-water merge only moves forward", () => {
    const { chapterProgress } = buildMobileChapterReadMarks({
      marked: [chapters[1]!],
      chapters,
      progressById: { c4: row("c4", { progress: 7, total: 20 }) },
      source,
      libraryItemId: "lib",
      mangaProgress: null,
      now: 5_000,
    });
    expect(chapterProgress.find((p) => p.sourceChapterId === "c4")).toEqual(
      expect.objectContaining({
        sourceChapterId: "c4",
        completed: true,
        progress: 7,
        total: 20,
        chapterNumber: 4,
        chapterTitle: "Ch 4",
        libraryItemId: "lib",
        updatedAt: 5_000,
      }),
    );
  });

  test("past where the reader is: the next chapter carries the read event, so Continue lands on it", () => {
    const marks = buildMobileChapterReadMarks({
      marked: chapters.slice(2), // c3, c2, c1 (Mark Previous as Read on c4)
      chapters,
      progressById: {},
      source,
      mangaProgress: manga("c2"),
      now: 5_000,
    });
    expect(marks.chapterProgress.map((p) => [p.sourceChapterId, p.completed, p.lastReadAt])).toEqual([
      ["c4", false, 5_000],
      ["c3", true, 4_999],
      ["c2", true, 4_998],
      ["c1", true, 4_997],
    ]);
    // The bookmark reads no pages: the chapter stays unread.
    expect(marks.chapterProgress[0]).toMatchObject({ progress: 0, total: 0 });
    expect(marks.mangaProgress).toMatchObject({ lastReadSourceChapterId: "c4", lastReadAt: 5_000, updatedAt: 5_000 });
  });

  test("the whole work: nothing after it, so the newest chapter carries the event", () => {
    const marks = buildMobileChapterReadMarks({
      marked: chapters,
      chapters,
      progressById: {},
      source,
      mangaProgress: manga("c2"),
      now: 5_000,
    });
    expect(marks.chapterProgress.map((p) => p.sourceChapterId)).toEqual(["c5", "c4", "c3", "c2", "c1"]);
    expect(marks.chapterProgress.every((p) => p.completed)).toBe(true);
    expect(marks.chapterProgress.filter((p) => p.lastReadAt === 5_000).map((p) => p.sourceChapterId)).toEqual(["c5"]);
    expect(marks.mangaProgress?.lastReadSourceChapterId).toBe("c5");
  });

  test("a next chapter already read or locked is not a bookmark", () => {
    const marks = buildMobileChapterReadMarks({
      marked: [chapters[2]!],
      chapters,
      progressById: { c4: row("c4", { completed: true }) },
      source,
      mangaProgress: null,
      now: 5_000,
    });
    expect(marks.chapterProgress.map((p) => p.sourceChapterId)).toEqual(["c3"]);
    expect(marks.mangaProgress?.lastReadSourceChapterId).toBe("c3");
  });

  test("behind where the reader is: Continue stays, and no row outranks its read event", () => {
    const current = manga("c4", 3_000);
    const marks = buildMobileChapterReadMarks({
      marked: [chapters[3]!, chapters[4]!], // c2, c1
      chapters,
      progressById: { c1: row("c1", { lastReadAt: 2_000 }) },
      source,
      mangaProgress: current,
      now: 5_000,
    });
    for (const progress of marks.chapterProgress) expect(progress.lastReadAt).toBeLessThan(current.lastReadAt);
    expect(marks.chapterProgress.map((p) => p.lastReadAt)).toEqual([2_999, 2_000]);
    expect(marks.mangaProgress).toEqual({ ...current, updatedAt: 5_000 });
  });

  test("marking the chapter being read now moves Continue on to the next", () => {
    const marks = buildMobileChapterReadMarks({
      marked: [chapters[2]!],
      chapters,
      progressById: { c3: row("c3") },
      source,
      mangaProgress: manga("c3"),
      now: 5_000,
    });
    expect(marks.mangaProgress?.lastReadSourceChapterId).toBe("c4");
    // Pages already read on the marked chapter are kept.
    expect(marks.chapterProgress[1]).toMatchObject({ sourceChapterId: "c3", completed: true, progress: 3, total: 20 });
  });

  test("nothing to mark saves nothing", () => {
    expect(buildMobileChapterReadMarks({ marked: [], chapters, progressById: {}, source, mangaProgress: null, now: 1 })).toEqual({
      chapterProgress: [],
      mangaProgress: null,
    });
  });
});

describe("share links", () => {
  test("only http(s) links are shared", () => {
    expect(resolveMobileShareUrl(" https://www.peppercarrot.com/en/ ")).toBe("https://www.peppercarrot.com/en/");
    expect(resolveMobileShareUrl("http://example.org/a")).toBe("http://example.org/a");
    expect(resolveMobileShareUrl("javascript:alert(1)")).toBeNull();
    expect(resolveMobileShareUrl("/manga/123")).toBeNull();
    expect(resolveMobileShareUrl("")).toBeNull();
    expect(resolveMobileShareUrl(undefined)).toBeNull();
  });
});
