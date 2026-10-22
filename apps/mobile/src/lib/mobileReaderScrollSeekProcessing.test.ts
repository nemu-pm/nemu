import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

function readSource(relativePath: string) {
  return readFileSync(path.join(import.meta.dir, "..", relativePath), "utf8");
}

const reader = readSource("screens/ReaderScreen.tsx");
const strip = readSource("components/reader/useReaderChapterStrip.ts");

function block(source: string, start: string, end: string) {
  const from = source.indexOf(start);
  expect(from).toBeGreaterThanOrEqual(0);
  const to = source.indexOf(end, from + start.length);
  expect(to).toBeGreaterThan(from);
  return source.slice(from, to);
}

describe("scroll mode: a scrubber jump processes its target pages", () => {
  const visiblePageChange = block(
    reader,
    "const onScrollingVisiblePageChange = useCallback(",
    "/** Scroll mode: the list came to rest on a page seek's exact offset. */",
  );

  test("the page top-up after a commit follows an armed page seek, not the stale live ref", () => {
    const topUpEffect = block(
      reader,
      'if (galleryPagedMode || pagesState.status !== "ready") return;\n    // A page seek in flight',
      "]);",
    );
    expect(topUpEffect).toContain("readerProgrammaticScrollRef.current");
    expect(topUpEffect).toMatch(
      /programmaticTarget\?\.kind === "page"\s*\?\s*programmaticTarget\.pageIndex\s*:\s*scrollingVisiblePageIndexRef\.current/,
    );
  });

  test("the list's report during a seek tops up from the reported page", () => {
    // Before the early return for a page that is not (yet) the target.
    expect(visiblePageChange).toMatch(
      /scrollingVisiblePageIndexRef\.current = nextPageIndex;\s*\/\/[^\n]*\n\s*\/\/[^\n]*\n\s*if \(requestedPageIndex != null\) \{\s*readerScrollPrefetchTopUpRef\.current\(nextPageIndex\);\s*\}\s*if \(requestedPageIndex != null && nextPageIndex !== requestedPageIndex\) \{\s*return;/,
    );
    // The same-page report that only clears the seek tops up too.
    expect(visiblePageChange).toMatch(
      /if \(scrollingVisiblePageIndexRef\.current === nextPageIndex\) \{\s*if \(requestedPageIndex === nextPageIndex\) \{\s*clearReaderProgrammaticScroll\(\);[\s\S]*?readerScrollPrefetchTopUpRef\.current\(nextPageIndex\);[\s\S]*?\}\s*return;/,
    );
  });

  test("a restore that lands processes from the restored page", () => {
    const finishLanding = block(reader, "const finishReaderScrollLanding = useCallback(", "const armReaderScrollLanding");
    expect(finishLanding).toContain("readerScrollPrefetchTopUpRef.current(landing.pageIndex);");
  });

  test("goToPage leaves the live page ref alone (a failed seek still reports where the list is)", () => {
    const goToPage = block(reader, "const goToPage = useCallback(", "const onScrollingPageLayout");
    expect(goToPage).not.toContain("scrollingVisiblePageIndexRef.current =");
  });
});

describe("scroll mode: a prepend held back by a seek lands once it is allowed", () => {
  test("the strip exposes a recheck that reads its inputs through refs", () => {
    expect(strip).toContain("const recheckPrevious = useCallback(() => {");
    expect(strip).toContain("prependInputsRef.current = { live, current, currentLocalIndex };");
    expect(strip).toMatch(/recheckPrevious,\s*retryNext,/);
    // The effect keeps prepending on its own triggers through the same check.
    expect(strip).toMatch(/recheckPrevious\(\);\s*\}, \[chapters, current, currentLocalIndex, fetchSegment, live, recheckPrevious, state\]\);/);
    // A second call before the render does not fetch the chapter twice.
    expect(strip).toMatch(/fetchSegment\(previous, "previous"\);[\s\S]{0,200}stateRef\.current = \{\s*\.\.\.stateRef\.current,\s*previous: \{ chapterId: previous\.id, status: "loading" \},/);
  });

  test("a drag and a landed seek recheck the prepend after the seek is cleared", () => {
    expect(reader).toContain("const recheckReaderStripPrevious = readerChapterStrip.recheckPrevious;");
    const begin = block(reader, "const beginReaderUserScroll = useCallback(() => {", "/** Seamless scroll: the chapter just opened");
    expect(begin).toMatch(
      /readerStripUserScrolledRef\.current = true;[\s\S]*?recheckReaderStripPrevious\(\);/,
    );
    expect(begin.indexOf("clearReaderProgrammaticScroll();")).toBeLessThan(
      begin.indexOf("recheckReaderStripPrevious();"),
    );
    const visiblePageChange = block(
      reader,
      "const onScrollingVisiblePageChange = useCallback(",
      "/** Scroll mode: the list came to rest on a page seek's exact offset. */",
    );
    expect(visiblePageChange).toMatch(
      /clearReaderProgrammaticScroll\(\);\s*recheckReaderStripPrevious\(\);/,
    );
    expect(visiblePageChange).toContain("recheckReaderStripPrevious,");
  });
});
