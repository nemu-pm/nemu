import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  mobileReaderBookSheetPlacement,
  mobileReaderBookThumbnailAtRest,
  mobileReaderBookThumbnailKey,
  mobileReaderBookThumbnailMovedVisibly,
  READER_BOOK_THUMBNAIL_STALE,
  mobileReaderBookThumbnailResumeDelay,
  mobileReaderBookThumbnailSnapOffset,
  READER_BOOK_THUMBNAIL_FOLLOW_RESUME_MS,
  READER_BOOK_THUMBNAIL_REST_QUIET_MS,
  READER_BOOK_THUMBNAIL_SNAP_MS,
  mobileReaderBookThumbnailFollowOffset,
  mobileReaderBookThumbnailLayout,
  mobileReaderBookThumbnailRatios,
  READER_BOOK_THUMBNAIL_GAP,
  READER_BOOK_THUMBNAIL_MAX_RATIO,
  READER_BOOK_THUMBNAIL_MIN_RATIO,
  READER_BOOK_THUMBNAIL_ROW_EDGE,
  READER_BOOK_THUMBNAIL_UNKNOWN_RATIO,
} from "./mobileReaderBookSidePane";
import {
  MOBILE_READER_BOOK_SCROLL_SIDE_MARGIN,
  mobileReaderBookScrollStrip,
} from "./mobileReaderScrollPresentation";
import { readerContinuousScreenStep, READER_SCROLL_SCREEN_OVERLAP } from "./mobileReaderProgress";

describe("book posture strip width", () => {
  test("webtoon strips run edge to edge in their half; manga keeps 8pt either side", () => {
    expect(mobileReaderBookScrollStrip({ paneWidth: 455.5, stripChapter: true, widthScale: 1 })).toEqual({
      sideMargin: 0,
      imageWidth: 455.5,
    });
    expect(mobileReaderBookScrollStrip({ paneWidth: 455.5, stripChapter: false, widthScale: 1 })).toEqual({
      sideMargin: MOBILE_READER_BOOK_SCROLL_SIDE_MARGIN,
      imageWidth: 455.5 - 16,
    });
  });

  test("a narrower page width shrinks the pages inside the margins, never past the half", () => {
    const narrow = mobileReaderBookScrollStrip({ paneWidth: 400, stripChapter: false, widthScale: 0.5 });
    expect(narrow).toEqual({ sideMargin: 8, imageWidth: 192 });
    expect(mobileReaderBookScrollStrip({ paneWidth: 400, stripChapter: true, widthScale: 3 }).imageWidth).toBe(400);
    expect(mobileReaderBookScrollStrip({ paneWidth: Number.NaN, stripChapter: true, widthScale: 1 }).imageWidth).toBe(1);
  });
});

describe("book posture thumbnails", () => {
  test("one column, the given width, 8pt apart; tall slices are capped and cropped", () => {
    const layout = mobileReaderBookThumbnailLayout([1.4, 1.4, 4], 100);
    expect(layout.lengths).toEqual([140, 140, 100 * READER_BOOK_THUMBNAIL_MAX_RATIO]);
    expect(layout.offsets).toEqual([8, 8 + 140 + 8, 8 + 140 + 8 + 140 + 8]);
    expect(layout.cropped).toEqual([false, false, true]);
    expect(layout.contentLength).toBe(8 + 140 + 8 + 140 + 8 + 150 + 8);
    // An unknown ratio falls back to a manga page, width / height 0.7.
    expect(mobileReaderBookThumbnailLayout([Number.NaN], 100).lengths).toEqual([143]);
  });

  test("the followed page is centred, clamped to the list's range", () => {
    const layout = mobileReaderBookThumbnailLayout(Array(10).fill(1), 100);
    // Item 4 spans 4·108+8 … +100: centred in a 300pt viewport.
    expect(mobileReaderBookThumbnailFollowOffset(layout, 4, 300)).toBe(440 - 150 + 50);
    expect(mobileReaderBookThumbnailFollowOffset(layout, 0, 300)).toBe(0);
    expect(mobileReaderBookThumbnailFollowOffset(layout, 9, 300)).toBe(layout.contentLength - 300);
    expect(mobileReaderBookThumbnailFollowOffset(layout, 99, 300)).toBe(layout.contentLength - 300);
    // Taller than the viewport: its top (and the gap above it) at the top.
    expect(mobileReaderBookThumbnailFollowOffset(layout, 4, 80)).toBe(440 - READER_BOOK_THUMBNAIL_GAP);
    expect(mobileReaderBookThumbnailFollowOffset(mobileReaderBookThumbnailLayout([], 100), 0, 300)).toBe(0);
  });
});

