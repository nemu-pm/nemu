import { describe, expect, test } from "bun:test";
import {
  mobileReaderBookThumbnailFollowOffset,
  mobileReaderBookThumbnailLayout,
  mobileReaderBookThumbnailRatios,
  READER_BOOK_THUMBNAIL_GAP,
  READER_BOOK_THUMBNAIL_MAX_RATIO,
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
    expect(layout.heights).toEqual([140, 140, 100 * READER_BOOK_THUMBNAIL_MAX_RATIO]);
    expect(layout.offsets).toEqual([8, 8 + 140 + 8, 8 + 140 + 8 + 140 + 8]);
    expect(layout.cropped).toEqual([false, false, true]);
    expect(layout.contentHeight).toBe(8 + 140 + 8 + 140 + 8 + 150 + 8);
    // An unknown ratio falls back to a manga page, width / height 0.7.
    expect(mobileReaderBookThumbnailLayout([Number.NaN], 100).heights).toEqual([143]);
  });

  test("the followed page is centred, clamped to the list's range", () => {
    const layout = mobileReaderBookThumbnailLayout(Array(10).fill(1), 100);
    // Item 4 spans 4·108+8 … +100: centred in a 300pt viewport.
    expect(mobileReaderBookThumbnailFollowOffset(layout, 4, 300)).toBe(440 - 150 + 50);
    expect(mobileReaderBookThumbnailFollowOffset(layout, 0, 300)).toBe(0);
    expect(mobileReaderBookThumbnailFollowOffset(layout, 9, 300)).toBe(layout.contentHeight - 300);
    expect(mobileReaderBookThumbnailFollowOffset(layout, 99, 300)).toBe(layout.contentHeight - 300);
    // Taller than the viewport: its top (and the gap above it) at the top.
    expect(mobileReaderBookThumbnailFollowOffset(layout, 4, 80)).toBe(440 - READER_BOOK_THUMBNAIL_GAP);
    expect(mobileReaderBookThumbnailFollowOffset(mobileReaderBookThumbnailLayout([], 100), 0, 300)).toBe(0);
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
