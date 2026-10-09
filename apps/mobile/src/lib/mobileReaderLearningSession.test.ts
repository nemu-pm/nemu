import { describe, expect, test } from "bun:test";
import { mobileReaderLearningPageResetKey } from "./mobileReaderLearningSession";

const base = { registryId: "r", sourceId: "s", chapterId: "c", pageKey: "p1" };

describe("learning session reset keys", () => {
  test("page-scoped tools always follow the page", () => {
    expect(mobileReaderLearningPageResetKey(base)).not.toBe(mobileReaderLearningPageResetKey({ ...base, pageKey: "p2" }));
    expect(mobileReaderLearningPageResetKey(base)).not.toBe(mobileReaderLearningPageResetKey({ ...base, chapterId: "c2" }));
  });

  test("the reader keys the reset on page ids, not image URLs or headers", async () => {
    // A page's image URL / headers can be rewritten while it stays on screen
    // (page processor, background page-list refresh with re-signed URLs).
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const screen = readFileSync(path.join(import.meta.dir, "..", "screens", "ReaderScreen.tsx"), "utf8");
    const start = screen.indexOf("const japaneseLearningPageResetKey = mobileReaderLearningPageResetKey({");
    expect(start).toBeGreaterThan(-1);
    expect(screen.slice(start, screen.indexOf("});", start))).toContain("pageKey: japaneseLearningVisiblePageIdsKey");
    expect(screen).toMatch(/japaneseLearningVisiblePageIdsKey = JSON\.stringify\(\s*japaneseLearningVisiblePages\.map\(\(page\) => page\.id\)/);
  });
});