describe("laptop posture thumbnail row", () => {
  // Duo half folded, portrait: the bottom half is 455.5pt tall.
  const height = 455.5 - 32;

  test("one row, every thumbnail the half's height less 16pt above and below, 8pt apart, 16pt from the ends", () => {
    const layout = mobileReaderBookThumbnailLayout([1.5, 1.5, 0.75], height, "horizontal");
    expect(layout.orientation).toBe("horizontal");
    expect(READER_BOOK_THUMBNAIL_ROW_EDGE + READER_BOOK_THUMBNAIL_GAP).toBe(16);
    expect(layout.lengths).toEqual([Math.round(height / 1.5), Math.round(height / 1.5), Math.round(height / 0.75)]);
    expect(layout.offsets[0]).toBe(16);
    expect(layout.offsets[1]).toBe(16 + layout.lengths[0]! + 8);
    expect(layout.contentLength).toBe(16 + layout.lengths.reduce((a, b) => a + b, 0) + 2 * 8 + 16);
    expect(layout.cropped).toEqual([false, false, false]);
  });

  test("a tall webtoon slice is cropped to the tallest box; a very wide one is capped too", () => {
    const layout = mobileReaderBookThumbnailLayout([6, 0.05], 300, "horizontal");
    expect(layout.lengths).toEqual([Math.round(300 / READER_BOOK_THUMBNAIL_MAX_RATIO), Math.round(300 / READER_BOOK_THUMBNAIL_MIN_RATIO)]);
    expect(layout.cropped).toEqual([true, false]);
    // Unknown size: a printed manga page, 0.7 wide to 1 tall.
    expect(mobileReaderBookThumbnailLayout([Number.NaN], 300, "horizontal").lengths).toEqual([210]);
  });

  test("the followed page is centred across the row's width, clamped to its ends", () => {
    const layout = mobileReaderBookThumbnailLayout(Array(10).fill(1.5), 300, "horizontal");
    // Each thumbnail 200 wide, 208 per cell; item 4 starts at 8 + 4·208 + 8.
    const start = 8 + 4 * 208 + 8;
    expect(mobileReaderBookThumbnailFollowOffset(layout, 4, 669)).toBe(Math.round(start + 100 - 669 / 2));
    expect(mobileReaderBookThumbnailFollowOffset(layout, 0, 669)).toBe(0);
    expect(mobileReaderBookThumbnailFollowOffset(layout, 9, 669)).toBe(layout.contentLength - 669);
  });

  test("the column is unchanged by default (no edge padding)", () => {
    expect(mobileReaderBookThumbnailLayout([1], 100)).toEqual(mobileReaderBookThumbnailLayout([1], 100, "vertical"));
    expect(mobileReaderBookThumbnailLayout([1], 100).offsets).toEqual([8]);
  });
});

describe("one screen of scroll reading", () => {
  const metrics = { contentOffset: 1000, contentLength: 10_000, viewportLength: 669 };
  const safe = { top: 82, bottom: 34 };
  const step = (669 - 82 - 34) * (1 - READER_SCROLL_SCREEN_OVERLAP);

  test("moves by the viewport less the safe areas, keeping 12% on screen", () => {
    expect(readerContinuousScreenStep(metrics, "next", safe)).toEqual({ kind: "scroll", offset: 1000 + step });
    expect(readerContinuousScreenStep(metrics, "previous", safe)).toEqual({ kind: "scroll", offset: 1000 - step });
  });

  test("clamps to the ends; at the bottom, next is the end of the chapter", () => {
    expect(readerContinuousScreenStep({ ...metrics, contentOffset: 100 }, "previous", safe)).toEqual({ kind: "scroll", offset: 0 });
    expect(readerContinuousScreenStep({ ...metrics, contentOffset: 9_200 }, "next", safe)).toEqual({ kind: "scroll", offset: 10_000 - 669 });
    expect(readerContinuousScreenStep({ ...metrics, contentOffset: 10_000 - 669 }, "next", safe)).toEqual({ kind: "end" });
    expect(readerContinuousScreenStep({ ...metrics, viewportLength: 0 }, "next", safe)).toEqual({ kind: "scroll", offset: 0 });
  });
});

