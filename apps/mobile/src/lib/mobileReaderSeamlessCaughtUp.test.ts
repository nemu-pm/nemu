import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const reader = readFileSync(
  path.join(import.meta.dir, "..", "screens/ReaderScreen.tsx"),
  "utf8",
);

function advancePastEnd() {
  const start = reader.indexOf("const onGalleryRequestAdvancePastEnd = useCallback(() => {");
  expect(start).toBeGreaterThanOrEqual(0);
  const end = reader.indexOf("const onGalleryRequestRetreatPastStart", start);
  expect(end).toBeGreaterThan(start);
  return reader.slice(start, end);
}

describe("seamless scroll: past the last available chapter", () => {
  test("the caught-up divider stands alone: no end-of-chapter card", () => {
    const handler = advancePastEnd();
    // The strip's true end returns before the card is shown.
    expect(handler).toMatch(
      /if \(tail\?\.kind === "end"\) \{[\s\S]*?return;\s*\}\s*\}\s*showEndOfChapterPrompt\(\);/,
    );
    const endBranch = handler.slice(handler.indexOf('if (tail?.kind === "end") {'));
    expect(endBranch.slice(0, endBranch.indexOf("showEndOfChapterPrompt();"))).not.toContain(
      "setEndOfChapterPromptVisible",
    );
  });

  test("the chapter is still marked complete (once per chapter, silently, retried if it fails)", () => {
    const handler = advancePastEnd();
    expect(handler).toMatch(
      /persistProgressRef\.current\(true, visibleProgressPageIndex, \{\s*silent: true,\s*\}\)/,
    );
    expect(handler).toContain("if (readerStripCaughtUpCompletedRef.current === chapterId) return;");
    expect(handler).toContain("readerStripCaughtUpCompletedRef.current = chapterId;");
    expect(handler).toMatch(/\.catch\(\(\) => \{[\s\S]*?readerStripCaughtUpCompletedRef\.current = null;/);
  });

  test("a failed or locked next chapter, and every list without a strip (paged, non-seamless), keep the card", () => {
    const handler = advancePastEnd();
    expect(handler).toMatch(
      /if \(tail\?\.kind === "next" && \(tail\.status === "idle" \|\| tail\.status === "loading"\)\) return;/,
    );
    // Without a strip the handler falls straight through to the card.
    expect(handler).toMatch(/const strip = readerStripRef\.current\.strip;\s*if \(strip\) \{/);
    // The strip only exists in seamless scroll mode.
    expect(reader).toMatch(
      /const readerSeamlessEnabled =\s*readerSeamlessScroll &&\s*mode === "scrolling" &&\s*!galleryPagedMode/,
    );
  });
});
