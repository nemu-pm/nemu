import { describe, expect, test } from "bun:test";
import {
  findFirstChapterToRead,
  findNextUnreadChapter,
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

describe("resolveContinueChapter with completion", () => {
  // Pepper&Carrot-like list, newest first: Ch.38 was finished in the reader.
  const chapters = [ch("c40", 40), ch("c39", 39), ch("c38", 38), ch("c37", 37), ch("c35", 35)];
  const completedOf = (...ids: string[]) => (chapter: ContinueChapterCandidate) =>
    ids.includes(chapter.id);

  test("a finished last-read chapter moves Continue to the next unread chapter", () => {
    expect(
      resolveContinueChapter(chapters, { lastReadSourceChapterId: "c38" }, {
        isCompleted: completedOf("c38", "c35"),
      }),
    ).toEqual({ chapter: chapters[1], isContinuation: true });
  });

  test("chapters already finished after it are skipped", () => {
    expect(
      resolveContinueChapter(chapters, { lastReadSourceChapterId: "c38" }, {
        isCompleted: completedOf("c38", "c39"),
      }).chapter?.id,
    ).toBe("c40");
  });

  test("an unfinished last-read chapter is resumed as before", () => {
    expect(
      resolveContinueChapter(chapters, { lastReadSourceChapterId: "c38" }, {
        isCompleted: completedOf("c37"),
      }),
    ).toEqual({ chapter: chapters[2], isContinuation: true });
  });

  test("finished the latest chapter: caught up on it", () => {
    expect(
      resolveContinueChapter(chapters, { lastReadSourceChapterId: "c40" }, {
        isCompleted: completedOf("c40"),
      }),
    ).toEqual({ chapter: chapters[0], isContinuation: true, caughtUp: true });
  });

  test("an earlier unread chapter does not count as next", () => {
    expect(
      resolveContinueChapter(chapters, { lastReadSourceChapterId: "c40" }, {
        isCompleted: completedOf("c40", "c38"),
      }).caughtUp,
    ).toBe(true);
  });

  test("works for oldest-first lists, and skips locked chapters and same-number uploads", () => {
    const ascending = [
      ch("a1", 1),
      ch("a2", 2),
      ch("a2-alt", 2),
      ch("a3", 3, { locked: true }),
      ch("a4", 4),
    ];
    expect(
      findNextUnreadChapter(ascending, ascending[1]!, (chapter) => chapter.id === "a2"),
    ).toBe(ascending[4]);
  });

  test("numbering that restarts per volume goes by volume first", () => {
    const volumes = [
      ch("v2c1", 1, { volumeNumber: 2 }),
      ch("v1c2", 2, { volumeNumber: 1 }),
      ch("v1c1", 1, { volumeNumber: 1 }),
    ];
    expect(
      findNextUnreadChapter(volumes, volumes[1]!, (chapter) => chapter.id === "v1c2"),
    ).toBe(volumes[0]);
  });

  test("unnumbered chapters go by list order", () => {
    const unnumbered = [ch("u3"), ch("u2"), ch("u1")];
    expect(findNextUnreadChapter(unnumbered, unnumbered[2]!, () => false)).toBe(unnumbered[1]);
  });
});
