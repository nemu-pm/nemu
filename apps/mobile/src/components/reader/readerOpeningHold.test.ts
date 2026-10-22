import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  canHoldReaderOpening,
  readerOpeningSince,
  readerPagesNeedProcessing,
  resolveReaderFirstScreenImages,
  resolveReaderOpeningHoldDelay,
  resolveReaderProcessedSourceOpening,
  shouldHoldReaderOpeningForImages,
  shouldRevealReaderCover,
  READER_OPENING_IMAGE_HOLD_MAX_MS,
  READER_PROCESSED_SOURCE_OPENING_KEY,
} from "./readerOpeningHold";

describe("readerOpeningHold", () => {
  test("the switch: the first valid value wins, defer by default", () => {
    expect(resolveReaderProcessedSourceOpening()).toBe("defer");
    expect(resolveReaderProcessedSourceOpening(undefined, undefined)).toBe("defer");
    expect(resolveReaderProcessedSourceOpening("hold")).toBe("hold");
    expect(resolveReaderProcessedSourceOpening(" HOLD ")).toBe("hold");
    // The runtime default beats the build's env.
    expect(resolveReaderProcessedSourceOpening("defer", "hold")).toBe("defer");
    expect(resolveReaderProcessedSourceOpening(undefined, "hold")).toBe("hold");
    expect(resolveReaderProcessedSourceOpening("bogus", 1, "hold")).toBe("hold");
    expect(resolveReaderProcessedSourceOpening("bogus")).toBe("defer");
    expect(READER_PROCESSED_SOURCE_OPENING_KEY).toBe("NEMU_READER_PROCESSED_SOURCE_OPENING");
  });

  test("pages need processing while one with an image is still pending", () => {
    expect(readerPagesNeedProcessing([{ imageUri: "https://a/1.jpg", imageProcessing: "pending" }])).toBe(true);
    expect(readerPagesNeedProcessing([{ imageUri: "https://a/1.jpg", imageProcessing: "ready" }])).toBe(false);
    expect(readerPagesNeedProcessing([{ imageUri: "https://a/1.jpg" }])).toBe(false);
    expect(readerPagesNeedProcessing([{ imageProcessing: "pending" }])).toBe(false);
    expect(readerPagesNeedProcessing([])).toBe(false);
  });

  test("only hold, with pages to process and the cover still up, holds", () => {
    const base = { opening: "hold" as const, pagesNeedProcessing: true, openingSettled: false };
    expect(shouldHoldReaderOpeningForImages(base)).toBe(true);
    expect(shouldHoldReaderOpeningForImages({ ...base, opening: "defer" })).toBe(false);
    expect(shouldHoldReaderOpeningForImages({ ...base, pagesNeedProcessing: false })).toBe(false);
    expect(shouldHoldReaderOpeningForImages({ ...base, openingSettled: true })).toBe(false);
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
    const effectStart = reader.indexOf("const [persisted, persistedPageSizes] = await Promise.all([");
    const effect = reader.slice(effectStart, reader.indexOf("} catch (nextError) {", effectStart));
    const hold = effect.indexOf('holdReaderOpeningIfProcessed(persisted.pages, "cache");');
    const paint = effect.indexOf("setPagesState({", hold);
    expect(hold).toBeGreaterThan(0);
    expect(paint).toBeGreaterThan(hold);
    expect(effect.split("paintedFromCache: restoredPersistedPageList && !readerOpeningHeldRef.current,").length).toBe(3);
    // Pages straight from the source (no cache) can take the hold too.
    expect(effect).toContain('holdReaderOpeningIfProcessed(firstPaint.pages, "source");');
    expect(effect).toContain('holdReaderOpeningIfProcessed(refreshed.pages, "source");');
    expect(reader).toContain("readerZoomEntryRef.current.holdForFirstScreenImages();");
  });

  test("the first screen's images are logged with tap / landing / fade-end times and reveal a held cover", () => {
    const start = reader.indexOf('console.info("[reader-open] first-screen-images-ready", {');
    expect(start).toBeGreaterThan(0);
    const block = reader.slice(start, start + 600);
    expect(block).toContain("...readerOpeningSince(readerZoomEntry.openingTimes(), Date.now()),");
    expect(block).toContain("readerZoomEntry.onFirstScreenImagesReady();");
    expect(reader).toContain("painted: readerImageSizes.has(identity),");
  });

  test("the route holds on the UI thread, logs fade-end since the tap, and takes the tap from the handoff", () => {
    expect(route).toContain('if (finished) runOnJS(onFadeEnd)("hold-cap", landedAt);');
    expect(route).toContain("if (holdingRef.current) armHoldCap();");
    expect(route).toContain("if (holdingRef.current) return;");
    expect(route).toContain('if (holdingRef.current) reveal("first-screen-images");');
    expect(route).toContain("useState(() => peekMobileReaderZoomTapAt(zoomId))");
    expect(route).toContain("sinceTapMs,");
    // The tap is primed in the tap handler's zoom href helper.
    expect(handoff).toContain("primeMobileReaderZoomCover(zoomId, cover);");
  });
});
