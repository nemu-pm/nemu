import { describe, expect, test } from "bun:test";
import {
  findFirstChapterToRead,
  inferChapterListOrder,
  resolveContinueChapter,
  type ContinueChapterCandidate,
} from "./continue";

const ch = (
  id: string,
  chapterNumber?: number,
  extra: Partial<ContinueChapterCandidate> = {},
): ContinueChapterCandidate => ({ id, chapterNumber, ...extra });

describe("inferChapterListOrder", () => {
  test("detects newest-first and oldest-first lists", () => {
    expect(inferChapterListOrder([ch("3", 3), ch("2", 2), ch("1", 1)])).toBe("descending");
    expect(inferChapterListOrder([ch("1", 1), ch("2", 2), ch("3", 3)])).toBe("ascending");
  });

  test("falls back to the Aidoku newest-first convention without numbers", () => {
    expect(inferChapterListOrder([ch("a"), ch("b")])).toBe("descending");
    expect(inferChapterListOrder([])).toBe("descending");
  });
});

describe("findFirstChapterToRead", () => {
  test("newest-first list starts at chapter 1 (the last element)", () => {
    const chapters = [ch("c3", 3), ch("c2", 2), ch("c1", 1)];
    expect(findFirstChapterToRead(chapters)?.id).toBe("c1");
  });

  test("oldest-first list starts at chapter 1 (the first element)", () => {
    const chapters = [ch("c1", 1), ch("c2", 2), ch("c3", 3)];
    expect(findFirstChapterToRead(chapters)?.id).toBe("c1");
  });

  test("volume-grouped list with trailing volume-less chapters (MangaDex Frieren) starts at Ch. 1, not Ch. 138", () => {
    const chapters = [
      ch("v2c10", 10, { volumeNumber: 2 }),
      ch("v2c9", 9, { volumeNumber: 2 }),
      ch("v1c2", 2, { volumeNumber: 1 }),
      ch("v1c1", 1, { volumeNumber: 1 }),
      ch("c137", 137),
      ch("c138", 138),
    ];
    expect(findFirstChapterToRead(chapters)?.id).toBe("v1c1");
  });

  test("per-volume numbering picks the lowest volume", () => {
    const chapters = [
      ch("v2c1", 1, { volumeNumber: 2 }),
      ch("v1c2", 2, { volumeNumber: 1 }),
      ch("v1c1", 1, { volumeNumber: 1 }),
    ];
    expect(findFirstChapterToRead(chapters)?.id).toBe("v1c1");
  });

  test("a prologue numbered 0 comes first; -1 means no number", () => {
    expect(findFirstChapterToRead([ch("c1", 1), ch("c0", 0)])?.id).toBe("c0");
    expect(findFirstChapterToRead([ch("x", -1), ch("c2", 2), ch("c1", 1)])?.id).toBe("c1");
  });

  test("duplicate uploads prefer the unlocked one, then the list's oldest end", () => {
    expect(
      findFirstChapterToRead([
        ch("c2", 2),
        ch("c1-locked", 1, { locked: true }),
        ch("c1-free", 1),
      ])?.id,
    ).toBe("c1-free");
    // Newest first: the oldest end is the tail.
    expect(findFirstChapterToRead([ch("c2", 2), ch("c1-a", 1), ch("c1-b", 1)])?.id).toBe("c1-b");
    // Oldest first: the oldest end is the head.
    expect(findFirstChapterToRead([ch("c1-a", 1), ch("c1-b", 1), ch("c2", 2)])?.id).toBe("c1-a");
  });

  test("volume-only numbering and unnumbered lists", () => {
    expect(
      findFirstChapterToRead([
        ch("v3", undefined, { volumeNumber: 3 }),
        ch("v1", undefined, { volumeNumber: 1 }),
        ch("v2", undefined, { volumeNumber: 2 }),
      ])?.id,
    ).toBe("v1");
    expect(findFirstChapterToRead([ch("newest"), ch("oldest")])?.id).toBe("oldest");
    expect(findFirstChapterToRead([])).toBeNull();
  });
});

describe("resolveContinueChapter", () => {
  const chapters = [ch("c3", 3), ch("c2", 2), ch("c1", 1)];

  test("resumes the in-progress chapter", () => {
    expect(resolveContinueChapter(chapters, { lastReadSourceChapterId: "c2" })).toEqual({
      chapter: chapters[1],
      isContinuation: true,
    });
  });

  test("a re-keyed chapter resumes by chapter/volume number", () => {
    const rekeyed = [
      ch("new-c2-v2", 2, { volumeNumber: 2 }),
      ch("new-c2-v1", 2, { volumeNumber: 1 }),
      ch("new-c1", 1, { volumeNumber: 1 }),
    ];
    expect(
      resolveContinueChapter(rekeyed, {
        lastReadSourceChapterId: "gone",
        lastReadChapterNumber: 2,
        lastReadVolumeNumber: 1,
      }),
    ).toEqual({ chapter: rekeyed[1], isContinuation: true });
  });

  test("stale progress without a matching number starts from chapter 1", () => {
    expect(
      resolveContinueChapter(chapters, {
        lastReadSourceChapterId: "gone",
        lastReadChapterNumber: 99,
      }),
    ).toEqual({ chapter: chapters[2], isContinuation: false });
    expect(resolveContinueChapter(chapters, null)).toEqual({
      chapter: chapters[2],
      isContinuation: false,
    });
  });

  test("no chapters means no target", () => {
    expect(resolveContinueChapter([], { lastReadSourceChapterId: "c1" })).toEqual({
      chapter: null,
      isContinuation: false,
    });
  });
});
