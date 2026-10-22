import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const reader = readFileSync(
  path.join(import.meta.dir, "..", "screens/ReaderScreen.tsx"),
  "utf8",
);

function slice(start: string, end: string) {
  const from = reader.indexOf(start);
  expect(from).toBeGreaterThanOrEqual(0);
  const to = reader.indexOf(end, from + start.length);
  expect(to).toBeGreaterThan(from);
  return reader.slice(from, to);
}

const caughtUp = () =>
  slice("const completeReaderStripCaughtUp = useCallback(", "const stepContinuousReaderAccessibility");

describe("seamless scroll: past the last available chapter", () => {
  test("only the strip's true end (last segment, caught-up tail) counts", () => {
    expect(caughtUp()).toMatch(
      /!readerStrip \|\|\s*readerStrip\.currentIndex !== readerStrip\.segments\.length - 1 \|\|\s*readerStrip\.tail\?\.kind !== "end"\s*\) \{\s*return false;/,
    );
    // The strip only exists in seamless scroll mode.
    expect(reader).toMatch(
      /const readerSeamlessEnabled =\s*readerSeamlessScroll &&\s*mode === "scrolling" &&\s*!galleryPagedMode/,
    );
  });

  test("the chapter is marked complete as the card would (once per chapter, silently, retried if it fails), no card", () => {
    const helper = caughtUp();
    expect(helper).toMatch(
      /persistProgressRef\.current\(true, visibleProgressPageIndex, \{\s*silent: true,\s*\}\)/,
    );
    expect(helper).toContain("if (readerStripCaughtUpCompletedRef.current === chapterId) return true;");
    expect(helper).toContain("readerStripCaughtUpCompletedRef.current = chapterId;");
    expect(helper).toMatch(/\.catch\(\(\) => \{[\s\S]*?readerStripCaughtUpCompletedRef\.current = null;/);
    expect(helper).not.toContain("setEndOfChapterPromptVisible");
    expect(helper).not.toContain("showEndOfChapterPrompt");
  });

  test("pulling past the end shows the card only when not at the caught-up end", () => {
    const handler = slice(
      "const onGalleryRequestAdvancePastEnd = useCallback(() => {",
      "const onGalleryRequestRetreatPastStart",
    );
    expect(handler).toMatch(
      /if \(tail\?\.kind === "next" && \(tail\.status === "idle" \|\| tail\.status === "loading"\)\) return;/,
    );
    expect(handler).toMatch(
      /if \(completeReaderStripCaughtUp\(\)\) return;\s*showEndOfChapterPrompt\(\);/,
    );
  });

  test("the accessibility next action and the book / laptop page buttons follow the same rule", () => {
    const accessibility = slice(
      "const stepContinuousReaderAccessibility = useCallback(",
      "// Book / laptop posture page controls",
    );
    const screenStep = slice(
      "const stepReaderScrollScreen = useCallback(",
      "// Book / laptop posture side pane",
    );
    for (const step of [accessibility, screenStep]) {
      expect(step).toContain(
        'if (direction === "next" && !completeReaderStripCaughtUp()) showEndOfChapterPrompt();',
      );
      expect(step).not.toContain('if (direction === "next") showEndOfChapterPrompt();');
      expect(step).toContain("completeReaderStripCaughtUp,");
    }
    // The book pane's page buttons are the screen steps (they reach the
    // list's end, the divider, and stay there).
    expect(reader).toContain("onStep={stepReaderScrollScreen}");
  });
});
