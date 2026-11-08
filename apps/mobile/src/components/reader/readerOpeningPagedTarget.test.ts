import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  READER_OPENING_PAGED_HOLD_MAX_MS,
  resolveReaderCoverCapDelay,
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
    expect(reader).toContain("readerOpeningPagedTargetPages.every((page) => {");
    expect(reader).toContain("readerImageSizes.has(identity) || readerImageErrors.has(identity)");
    expect(reader).not.toContain("readerImageSizes.has(currentDisplayedPageIdentity) ||\n        readerImageErrors.has(currentDisplayedPageIdentity)));");
    expect(reader).toContain(
      "currentPageIndex: galleryPagedMode ? (readerOpeningPagedTargetIndex ?? clampedPageIndex) : clampedPageIndex,",
    );
  });

  test("no cap fades the cover onto an unready reader: the loading screen waits for the page (with a long backstop)", () => {
    expect(READER_OPENING_PAGED_HOLD_MAX_MS).toBe(2500);
    expect(route).not.toContain("COVER_HOLD_MAX_MS");
    expect(route).not.toContain("armCap(");
    expect(route).toContain("landedAt + READER_OPENING_LOADING_BACKSTOP_MS - Date.now()");
    expect(route).toContain("const COVER_REVEAL_MS = 250;");
  });

  test("the cap is counted from the tap: the cover is gone 2.5 s after it, not 2.5 s after the landing", () => {
    // Tap at 0, the zoom lands at 500: the fade starts at 2250 and ends at 2500.
    expect(resolveReaderCoverCapDelay({ tapAt: 0, landedAt: 500, now: 500, capMs: 2500, fadeMs: 250 })).toBe(1750);
    // Armed late (the mode arrived at 1800): only the time left.
    expect(resolveReaderCoverCapDelay({ tapAt: 0, landedAt: 500, now: 1800, capMs: 2500, fadeMs: 250 })).toBe(450);
    // Already past the deadline: fade at once.
    expect(resolveReaderCoverCapDelay({ tapAt: 0, landedAt: 2600, now: 2600, capMs: 2500, fadeMs: 250 })).toBe(0);
    // No tap known (or a tap clock after the landing): from the landing.
    expect(resolveReaderCoverCapDelay({ tapAt: null, landedAt: 500, now: 500, capMs: 2500, fadeMs: 250 })).toBe(2250);
    expect(resolveReaderCoverCapDelay({ tapAt: 900, landedAt: 500, now: 500, capMs: 2500, fadeMs: 250 })).toBe(2250);
  });

  test("the route's hold cap uses the tap deadline", () => {
    expect(route.match(/resolveReaderCoverCapDelay\(\{/g)?.length).toBe(1);
    expect(route).not.toContain("COVER_HOLD_MAX_MS - (Date.now() - landedAt)");
    expect(route).not.toContain("}, COVER_HOLD_MAX_MS);");
  });

  test("the target page's own load event releases the cover synchronously", () => {
    expect(reader).toContain("if (!neighbour) releaseReaderOpeningOnDecode(page.id);");
    const start = reader.indexOf("const releaseReaderOpeningOnDecode = useCallback(");
    const block = reader.slice(start, reader.indexOf("}, []);", start));
    expect(block).toContain("if (!readerOpeningPagedTargetIdsRef.current.includes(pageId)) return;");
    expect(block).toContain("readerZoomEntryRef.current.onFirstPage();");
  });
});
