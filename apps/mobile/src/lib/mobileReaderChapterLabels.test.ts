import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ChapterSummary } from "@/data/schema";
import { formatChapterRowLabel, formatChapterRowTitle } from "@/lib/formatChapter";
import { getMobileStrings } from "@/lib/mobileI18n";
import { buildMobileReaderMoreMenu, mobileReaderChapterNeighbourLabel } from "@/lib/mobileReaderMoreMenu";

const strings = getMobileStrings("en");
const reader = readFileSync(path.join(import.meta.dir, "../screens/ReaderScreen.tsx"), "utf8");
const row = readFileSync(path.join(import.meta.dir, "../components/explore/MobileExploreChapterRow.tsx"), "utf8");

describe("the chapter capsule says the chapter as its list row does", () => {
  test("a numbered chapter: Chapter 35 (the source's title stays the row's subtitle)", () => {
    const chapter = { id: "c35", chapterNumber: 35, title: "The Healers" } as ChapterSummary;
    expect(formatChapterRowTitle(chapter, strings, { dropVolume: false })).toBe("Chapter 35");
  });

  test("a chapter with only a title: its title", () => {
    const chapter = { id: "x", title: "Prologue" } as ChapterSummary;
    expect(formatChapterRowTitle(chapter, strings, { dropVolume: false })).toBe("Prologue");
  });

  test("the volume is left to the list's header when it has one", () => {
    const chapter = { id: "v", chapterNumber: 12, volumeNumber: 2 } as ChapterSummary;
    expect(formatChapterRowTitle(chapter, strings, { dropVolume: true })).toBe("Chapter 12");
    expect(formatChapterRowTitle(chapter, strings, { dropVolume: false })).not.toBe("Chapter 12");
  });

  test("no label: null (the capsule then shows the manga title)", () => {
    expect(formatChapterRowLabel({ id: "bare" } as ChapterSummary, strings, { dropVolume: false })).toBeNull();
  });

  test("the row and both reader capsules make the same call", () => {
    expect(row).toContain("formatChapterRowTitle(chapter, strings, { dropVolume })");
    expect(reader).toContain("formatChapterRowLabel(chapter, strings, { dropVolume: readerChapterListDropsVolume })");
    expect(reader).toContain(
      "formatChapterRowTitle(arriving.chapter, strings, { dropVolume: readerChapterListDropsVolume })",
    );
  });
});

describe("previous / next chapter controls before the chapter list is in", () => {
  test("neutral while unknown, 'No …' only once the list says so", () => {
    expect(mobileReaderChapterNeighbourLabel("next", null, false, strings)).toBe("Next chapter");
    expect(mobileReaderChapterNeighbourLabel("previous", null, false, strings)).toBe("Previous chapter");
    expect(mobileReaderChapterNeighbourLabel("next", null, true, strings)).toBe("No next chapter");
    expect(mobileReaderChapterNeighbourLabel("previous", null, true, strings)).toBe("No previous chapter");
  });

  test("the more menu says the same", () => {
    const sections = buildMobileReaderMoreMenu({
      strings,
      previousChapter: null,
      nextChapter: null,
      chaptersKnown: false,
      pagesStatus: "loading",
      pageCount: 0,
      completed: false,
      saving: false,
      showPlugins: false,
    });
    const items = sections.flatMap((section) => section.items);
    expect(items.find((item) => item.id === "next-chapter")?.accessibilityLabel).toBe("Next chapter");
    expect(items.find((item) => item.id === "previous-chapter")?.accessibilityLabel).toBe("Previous chapter");
  });

  test("the scrubber's buttons use it with the list's state", () => {
    expect(reader).toContain("const readerChaptersKnown = readerChapters.length > 0;");
    expect(reader).not.toContain("strings.reader.noNextChapter");
  });
});
