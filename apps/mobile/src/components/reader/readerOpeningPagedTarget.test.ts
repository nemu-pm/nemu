import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  READER_OPENING_PAGED_HOLD_MAX_MS,
  resolveReaderOpeningPagedTarget,
} from "./readerOpeningHold";

const appDir = path.join(import.meta.dir, "../../..");
const route = readFileSync(
  path.join(appDir, "app/sources/[registryId]/[sourceId]/[mangaId]/[chapterId].tsx"),
  "utf8",
);
const reader = readFileSync(path.join(appDir, "src/screens/ReaderScreen.tsx"), "utf8");

describe("paged opening: the cover gives way to the page the pager opens on", () => {
  test("before the restore: the restore target, not the counter's page 1", () => {
    expect(
      resolveReaderOpeningPagedTarget({ restoreComplete: false, restorePageIndex: 8, currentPageIndex: 0, pageCount: 10 }),
    ).toBe(8);
  });

  test("after the restore: the page the reader is on", () => {
    expect(
      resolveReaderOpeningPagedTarget({ restoreComplete: true, restorePageIndex: 8, currentPageIndex: 3, pageCount: 10 }),
    ).toBe(3);
  });

  test("clamped to the chapter; nothing without pages", () => {
    expect(
      resolveReaderOpeningPagedTarget({ restoreComplete: false, restorePageIndex: 40, currentPageIndex: 0, pageCount: 8 }),
    ).toBe(7);
    expect(
      resolveReaderOpeningPagedTarget({ restoreComplete: false, restorePageIndex: 0, currentPageIndex: 0, pageCount: 0 }),
    ).toBeNull();
  });

  test("the reader reveals on the target's decode and decodes around it before the restore", () => {
    expect(reader).toContain("readerImageSizes.has(readerOpeningPagedTargetIdentity)");
    expect(reader).not.toContain("readerImageSizes.has(currentDisplayedPageIdentity) ||\n        readerImageErrors.has(currentDisplayedPageIdentity)));");
    expect(reader).toContain(
      "currentPageIndex: galleryPagedMode ? (readerOpeningPagedTargetIndex ?? clampedPageIndex) : clampedPageIndex,",
    );
  });

  test("hard cap 2.5 s, armed on the UI thread from the landing (paged and scroll)", () => {
    expect(READER_OPENING_PAGED_HOLD_MAX_MS).toBe(2500);
    expect(route).toContain("const COVER_HOLD_MAX_MS = READER_OPENING_PAGED_HOLD_MAX_MS;");
    expect(route).toContain('else if (modeRef.current.pagedReading) armCap("hold-max");');
    expect(route).toContain('else if (pagedReading) armCap("hold-max");');
    expect(route).toContain("const COVER_REVEAL_MS = 250;");
  });
});
