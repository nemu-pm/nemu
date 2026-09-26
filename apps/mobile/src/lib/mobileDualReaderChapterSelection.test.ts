import { describe, expect, test } from "bun:test";
import type { ChapterSummary } from "@/data/schema";
import { getMobileStrings } from "./mobileI18n";
import {
  mobileDualReadChapterRowSubtitles,
  mobileDualReadSelectedChapterIndex,
  pickMobileDualReadSecondaryChapterId,
} from "./mobileDualReaderChapterSelection";

const en = getMobileStrings("en");

function chapters(
  prefix: string,
  numbers: number[],
  extra: Partial<ChapterSummary> = {},
): ChapterSummary[] {
  // Newest first, like the mobile chapter lists.
  return [...numbers]
    .sort((a, b) => b - a)
    .map((n) => ({ id: `${prefix}-${n}`, chapterNumber: n, ...extra }));
}

describe("Dual Read secondary chapter auto-pick", () => {
  const primary = chapters("p", [1, 2, 3, 4, 5]);

  test("picks the paired source's chapter with the same number", () => {
    const secondary = chapters("s", [1, 2, 3, 4, 5, 6]);
    expect(
      pickMobileDualReadSecondaryChapterId({
        selectedId: null,
        primaryChapter: primary.find((c) => c.chapterNumber === 3),
        primaryChapters: primary,
        secondaryChapters: secondary,
      }),
    ).toBe("s-3");
  });

  test("falls back to the closest number when the exact one is missing", () => {
    const secondary = chapters("s", [1, 2, 4, 5]);
    expect(
      pickMobileDualReadSecondaryChapterId({
        selectedId: null,
        primaryChapter: { id: "p-3.5", chapterNumber: 3.6 },
        primaryChapters: primary,
        secondaryChapters: secondary,
      }),
    ).toBe("s-4");
  });

  test("keeps an explicit choice the user made in the list", () => {
    const secondary = chapters("s", [1, 2, 3]);
    expect(
      pickMobileDualReadSecondaryChapterId({
        selectedId: "s-1",
        primaryChapter: primary.find((c) => c.chapterNumber === 3),
        primaryChapters: primary,
        secondaryChapters: secondary,
      }),
    ).toBe("s-1");
  });

  test("maps through the stored seed pair when numbering is offset", () => {
    // The paired source numbers the same story four chapters higher.
    const secondary = chapters("s", [5, 6, 7, 8, 9]);
    expect(
      pickMobileDualReadSecondaryChapterId({
        selectedId: "gone",
        primaryChapter: primary.find((c) => c.chapterNumber === 4),
        primaryChapters: primary,
        secondaryChapters: secondary,
        seedPair: { primaryId: "p-2", secondaryId: "s-6" },
      }),
    ).toBe("s-8");
  });

  test("waits for both lists and the current chapter", () => {
    expect(
      pickMobileDualReadSecondaryChapterId({
        selectedId: null,
        primaryChapter: primary[0],
        primaryChapters: primary,
        secondaryChapters: [],
      }),
    ).toBeNull();
    expect(
      pickMobileDualReadSecondaryChapterId({
        selectedId: null,
        primaryChapter: null,
        primaryChapters: primary,
        secondaryChapters: chapters("s", [1]),
      }),
    ).toBeNull();
  });

  test("uses the current chapter even before the primary list has loaded", () => {
    expect(
      pickMobileDualReadSecondaryChapterId({
        selectedId: null,
        primaryChapter: { id: "p-2", chapterNumber: 2 },
        primaryChapters: [],
        secondaryChapters: chapters("s", [1, 2, 3]),
      }),
    ).toBe("s-2");
  });
});

describe("Dual Read chapter row subtitles", () => {
  test("labels duplicate chapter rows with their scanlation group", () => {
    const list: ChapterSummary[] = [
      { id: "a", chapterNumber: 12, scanlator: "Alpha Scans", lang: "en" },
      { id: "b", chapterNumber: 12, scanlator: "Beta Team", lang: "en" },
      { id: "c", chapterNumber: 11, scanlator: "Alpha Scans", lang: "en" },
    ];
    const subtitles = mobileDualReadChapterRowSubtitles(list, en);
    expect(subtitles.get("a")).toBe("Alpha Scans · EN");
    expect(subtitles.get("b")).toBe("Beta Team · EN");
    // A chapter only one group released needs no disambiguation.
    expect(subtitles.has("c")).toBe(false);
  });

  test("falls back to language and chapter title without a group", () => {
    const list: ChapterSummary[] = [
      { id: "a", chapterNumber: 3, lang: "en", title: "The Ball" },
      { id: "b", chapterNumber: 3, lang: "fr", title: "Le Bal" },
    ];
    const subtitles = mobileDualReadChapterRowSubtitles(list, en);
    expect(subtitles.get("a")).toBe("EN · The Ball");
    expect(subtitles.get("b")).toBe("FR · Le Bal");
  });

  test("finds the selected row for scrolling", () => {
    const list = chapters("s", [1, 2, 3]);
    expect(mobileDualReadSelectedChapterIndex(list, "s-2")).toBe(1);
    expect(mobileDualReadSelectedChapterIndex(list, null)).toBe(-1);
    expect(mobileDualReadSelectedChapterIndex(list, "missing")).toBe(-1);
  });
});
