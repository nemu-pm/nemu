import { describe, expect, test } from "bun:test";
import type { ChapterSummary } from "@/data/schema";
import {
  buildMobileExploreChapterRows,
  findMobileUpNextIndex,
  getMobileChapterListCommonGroup,
  getMobileChapterVolumeHeaders,
  getMobileExploreChapterRowSubtitle,
  getMobileExploreChapterSubtitle,
} from "./mobileExploreChapterList";

const chapter = (id: string, chapterNumber?: number, volumeNumber?: number, locked?: boolean): ChapterSummary => ({
  id,
  chapterNumber,
  volumeNumber,
  locked,
});

describe("design-explore chapter list", () => {
  test("one chapter per row, keys unique", () => {
    const rows = buildMobileExploreChapterRows([chapter("a", 1), chapter("b", 2)]);
    expect(rows.map((row) => row.chapters.length)).toEqual([1, 1]);
    expect(new Set(rows.map((row) => row.key)).size).toBe(2);
  });

  test("volume headers head every run of a volume, with its chapter range, in either sort order", () => {
    const ascending = [chapter("1", 1, 1), chapter("2", 2, 1), chapter("3", 3, 2), chapter("4", 4, 2), chapter("5", 5, 2)];
    const headers = getMobileChapterVolumeHeaders(ascending);
    expect([...headers.keys()]).toEqual(["1", "3"]);
    expect(headers.get("3")).toEqual({ volume: 2, from: 3, to: 5, count: 3 });
    const descending = [...ascending].reverse();
    expect([...getMobileChapterVolumeHeaders(descending).keys()]).toEqual(["5", "2"]);
  });

  test("no headers when the source does not number volumes", () => {
    // One volume only, mostly unnumbered, and the placeholder volume 0.
    expect(getMobileChapterVolumeHeaders([chapter("1", 1, 1), chapter("2", 2, 1)]).size).toBe(0);
    expect(getMobileChapterVolumeHeaders([chapter("1", 1, 1), chapter("2", 2, 2), chapter("3", 3), chapter("4", 4)]).size).toBe(0);
    expect(getMobileChapterVolumeHeaders([chapter("1", 1, 0), chapter("2", 2, 0), chapter("3", 3, 0)]).size).toBe(0);
  });

  test("the latest chapters without a volume yet are headed by the volume they follow", () => {
    const list = [chapter("1", 1, 1), chapter("2", 2, 1), chapter("3", 3, 2), chapter("4", 4, 2), chapter("5", 5), chapter("6", 6)];
    expect(getMobileChapterVolumeHeaders(list).get("5")).toEqual({ volume: null, after: 2, from: 5, to: 6, count: 2 });
    // Newest first: the same run, now at the top.
    expect(getMobileChapterVolumeHeaders([...list].reverse()).get("6")).toEqual({ volume: null, after: 2, from: 5, to: 6, count: 2 });
  });

  test("a header's chapter range is rounded like chapter labels", () => {
    const list = [chapter("a", 98, 20), chapter("b", 102.5999984741211, 20), chapter("c", 103, 21), chapter("d", 104, 21)];
    expect(getMobileChapterVolumeHeaders(list).get("a")).toEqual({ volume: 20, from: 98, to: 102.6, count: 2 });
  });

  test("a run without a volume between collected chapters is not 'after' anything", () => {
    const list = [chapter("1", 1, 1), chapter("2", 2, 1), chapter("x", 2.5), chapter("3", 3, 2), chapter("4", 4, 2)];
    expect(getMobileChapterVolumeHeaders(list).get("x")).toEqual({ volume: null, after: null, from: 2.5, to: 2.5, count: 1 });
  });

  test("up next falls back to the list's own state only when there is nothing to continue", () => {
    const list = [chapter("c3", 3), chapter("c2", 2), chapter("c1", 1)];
    const none = { chapter: null, sameSource: true };
    expect(findMobileUpNextIndex(list, { c3: { completed: false, progress: 0.4 } }, none)).toBe(0);
    expect(findMobileUpNextIndex(list, { c1: { completed: true, progress: 1 } }, none)).toBe(1);
    expect(
      findMobileUpNextIndex(
        list,
        { c1: { completed: true, progress: 1 }, c2: { completed: true, progress: 1 }, c3: { completed: true, progress: 1 } },
        none,
      ),
    ).toBeNull();
    // A locked chapter is never the jump target.
    expect(findMobileUpNextIndex([chapter("l", 1, undefined, true), chapter("o", 2)], {}, none)).toBe(1);
  });

  test("up next is always where Continue goes", () => {
    const list = [chapter("c3", 3), chapter("c2", 2), chapter("c1", 1)];
    // Same source: Continue's own row, even with another chapter in progress.
    expect(
      findMobileUpNextIndex(list, { c3: { completed: false, progress: 0.2 } }, { chapter: chapter("c2", 2), sameSource: true }),
    ).toBe(1);
    // Same source but the row is filtered out: nothing, not some other row.
    expect(
      findMobileUpNextIndex(list, { c3: { completed: false, progress: 0.2 } }, { chapter: chapter("c9", 9), sameSource: true }),
    ).toBeNull();
    // Continue resumes another source at Ch.1: this source's Ch.1, not its own Ch.3 in progress.
    expect(
      findMobileUpNextIndex(list, { c3: { completed: false, progress: 0.2 } }, { chapter: chapter("x", 1), sameSource: false }),
    ).toBe(2);
    // Another source, a volume both give that differs: no match.
    expect(
      findMobileUpNextIndex([chapter("a", 1, 2), chapter("b", 1, 1)], {}, { chapter: chapter("x", 1, 1), sameSource: false }),
    ).toBe(1);
    // Another source, no number to match by, or no such number here: nothing.
    expect(findMobileUpNextIndex(list, {}, { chapter: chapter("x"), sameSource: false })).toBeNull();
    expect(findMobileUpNextIndex(list, {}, { chapter: chapter("x", 40), sameSource: false })).toBeNull();
  });

  test("a group most chapters share is said once, not under every row", () => {
    const withGroup = (id: string, scanlator?: string): ChapterSummary => ({ id, scanlator });
    const same = ["1", "2", "3", "4", "5"].map((id) => withGroup(id, "单话"));
    expect(getMobileChapterListCommonGroup(same)).toBe("单话");
    expect(getMobileChapterListCommonGroup([...same.slice(0, 4), withGroup("x", "Flame Scans")])).toBe("单话");
    // Alternating groups, too few rows, or no groups: rows keep their own.
    expect(
      getMobileChapterListCommonGroup([withGroup("a", "A"), withGroup("b", "B"), withGroup("c", "A"), withGroup("d", "B")]),
    ).toBeNull();
    expect(getMobileChapterListCommonGroup(same.slice(0, 3))).toBeNull();
    expect(getMobileChapterListCommonGroup(["1", "2", "3", "4"].map((id) => withGroup(id)))).toBeNull();
    expect(getMobileExploreChapterRowSubtitle({ title: "第132话 (10p)", scanlator: "单话" }, "单话")).toBeNull();
    expect(getMobileExploreChapterRowSubtitle({ title: "Chapter 1", scanlator: "Other" }, "Flame Scans")).toBe("Other");
    expect(getMobileExploreChapterRowSubtitle({ title: "Side Story 1", scanlator: "Flame Scans" }, "Flame Scans")).toBe(
      "Side Story 1",
    );
    expect(getMobileExploreChapterRowSubtitle({ title: "Side Story 1", scanlator: "Flame Scans" }, null)).toBe(
      "Side Story 1 · Flame Scans",
    );
  });

  test("the source's chapter title shows only when it says more than the number", () => {
    expect(getMobileExploreChapterSubtitle({ title: "第132话 (10p)" })).toBeNull();
    expect(getMobileExploreChapterSubtitle({ title: "Chapter 12" })).toBeNull();
    expect(getMobileExploreChapterSubtitle({ title: "Ch. 12.5" })).toBeNull();
    expect(getMobileExploreChapterSubtitle({ title: "第01回 決戦" })).toBe("第01回 決戦");
    expect(getMobileExploreChapterSubtitle({ title: "Hanako-san of the Toilet (Pilot, Part 1)" })).toBe(
      "Hanako-san of the Toilet (Pilot, Part 1)",
    );
    expect(getMobileExploreChapterSubtitle({ title: "" })).toBeNull();
  });
});