describe("book posture thumbnail shapes", () => {
  test("a known page keeps its own shape; an unknown one is 0.7 wide to 1 tall", () => {
    const sizes = [{ width: 800, height: 1200 }, null, { width: 0, height: 100 }, { width: 1600, height: 1200 }];
    const ratios = mobileReaderBookThumbnailRatios(4, (index) => sizes[index]);
    expect(ratios[0]).toBeCloseTo(1.5, 10);
    expect(ratios[1]).toBeCloseTo(1 / 0.7, 10);
    expect(ratios[2]).toBeCloseTo(1 / 0.7, 10);
    expect(ratios[3]).toBeCloseTo(0.75, 10);
    expect(READER_BOOK_THUMBNAIL_UNKNOWN_RATIO).toBeCloseTo(1 / 0.7, 10);
    expect(mobileReaderBookThumbnailRatios(0, () => null)).toEqual([]);
  });
});

const sidePaneSource = readFileSync(
  path.join(import.meta.dir, "../components/reader/ReaderBookSidePane.tsx"),
  "utf8",
);

describe("book pane snap-back", () => {
  test("starts 1.5s after the list rests (never past 1.7s) and runs 280ms", () => {
    expect(READER_BOOK_THUMBNAIL_FOLLOW_RESUME_MS).toBe(1_500);
    expect(READER_BOOK_THUMBNAIL_SNAP_MS).toBe(280);
    // Rest detected late by the quiet fallback: the delay counts from the rest.
    expect(mobileReaderBookThumbnailResumeDelay(1_000, 1_000)).toBe(1_500);
    expect(mobileReaderBookThumbnailResumeDelay(1_000, 1_000 + READER_BOOK_THUMBNAIL_REST_QUIET_MS)).toBe(1_400);
    expect(mobileReaderBookThumbnailResumeDelay(0, 5_000)).toBe(0);
    expect(mobileReaderBookThumbnailResumeDelay(Number.NaN, 0)).toBe(1_500);
    // The quiet fallback detects a rest within the 0.2s tolerance.
    expect(READER_BOOK_THUMBNAIL_REST_QUIET_MS).toBeLessThanOrEqual(200);
  });

  test("a fling rests once it is slower than 12pt/s over 80ms, before UIKit's momentum end", () => {
    const fling = [0, 16, 32, 48, 64, 80, 96].map((time, index) => ({ time, offset: index * 8 }));
    expect(mobileReaderBookThumbnailAtRest(fling)).toBe(false);
    // The sub-point tail: a third of a point in 96ms.
    const tail = [{ time: 0, offset: 500 }, { time: 48, offset: 500.33 }, { time: 96, offset: 500.33 }];
    expect(mobileReaderBookThumbnailAtRest(tail)).toBe(true);
    // Not until the samples span the window.
    expect(mobileReaderBookThumbnailAtRest([{ time: 0, offset: 0 }, { time: 16, offset: 0 }])).toBe(false);
    expect(mobileReaderBookThumbnailAtRest([])).toBe(false);
  });

  test("a drag with no fling rests where the list last visibly moved: at the release, not UIKit's momentum end", () => {
    // Sub-point (pixel-rounded) changes are not a visible move; they add up.
    expect(mobileReaderBookThumbnailMovedVisibly(100, 100.33)).toBe(false);
    expect(mobileReaderBookThumbnailMovedVisibly(100, 100.5)).toBe(true);
    expect(mobileReaderBookThumbnailMovedVisibly(100, 99.4)).toBe(true);
    // Every rest path times the snap from the last visible move.
    expect(sidePaneSource).not.toContain("scheduleResume(Date.now())");
    expect(sidePaneSource).not.toContain("scheduleResume(now)");
    expect(sidePaneSource).toMatch(/onScrollEndDrag=\{\(\) => \{[\s\S]*?scheduleResume\(lastMoveRef\.current\.time\)/);
    // A momentum that never moves the list sends no scroll event: the quiet
    // fallback is armed from its start, not only from a scroll event.
    expect(sidePaneSource).toMatch(/onMomentumScrollBegin=\{\(\) => \{[\s\S]*?armQuietRest\(\);\s*\}\}/);
    // A drag release at rest: 1.5s from the last move (≤1.7s even if noticed 0.2s late).
    expect(mobileReaderBookThumbnailResumeDelay(1_000, 1_000)).toBe(1_500);
  });

  test("the snap moves at once (ease-out) and lands on the target at 280ms", () => {
    expect(mobileReaderBookThumbnailSnapOffset(100, 400, 0)).toBe(100);
    const first = mobileReaderBookThumbnailSnapOffset(100, 400, 16);
    expect(first).toBeGreaterThan(100 + 300 * (16 / 280));
    expect(mobileReaderBookThumbnailSnapOffset(100, 400, 140)).toBeGreaterThan(250);
    expect(mobileReaderBookThumbnailSnapOffset(100, 400, 280)).toBe(400);
    expect(mobileReaderBookThumbnailSnapOffset(400, 100, 1_000)).toBe(100);
  });

  test("the pane snaps straight from the timer; a late momentum end never restarts it", () => {
    expect(sidePaneSource).not.toContain("setResumed");
    expect(sidePaneSource).toMatch(/pausedRef\.current = false;\s*follow\(true\);/);
    expect(sidePaneSource).toContain("if (pausedRef.current && flingingRef.current) scheduleResume(lastMoveRef.current.time);");
    // The follow is driven frame by frame (280ms), not by UIKit's animated scroll.
    expect(sidePaneSource).not.toContain("animated: placedRef.current");
  });
});

describe("book pane thumbnail cells", () => {
  test("a loading thumbnail keeps its numbered placeholder: no spinner, no retry glyph", () => {
    expect(sidePaneSource).not.toContain("ActivityIndicator");
    expect(sidePaneSource).toContain("setPreview({ key: requestKey, uri, failed: false })");
    expect(sidePaneSource).not.toContain("failed: !uri");
  });

  test("the chapter title is 85% white (black on a light page background), never tied to the toolbar", () => {
    expect(sidePaneSource).toContain('title: "rgba(255,255,255,0.85)",');
    expect(sidePaneSource).toContain('title: "rgba(0,0,0,0.85)",');
    expect(sidePaneSource).toContain("styles.title, { color: colors.title }");
  });

  test("a thumbnail not ready yet: the reader background, the pages' spinner while on screen, its number", () => {
    expect(sidePaneSource).not.toContain("MOBILE_READER_SCROLL_PLACEHOLDER_COLOR");
    expect(sidePaneSource).toContain("width, height, backgroundColor }]");
    expect(sidePaneSource).toContain("{visible && (uri === null || loadedUri !== uri) ? (");
    expect(sidePaneSource).toContain("<MobileReaderPageSpinner color={mobileReaderPageStatusColor(backgroundColor)} />");
    expect(sidePaneSource).toContain("{page}");
  });
});

describe("book posture wiring (ReaderScreen)", () => {
  const readerScreen = readFileSync(path.join(import.meta.dir, "../screens/ReaderScreen.tsx"), "utf8");

  test("the pane's title keeps under the widest top inset seen (the status bar hides with the toolbar)", () => {
    expect(readerScreen).toContain("sidePaneTopInset: readerBookPaneTopInset,");
    expect(readerScreen).toContain("mobileReaderNextTopInsetLatch(");
  });

  test("the reader's sheets are placed over the side pane (where the sheet is presented from never decided it)", () => {
    expect(readerScreen).not.toContain("sheetHostFrame");
    expect(readerScreen).toContain("<MobileSheetPlacementProvider value={readerSheetPlacement}>");
    // Settings, Plugins and every Japanese Learning sheet (Detect text too) are inside it.
    const open = readerScreen.indexOf("<MobileSheetPlacementProvider value={readerSheetPlacement}>");
    const close = readerScreen.indexOf("</MobileSheetPlacementProvider>");
    const placed = readerScreen.slice(open, close);
    for (const sheet of ["<ReaderSettingsNativePopover", "<ReaderPluginSettingsSheet", "{japaneseLearningSurfaces}", "<JapaneseLearningPluginLauncherSheet"]) {
      expect(placed).toContain(sheet);
    }
  });

  test("each sheet carries the placement in its native chain from the first frame", () => {
    const read = (file: string) => readFileSync(path.join(import.meta.dir, file), "utf8");
    expect(read("../components/reader/ReaderSettingsNativePopover.ios.tsx")).toContain("presentationPlacement(sheetPlacement),");
    expect(read("../components/reader/ReaderPluginSettingsSheet.ios.tsx")).toContain("presentationPlacement(sheetPlacement),");
    const scaffold = read("../design-system/components/MobileNativeSheetScaffold.tsx");
    expect(scaffold).toContain("[presentationPlacement(sheetPlacement)]");
    expect(scaffold).toContain("presentationModifiers={sheetPresentationModifiers}");
    const swift = read("../../modules/nemu-window-layout/ios/NemuWindowLayoutModule.swift");
    expect(swift).toContain('static let type = "nemuPresentationPlacement"');
    expect(swift).toContain("content.presentationPlacement(resolved)");
    expect(swift).toContain("ViewModifierRegistry.register(NemuPresentationPlacementModifier.type)");
    // The patched community BottomSheet passes the caller's modifiers on (source and build).
    const patch = read("../../../../patches/@expo%2Fui@58.0.24.patch");
    expect(patch).toContain("+      ...(presentationModifiers ?? []),");
    expect(patch).toContain("+            ...presentationModifiers ?? []");
  });
});

describe("book posture sheet placement", () => {
  const bounds = { x: 0, y: 0, width: 951, height: 669 };
  const right = { orientation: "vertical" as const, frame: { x: 495.5, y: 0, width: 455.5, height: 669 } };
  const left = { orientation: "vertical" as const, frame: { x: 0, y: 0, width: 455.5, height: 669 } };

  test("scroll reading: over the side pane's half (trailing in LTR, the pane on the right)", () => {
    expect(mobileReaderBookSheetPlacement({ posture: "book", sidePane: right, bounds, layoutDirection: "ltr" })).toBe("trailing");
    expect(mobileReaderBookSheetPlacement({ posture: "book", sidePane: right, bounds, layoutDirection: undefined })).toBe("trailing");
    // RTL: the strip takes the right half, the pane the left one — still trailing.
    expect(mobileReaderBookSheetPlacement({ posture: "book", sidePane: left, bounds, layoutDirection: "rtl" })).toBe("trailing");
    expect(mobileReaderBookSheetPlacement({ posture: "book", sidePane: left, bounds, layoutDirection: "ltr" })).toBe("leading");
  });

  test("paged book reading, the laptop posture and the flat display keep the automatic placement", () => {
    expect(mobileReaderBookSheetPlacement({ posture: "book", sidePane: null, bounds, layoutDirection: "ltr" })).toBe("automatic");
    expect(mobileReaderBookSheetPlacement({
      posture: "notebook",
      sidePane: { orientation: "horizontal", frame: { x: 0, y: 515.5, width: 669, height: 435.5 } },
      bounds: { x: 0, y: 0, width: 669, height: 951 },
      layoutDirection: "ltr",
    })).toBe("automatic");
    expect(mobileReaderBookSheetPlacement({ posture: "flat", sidePane: undefined, bounds, layoutDirection: "ltr" })).toBe("automatic");
  });
});

describe("book pane thumbnails never show a page's raw original while it is pending", () => {
  const readerScreen = readFileSync(path.join(import.meta.dir, "../screens/ReaderScreen.tsx"), "utf8");

  test("a pending page has no thumbnail key; a processed one is keyed by id and image", () => {
    const raw = "https://cdn-ak-img.shonenjumpplus.com/p14.jpg";
    expect(mobileReaderBookThumbnailKey({ id: "p14", imageUri: raw, imageProcessing: "pending" })).toBeNull();
    expect(mobileReaderBookThumbnailKey({ id: "p14" })).toBeNull();
    expect(mobileReaderBookThumbnailKey(undefined)).toBeNull();
    expect(mobileReaderBookThumbnailKey({ id: "p14", imageUri: "file:///p14.webp", imageProcessing: "ready" }))
      .toBe("p14\u0001file:///p14.webp");
    // A source with nothing to process: its original is the page.
    expect(mobileReaderBookThumbnailKey({ id: "p14", imageUri: raw, imageProcessing: "fallback" }))
      .toBe(`p14\u0001${raw}`);
  });

  test("the resolver refuses pending pages and remembers per page image, not per page id", () => {
    expect(readerScreen).toContain('if (!page?.imageUri || page.imageProcessing === "pending" || page.imageProcessing === "failed") return null;');
    expect(readerScreen).toContain("const memoKey = `${page.id}\\u0001${page.imageUri}`;");
    expect(readerScreen).not.toContain("resolvedByPageId.get(page.id)");
    expect(readerScreen).not.toContain("resolvedByPageId.set(page.id,");
  });

  test("the pane asks for the cell's own key; another image answers stale", () => {
    expect(readerScreen).toContain("thumbnailUri={readerBookThumbnailUri}");
    expect(readerScreen).toMatch(
      /mobileReaderBookThumbnailKey\(displayedPages\[index\]\) === key\s*\? readerNotebookThumbnailUri\(index, signal\)\s*: Promise\.resolve\(READER_BOOK_THUMBNAIL_STALE\)/,
    );
    expect(readerScreen).toContain("displayedPages.map(mobileReaderBookThumbnailKey)");
  });

  test("the cell never calls a stale resolver and keeps its placeholder on a stale answer", () => {
    // Updated before the cells' effects run (a layout effect), not in an effect.
    expect(sidePaneSource).toMatch(/useLayoutEffect\(\(\) => \{\s*thumbnailUriRef\.current = thumbnailUri;/);
    expect(sidePaneSource).toContain("resolve(index, imageKey, controller.signal)");
    expect(sidePaneSource).toContain("if (uri === READER_BOOK_THUMBNAIL_STALE) return;");
    expect(READER_BOOK_THUMBNAIL_STALE).toBe("stale");
  });
});

describe("a page whose processing failed (scrambling source) is a load failure", () => {
  const readerScreen = readFileSync(path.join(import.meta.dir, "../screens/ReaderScreen.tsx"), "utf8");
  const pageFrame = readFileSync(path.join(import.meta.dir, "../components/reader/MobileReaderPageFrame.tsx"), "utf8");

  test("the pane thumbnail is the page number on grey: no key, no request", () => {
    const raw = "https://cdn-ak-img.shonenjumpplus.com/p14.jpg";
    expect(mobileReaderBookThumbnailKey({ id: "p14", imageUri: raw, imageProcessing: "failed" })).toBeNull();
  });

  test("the strip shows the existing load-failed frame without the image, and Retry processes the page again", () => {
    expect(readerScreen).toContain('processingFailed: page.imageProcessing === "failed",');
    expect(readerScreen).toMatch(/renderPolicy === "processing-failed"\) \{[\s\S]{0,400}<MobileReaderPageFrame\s+withholdImage/);
    expect(readerScreen).toContain("retryReaderPageProcessing(index)");
    expect(readerScreen).toMatch(/pageProcessor\s*\.retryPage\(index, \{ onUpdate: apply \}\)/);
    // The frame never mounts the image when withheld; its copy stays the existing one.
    expect(pageFrame).toContain("{withholdImage ? null : <MobileCachedImage");
    expect(pageFrame).toContain("strings.reader.pageImageFailed");
    expect(pageFrame).toContain("label={strings.common.retry}");
  });
});

describe("the scrub preview never shows a failed page's original", () => {
  test("lookup and request both skip it", () => {
    const scrub = readFileSync(
      path.join(import.meta.dir, "../components/reader/useReaderScrubPreviewThumbnails.ts"),
      "utf8",
    );
    expect(scrub).toContain('if (!page?.imageUri || page.imageProcessing === "failed") return null;');
    expect(scrub).toContain('page.imageUriOwnership === "app" || page.imageProcessing === "failed") return;');
  });
});
