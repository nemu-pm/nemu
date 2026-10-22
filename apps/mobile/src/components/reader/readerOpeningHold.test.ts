import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  canHoldReaderOpening,
  readerOpeningSince,
  readerPagesNeedProcessing,
  resolveReaderFirstScreenImages,
  resolveReaderFirstScreenIndexes,
  resolveReaderImageProcessor,
  resolveReaderOpeningHoldDelay,
  resolveReaderProcessedSourceOpening,
  shouldHoldReaderOpeningForImages,
  shouldRetakeReaderFirstScreen,
  shouldRevealReaderCover,
  READER_FIRST_SCREEN_MAX_RETAKES,
  READER_OPENING_IMAGE_HOLD_MAX_MS,
  READER_PROCESSED_SOURCE_OPENING_KEY,
} from "./readerOpeningHold";

describe("readerOpeningHold", () => {
  test("the switch: the first valid value wins, hold by default", () => {
    expect(resolveReaderProcessedSourceOpening()).toBe("hold");
    expect(resolveReaderProcessedSourceOpening(undefined, undefined)).toBe("hold");
    expect(resolveReaderProcessedSourceOpening("hold")).toBe("hold");
    expect(resolveReaderProcessedSourceOpening(" HOLD ")).toBe("hold");
    // The runtime default beats the build's env.
    expect(resolveReaderProcessedSourceOpening("defer", "hold")).toBe("defer");
    expect(resolveReaderProcessedSourceOpening(undefined, "hold")).toBe("hold");
    expect(resolveReaderProcessedSourceOpening("bogus", 1, "hold")).toBe("hold");
    expect(resolveReaderProcessedSourceOpening("bogus")).toBe("hold");
    expect(resolveReaderProcessedSourceOpening(undefined, "defer")).toBe("defer");
    expect(READER_PROCESSED_SOURCE_OPENING_KEY).toBe("NEMU_READER_PROCESSED_SOURCE_OPENING");
  });

  test("pages need processing while one with an image is still pending", () => {
    expect(readerPagesNeedProcessing([{ imageUri: "https://a/1.jpg", imageProcessing: "pending" }])).toBe(true);
    expect(readerPagesNeedProcessing([{ imageUri: "https://a/1.jpg", imageProcessing: "ready" }])).toBe(false);
    expect(readerPagesNeedProcessing([{ imageUri: "https://a/1.jpg" }])).toBe(false);
    expect(readerPagesNeedProcessing([{ imageProcessing: "pending" }])).toBe(false);
    expect(readerPagesNeedProcessing([])).toBe(false);
  });

  test("only hold, for a source known to process its images, with pages to process and the cover up, holds", () => {
    const base = {
      opening: "hold" as const,
      imageProcessor: true as boolean | null,
      pagesNeedProcessing: true,
      openingSettled: false,
    };
    expect(shouldHoldReaderOpeningForImages(base)).toBe(true);
    // An ordinary remote source (ToG: pending until its request resolves) or
    // an unknown one is never slowed.
    expect(shouldHoldReaderOpeningForImages({ ...base, imageProcessor: false })).toBe(false);
    expect(shouldHoldReaderOpeningForImages({ ...base, imageProcessor: null })).toBe(false);
    expect(shouldHoldReaderOpeningForImages({ ...base, opening: "defer" })).toBe(false);
    expect(shouldHoldReaderOpeningForImages({ ...base, pagesNeedProcessing: false })).toBe(false);
    expect(shouldHoldReaderOpeningForImages({ ...base, openingSettled: true })).toBe(false);
  });

  test("the processor signal: the page list's record, else the source's, else unknown", () => {
    expect(resolveReaderImageProcessor({ listed: true, sourceRecord: false })).toEqual({
      imageProcessor: true,
      reason: "page-list",
    });
    expect(resolveReaderImageProcessor({ listed: false, sourceRecord: true })).toEqual({
      imageProcessor: false,
      reason: "page-list",
    });
    expect(resolveReaderImageProcessor({ listed: undefined, sourceRecord: true })).toEqual({
      imageProcessor: true,
      reason: "source-record",
    });
    expect(resolveReaderImageProcessor({ listed: undefined, sourceRecord: null })).toEqual({
      imageProcessor: null,
      reason: "unknown",
    });
  });

  test("the first screen: the viewport's pages when it holds the placed page, else the placed page filling a screen", () => {
    const heights = (index: number) => [600, 600, 600, 600, 600, 600][index] ?? 600;
    expect(
      resolveReaderFirstScreenIndexes({
        pageCount: 6,
        currentIndex: 2,
        viewportRange: { first: 2, last: 3 },
        viewportHeight: 900,
        pageHeight: heights,
      }),
    ).toEqual([2, 3]);
    // A viewport elsewhere (not reported yet / other coordinates): from the placed page.
    expect(
      resolveReaderFirstScreenIndexes({
        pageCount: 6,
        currentIndex: 2,
        viewportRange: { first: 0, last: 0 },
        viewportHeight: 900,
        pageHeight: heights,
      }),
    ).toEqual([2, 3]);
    expect(
      resolveReaderFirstScreenIndexes({
        pageCount: 6,
        currentIndex: 5,
        viewportRange: null,
        viewportHeight: 900,
        pageHeight: heights,
      }),
    ).toEqual([5]);
    // Short pages: at most four.
    expect(
      resolveReaderFirstScreenIndexes({
        pageCount: 10,
        currentIndex: 0,
        viewportRange: null,
        viewportHeight: 5000,
        pageHeight: () => 100,
      }),
    ).toEqual([0, 1, 2, 3]);
    expect(
      resolveReaderFirstScreenIndexes({
        pageCount: 0,
        currentIndex: 0,
        viewportRange: null,
        viewportHeight: 900,
        pageHeight: heights,
      }),
    ).toEqual([]);
  });

  test("a first screen that lost the current page (taken before the resume seek) is taken again, a few times at most", () => {
    // r16 ToG: measured at page 0, the reader opened at p19.
    expect(shouldRetakeReaderFirstScreen({ currentPageId: "p19", firstScreenPageIds: ["p0"], retakes: 0 })).toBe(true);
    expect(shouldRetakeReaderFirstScreen({ currentPageId: "p19", firstScreenPageIds: ["p18", "p19"], retakes: 0 })).toBe(false);
    expect(
      shouldRetakeReaderFirstScreen({
        currentPageId: "p19",
        firstScreenPageIds: ["p0"],
        retakes: READER_FIRST_SCREEN_MAX_RETAKES,
      }),
    ).toBe(false);
    // Paged reading (no current page id here) never retakes.
    expect(shouldRetakeReaderFirstScreen({ currentPageId: null, firstScreenPageIds: ["p0"], retakes: 0 })).toBe(false);
  });

  test("the hold re-arms a pending fade, never one running or about to start", () => {
    expect(canHoldReaderOpening({ fadeStartsAt: null, now: 1000 })).toBe(true);
    expect(canHoldReaderOpening({ fadeStartsAt: 1400, now: 1000 })).toBe(true);
    expect(canHoldReaderOpening({ fadeStartsAt: 1030, now: 1000 })).toBe(false);
    expect(canHoldReaderOpening({ fadeStartsAt: 900, now: 1000 })).toBe(false);
  });

  test("the hold's cap counts from the landing", () => {
    expect(READER_OPENING_IMAGE_HOLD_MAX_MS).toBe(2500);
    expect(resolveReaderOpeningHoldDelay({ landedAt: 1000, now: 1300 })).toBe(2200);
    expect(resolveReaderOpeningHoldDelay({ landedAt: 1000, now: 4000 })).toBe(0);
  });

  test("holding, only the first screen's images replace the cap; a running fade is left be", () => {
    const pending = { fadeStartsAt: 3500, now: 1000 };
    // defer: "reader ready" replaces the scroll cap, as before.
    expect(shouldRevealReaderCover({ reason: "reader-ready", holding: false, ...pending })).toBe(true);
    expect(shouldRevealReaderCover({ reason: "hold-max", holding: false, ...pending })).toBe(false);
    expect(shouldRevealReaderCover({ reason: "hold-max", holding: false, fadeStartsAt: null, now: 1000 })).toBe(true);
    // hold
    expect(shouldRevealReaderCover({ reason: "reader-ready", holding: true, ...pending })).toBe(false);
    expect(shouldRevealReaderCover({ reason: "reader-ready", holding: true, fadeStartsAt: null, now: 1000 })).toBe(false);
    expect(shouldRevealReaderCover({ reason: "first-screen-images", holding: true, ...pending })).toBe(true);
    expect(shouldRevealReaderCover({ reason: "hold-max", holding: true, ...pending })).toBe(false);
    // Running.
    expect(shouldRevealReaderCover({ reason: "first-screen-images", holding: true, fadeStartsAt: 900, now: 1000 })).toBe(false);
  });

  test("the first screen is ready once each page painted or failed", () => {
    const painted = { hasImage: true, processingPending: false, failed: false, painted: true };
    const plate = { hasImage: true, processingPending: true, failed: false, painted: false };
    const loading = { hasImage: true, processingPending: false, failed: false, painted: false };
    const failed = { hasImage: true, processingPending: false, failed: true, painted: false };
    const text = { hasImage: false, processingPending: false, failed: false, painted: false };
    expect(resolveReaderFirstScreenImages([painted, painted])).toEqual({ ready: true, pages: 2, painted: 2, failed: 0 });
    expect(resolveReaderFirstScreenImages([painted, plate]).ready).toBe(false);
    expect(resolveReaderFirstScreenImages([painted, loading]).ready).toBe(false);
    expect(resolveReaderFirstScreenImages([painted, failed])).toEqual({ ready: true, pages: 2, painted: 1, failed: 1 });
    expect(resolveReaderFirstScreenImages([text]).ready).toBe(true);
    expect(resolveReaderFirstScreenImages([]).ready).toBe(false);
    // A size remembered for a pending page is not its real image.
    expect(resolveReaderFirstScreenImages([{ ...plate, painted: true }]).ready).toBe(false);
  });

  test("since… fields are null until their moment", () => {
    expect(readerOpeningSince({ tapAt: 1000, landedAt: 1400, fadeEndAt: null }, 2000.4)).toEqual({
      sinceTapMs: 1000,
      sinceLandedMs: 600,
      sinceFadeEndMs: null,
    });
  });
});

