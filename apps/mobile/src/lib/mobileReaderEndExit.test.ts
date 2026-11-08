import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  MOBILE_READER_LAST_PAGE,
  mobileContinueReaderPage,
  mobileReaderExitsAtEnd,
} from "./mobileReaderEndExit";

const atTheEnd = {
  chaptersKnown: true,
  hasNextChapter: false,
  pagesReady: true,
  visiblePageFailed: false,
};

describe("past the last page of the last chapter", () => {
  test("the reader closes", () => {
    expect(mobileReaderExitsAtEnd(atTheEnd)).toBe(true);
  });

  test("a next chapter, one added since included, is read on instead", () => {
    expect(mobileReaderExitsAtEnd({ ...atTheEnd, hasNextChapter: true })).toBe(false);
  });

  test("not before the chapter list is in (a missing neighbour is not yet known to be absent)", () => {
    expect(mobileReaderExitsAtEnd({ ...atTheEnd, chaptersKnown: false })).toBe(false);
  });

  test("a chapter still loading, or a page on screen that failed, never closes the reader", () => {
    expect(mobileReaderExitsAtEnd({ ...atTheEnd, pagesReady: false })).toBe(false);
    expect(mobileReaderExitsAtEnd({ ...atTheEnd, visiblePageFailed: true })).toBe(false);
  });
});

describe("Continue when caught up", () => {
  test("opens the finished chapter at its last page, never page 1", () => {
    expect(mobileContinueReaderPage({ caughtUp: true })).toBe(MOBILE_READER_LAST_PAGE);
  });

  test("otherwise the reader's own resume position", () => {
    expect(mobileContinueReaderPage({ caughtUp: false })).toBeUndefined();
    expect(mobileContinueReaderPage({})).toBeUndefined();
  });
});

const read = (file: string) => readFileSync(path.join(import.meta.dir, "..", file), "utf8");

function slice(source: string, start: string, end: string) {
  const from = source.indexOf(start);
  expect(from).toBeGreaterThanOrEqual(0);
  const to = source.indexOf(end, from + start.length);
  expect(to).toBeGreaterThan(from);
  return source.slice(from, to);
}

describe("reader wiring", () => {
  const reader = read("screens/ReaderScreen.tsx");

  test("the exit saves the chapter complete, then closes exactly as Back does", () => {
    const exit = slice(reader, "const exitReaderAtEnd = useCallback(", "const showEndOfChapterPrompt");
    expect(exit).toMatch(/persistEndOfChapterCompletion\(\)\.then\(\(persisted\) => \{\s*if \(persisted\) \{\s*navigateBack\(\);/);
    // Not saved: the card with its error and retry, never a silent close.
    expect(exit).toContain("setEndOfChapterPromptVisible(true);");
  });

  test("every forward turn past the end (step, paged and slide/curl drag) goes through the prompt, which exits first", () => {
    const prompt = slice(reader, "const showEndOfChapterPrompt = useCallback(", "}, [");
    const sheetCheck = prompt.indexOf("skipped (a sheet is open)");
    const exit = prompt.indexOf("if (readerExitsAtEndRef.current) {");
    expect(sheetCheck).toBeGreaterThan(0);
    expect(exit).toBeGreaterThan(sheetCheck);
    expect(prompt.indexOf("setEndOfChapterPromptVisible(true)")).toBeGreaterThan(exit);
  });

  test("scrolling past the caught-up divider exits too", () => {
    const caughtUp = slice(reader, "const completeReaderStripCaughtUp = useCallback(", "const stepContinuousReaderAccessibility");
    expect(caughtUp).toMatch(/if \(readerExitsAtEndRef\.current\) \{\s*exitReaderAtEnd\("strip-caught-up"\);\s*return true;/);
  });

  test("the gate reads the chapter list, the next chapter, the pages and the page failures", () => {
    expect(reader).toMatch(
      /mobileReaderExitsAtEnd\(\{\s*chaptersKnown: readerChaptersKnown,\s*hasNextChapter: Boolean\(nextChapterInReadingOrder\),\s*pagesReady: pagesState\.status === "ready",\s*visiblePageFailed: readerVisibleFailures\.length > 0,\s*\}\)/,
    );
  });

  test("both detail pages open a caught-up Continue at the last page", () => {
    expect(read("screens/MangaDetailScreen.tsx")).toContain(
      "openReader(continueChapter, continueSource, mobileContinueReaderPage(continueAction))",
    );
    expect(read("screens/SourceMangaScreen.tsx")).toContain(
      "openReader(continueChapter, mobileContinueReaderPage(continueTarget))",
    );
  });
});
