import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dir, "..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const reader = read("screens/ReaderScreen.tsx");

describe("finishing a chapter is a plain turn", () => {
  test("no finishing moment: no chapter-finished capsule, no celebration", () => {
    expect(reader).not.toContain("ExploreChapterFinishedToast");
    expect(reader).not.toContain("markMobileChapterFinished");
    expect(reader).not.toContain("chapterCompleteCelebration");
    expect(existsSync(path.join(root, "components/explore/ExploreChapterFinishedToast.tsx"))).toBe(false);
    expect(read("components/reader/MobileReaderEndOfChapterOverlay.tsx")).not.toContain("celebration");
    expect(read("screens/SettingsScreen.tsx")).not.toContain("chapterCompleteFeedback");
  });

  test("a seamless paged crossing shows no chapter capsule", () => {
    expect(reader).not.toContain("ReaderChapterCrossingCapsule");
    expect(existsSync(path.join(root, "components/reader/ReaderChapterCrossingCapsule.tsx"))).toBe(false);
  });

  test("past the last page with a next chapter: saved complete, then straight on into it", () => {
    const from = reader.indexOf("const showEndOfChapterPrompt = useCallback(");
    const prompt = reader.slice(from, reader.indexOf("}, [", from));
    expect(prompt).toMatch(
      /if \(nextChapterInReadingOrder\) \{\s*void persistEndOfChapterCompletion\(\)\.then\(\(persisted\) => \{\s*if \(persisted\) \{\s*goToChapter\(nextChapterInReadingOrder, \{ startAt: "start" \}\);/,
    );
    expect(prompt).not.toContain("hapticConfirm");
  });
});
