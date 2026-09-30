import { describe, expect, test } from "bun:test";
import {
  mergeMobileChapterRecord,
  orderMobileChaptersNewestFirst,
  orderMobileKnownChapters,
  sortMobileChaptersByNumber,
} from "./mobileChapterOrder";
import type { ChapterSummary } from "@/data/schema";

const ids = (chapters: { id: string }[]) => chapters.map((chapter) => chapter.id);

describe("orderMobileChaptersNewestFirst", () => {
  test("keeps a list without numbers exactly as the source sent it", () => {
    expect(
      ids(
        orderMobileChaptersNewestFirst([
          { id: "1837412" },
          { id: "996385" },
          { id: "99254" },
          { id: "98906" },
        ]),
      ),
    ).toEqual(["1837412", "996385", "99254", "98906"]);
  });

  test("never moves unnumbered chapters out of their source position", () => {
    expect(
      ids(
        orderMobileChaptersNewestFirst([
          { id: "v3", volumeNumber: 3 },
          { id: "special" },
          { id: "v2", volumeNumber: 2 },
          { id: "v1", volumeNumber: 1 },
        ]),
      ),
    ).toEqual(["v3", "special", "v2", "v1"]);
  });

  test("reverses an oldest-first source, including its volume-less tail", () => {
    expect(
      ids(
        orderMobileChaptersNewestFirst([
          { id: "1", chapterNumber: 1, volumeNumber: 1 },
          { id: "2", chapterNumber: 2, volumeNumber: 1 },
          { id: "3", chapterNumber: 3, volumeNumber: 2 },
          { id: "4", chapterNumber: 4 },
        ]),
      ),
    ).toEqual(["4", "3", "2", "1"]);
  });

  test("does not mutate its input", () => {
    const input = [{ id: "1", chapterNumber: 1 }, { id: "2", chapterNumber: 2 }];
    orderMobileChaptersNewestFirst(input);
    expect(ids(input)).toEqual(["1", "2"]);
  });
});

describe("sortMobileChaptersByNumber", () => {
  test("orders by chapter then volume number, newest first", () => {
    expect(
      ids(
        sortMobileChaptersByNumber([
          { id: "c1", chapterNumber: 1 },
          { id: "c10", chapterNumber: 10 },
          { id: "v2c2", chapterNumber: 2, volumeNumber: 2 },
          { id: "v1c2", chapterNumber: 2, volumeNumber: 1 },
        ]),
      ),
    ).toEqual(["c10", "v2c2", "v1c2", "c1"]);
  });

  test("keeps the input order of ties instead of comparing ids", () => {
    expect(
      ids(
        sortMobileChaptersByNumber([
          { id: "1837412" },
          { id: "99254" },
          { id: "b", chapterNumber: -1 },
          { id: "a", chapterNumber: Number.NaN },
        ]),
      ),
    ).toEqual(["1837412", "99254", "b", "a"]);
  });

  test("puts unnumbered chapters after numbered ones", () => {
    expect(
      ids(
        sortMobileChaptersByNumber([
          { id: "none" },
          { id: "c0", chapterNumber: 0 },
          { id: "c1", chapterNumber: 1 },
        ]),
      ),
    ).toEqual(["c1", "c0", "none"]);
  });
});

describe("orderMobileKnownChapters", () => {
  test("keeps the source list's order and appends chapters it lacks by number", () => {
    expect(
      ids(
        orderMobileKnownChapters(
          [
            { id: "1837412" },
            { id: "996385" },
            { id: "99254" },
            { id: "removed-5", chapterNumber: 5 },
            { id: "removed-9", chapterNumber: 9 },
          ],
          new Set(["1837412", "996385", "99254"]),
        ),
      ),
    ).toEqual(["1837412", "996385", "99254", "removed-9", "removed-5"]);
  });

  test("orders a locally known list by number before the source list loads", () => {
    expect(
      ids(
        orderMobileKnownChapters(
          [
            { id: "latest", chapterNumber: 12 },
            { id: "read-3", chapterNumber: 3 },
            { id: "read-7", chapterNumber: 7 },
          ],
          new Set(),
        ),
      ),
    ).toEqual(["latest", "read-7", "read-3"]);
  });
});

describe("mergeMobileChapterRecord", () => {
  test("a progress row fills gaps but never replaces the source's fields", () => {
    expect(
      mergeMobileChapterRecord<ChapterSummary>(
        {
          id: "c1",
          title: "第1话",
          chapterNumber: 1,
          lang: "zh",
          scanlator: "Group",
          locked: false,
          volumeNumber: undefined,
        },
        { id: "c1", title: "Old title", chapterNumber: 1, volumeNumber: 2 },
      ),
    ).toEqual({
      id: "c1",
      title: "第1话",
      chapterNumber: 1,
      lang: "zh",
      scanlator: "Group",
      locked: false,
      volumeNumber: 2,
    });
  });
});