describe("readerOpeningHold wiring", () => {
  const mobileRoot = path.join(import.meta.dir, "../../..");
  const reader = readFileSync(path.join(mobileRoot, "src/screens/ReaderScreen.tsx"), "utf8");
  const route = readFileSync(
    path.join(mobileRoot, "app/sources/[registryId]/[sourceId]/[mangaId]/[chapterId].tsx"),
    "utf8",
  );
  const flag = readFileSync(path.join(mobileRoot, "src/lib/mobileReaderProcessedSourceOpening.ts"), "utf8");
  const handoff = readFileSync(path.join(mobileRoot, "src/components/explore/mobileExploreCover.ts"), "utf8");

  test("the switch reads the iOS user default (launch argument) over the build's env", () => {
    expect(flag).toContain("Settings.get(READER_PROCESSED_SOURCE_OPENING_KEY)");
    expect(flag).toContain("process.env.EXPO_PUBLIC_NEMU_READER_PROCESSED_SOURCE_OPENING");
  });

  test("the cache paint decides the hold before painting; held, the source calls are not deferred", () => {
    const effectStart = reader.indexOf("const [persisted, persistedPageSizes, sourceImageProcessor] = await Promise.all([");
    const effect = reader.slice(effectStart, reader.indexOf("} catch (nextError) {", effectStart));
    const hold = effect.indexOf("holdReaderOpeningIfProcessed(\n            persisted.pages,\n            \"cache\",");
    const paint = effect.indexOf("setPagesState({", hold);
    // The page list's own record of a processor, else the source's.
    expect(effect).toContain("listed: persisted.imageProcessor,");
    expect(effect).toContain("sourceRecord: sourceImageProcessor,");
    expect(hold).toBeGreaterThan(0);
    expect(paint).toBeGreaterThan(hold);
    expect(effect.split("paintedFromCache: restoredPersistedPageList && !readerOpeningHeldRef.current,").length).toBe(3);
    // Pages straight from the source (no cache) can take the hold too.
    expect(effect).toContain('holdReaderOpeningIfProcessed(firstPaint.pages, "source", {');
    expect(effect).toContain('holdReaderOpeningIfProcessed(refreshed.pages, "source", {');
    expect(effect).toContain("noteSourceImageProcessor(refreshed.imageProcessor);");
    expect(effect).toContain("imageProcessor: refreshed.imageProcessor === true,");
    expect(reader).toContain("readerZoomEntryRef.current.holdForFirstScreenImages();");
  });

  test("the first screen's images are logged with tap / landing / fade-end times and reveal a held cover", () => {
    const start = reader.indexOf('console.info("[reader-open] first-screen-images-ready", {');
    expect(start).toBeGreaterThan(0);
    const block = reader.slice(start, start + 600);
    expect(block).toContain("...readerOpeningSince(readerZoomEntry.openingTimes(), Date.now()),");
    expect(block).toContain("readerZoomEntry.onFirstScreenImagesReady();");
    expect(reader).toContain("painted: readerImageSizes.has(identity),");
    // The first screen is taken with a fallback to the placed page, and a
    // slow one says what it waits for.
    expect(reader).toContain("const indexes = resolveReaderFirstScreenIndexes({");
    expect(reader).toContain('console.info("[reader-open] first-screen-images-pending", {');
    expect(reader).toContain("shouldRetakeReaderFirstScreen({");
    expect(reader).toContain('console.info("[reader-open] first-screen retake", {');
  });

  test("the route holds on the UI thread, logs fade-end since the tap, and takes the tap from the handoff", () => {
    expect(route).toContain('if (finished) runOnJS(onFadeEnd)("hold-cap", landedAt);');
    expect(route).toContain("if (holdingRef.current) armHoldCap();");
    expect(route).toContain("if (holdingRef.current) return;");
    expect(route).toContain('if (holdingRef.current) reveal("first-screen-images");');
    expect(route).toContain("useState(() => peekMobileReaderZoomTapAt(zoomId))");
    expect(route).toContain("sinceTapMs,");
    // The tap is primed in the tap handler's zoom href helper.
    expect(handoff).toContain("const landing = primeMobileReaderZoomCover(zoomId, cover);");
    // A zoom lands on its cover, else a plate: only no zoom at all is no-fade.
    expect(route).toContain('if (!zoomId) coverReveal.openingGate.settle("no-fade");');
    expect(route).toContain("{zoomId ? (");
    expect(route).toContain("styles.coverPlate");
  });

  test("the hold's cap stops the scroll cap first (a withDelay runs the animation it replaced until its delay ends)", () => {
    const start = route.indexOf("const armHoldCap = useCallback(");
    expect(start).toBeGreaterThan(0);
    const block = route.slice(start, route.indexOf("}, [onFadeEnd, opacity]);", start));
    const cancel = block.indexOf("cancelAnimation(opacity);");
    expect(cancel).toBeGreaterThan(0);
    expect(cancel).toBeLessThan(block.indexOf("opacity.value = withDelay("));
  });
});
