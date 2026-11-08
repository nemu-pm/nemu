import { describe, expect, test } from "bun:test";
import {
  isMobileReaderScrollStripChapter,
  MOBILE_READER_SCROLL_PAGE_SPACING,
  mobileReaderScrollPageGaps,
  mobileReaderScrollSideMargin,
} from "./mobileReaderScrollPresentation";

const manga = { width: 1000, height: 1440 };
const strip = { width: 800, height: 2400 };

describe("scroll reader page gaps", () => {
  test("ordinary manga pages keep 8pt between them, none above the first", () => {
    const sizes = [manga, manga, manga, manga];
    expect(mobileReaderScrollPageGaps(4, (index) => sizes[index])).toEqual([
      0,
      MOBILE_READER_SCROLL_PAGE_SPACING,
      MOBILE_READER_SCROLL_PAGE_SPACING,
      MOBILE_READER_SCROLL_PAGE_SPACING,
    ]);
  });

  test("a webtoon chapter's strips meet edge to edge", () => {
    // Unknown sizes and a wide credits page still sit flush in a strip chapter.
    const sizes = [strip, strip, null, strip, { width: 800, height: 600 }];
    expect(mobileReaderScrollPageGaps(5, (index) => sizes[index])).toEqual([
      0, 0, 0, 0, 0,
    ]);
  });

  test("a lone strip slice sits flush against its neighbours", () => {
    const sizes = [manga, manga, strip, manga, manga];
    expect(mobileReaderScrollPageGaps(5, (index) => sizes[index])).toEqual([
      0, 8, 0, 0, 8,
    ]);
  });

  test("pages of unknown size keep the manga spacing", () => {
    expect(mobileReaderScrollPageGaps(3, () => null)).toEqual([0, 8, 8]);
    expect(mobileReaderScrollPageGaps(0, () => null)).toEqual([]);
  });

  const webtoonSlices = [
    ...Array.from({ length: 40 }, () => ({ width: 800, height: 1280 })),
    { width: 800, height: 713 },
  ];
  // 少年ジャンプ＋ (GigaViewer) serves every page at 764×1200 (≈0.637).
  const jumpPlusPages = Array.from({ length: 20 }, () => ({ width: 764, height: 1200 }));

  test("the source's webtoon viewer runs WEBTOON slices (800×1280) edge to edge", () => {
    const at = (index: number) => webtoonSlices[index];
    expect(isMobileReaderScrollStripChapter(webtoonSlices.length, at, 4)).toBe(true);
    expect(mobileReaderScrollPageGaps(webtoonSlices.length, at, 4).every((gap) => gap === 0)).toBe(true);
    // Before any page has a size.
    expect(mobileReaderScrollPageGaps(30, () => null, 4).every((gap) => gap === 0)).toBe(true);
  });

  test("少年ジャンプ＋ manga (764×1200, one height) keeps its spacing", () => {
    const at = (index: number) => jumpPlusPages[index];
    // The source's right-to-left viewer, and the pages alone.
    for (const viewer of [1, undefined, 0]) {
      expect(isMobileReaderScrollStripChapter(jumpPlusPages.length, at, viewer)).toBe(false);
      expect(mobileReaderScrollPageGaps(jumpPlusPages.length, at, viewer).slice(1).every((gap) => gap === 8)).toBe(true);
    }
  });

  test("a paged or vertical manga viewer is never a strip chapter, whatever the pages", () => {
    const heights = [1000, 1050, 1030, 1100, 980, 1040, 1035, 1020];
    const sizes = heights.map((height) => ({ width: 690, height }));
    for (const viewer of [1, 2, 3]) {
      expect(isMobileReaderScrollStripChapter(sizes.length, (index) => sizes[index], viewer)).toBe(false);
    }
  });

  test("without a viewer, slices of one cut height are not told from printed pages", () => {
    // Uniform 800×1280 slices look like a printed format of one size; only
    // the source's viewer (above) makes them a strip.
    const at = (index: number) => webtoonSlices[index];
    expect(isMobileReaderScrollStripChapter(webtoonSlices.length, at)).toBe(false);
  });

  test("690-wide slices of varying height read as a strip", () => {
    const heights = [1000, 1050, 1030, 1100, 980, 1040, 1035, 1020];
    const sizes = heights.map((height) => ({ width: 690, height }));
    expect(isMobileReaderScrollStripChapter(sizes.length, (index) => sizes[index])).toBe(true);
  });

  test("ordinary manga of one shape keeps its spacing", () => {
    for (const page of [
      { width: 1200, height: 1700 },
      { width: 960, height: 1378 },
      { width: 842, height: 1200 },
      { width: 700, height: 1000 },
      // US comics, 0.65
      { width: 1988, height: 3056 },
    ]) {
      const sizes = Array.from({ length: 24 }, () => page);
      expect(isMobileReaderScrollStripChapter(24, (index) => sizes[index])).toBe(false);
      expect(mobileReaderScrollPageGaps(24, (index) => sizes[index]).slice(1).every((gap) => gap === 8)).toBe(true);
    }
  });

  test("scan jitter in manga heights is not a strip", () => {
    const heights = [1700, 1710, 1695, 1705, 1690, 1712];
    const sizes = heights.map((height) => ({ width: 1200, height }));
    expect(isMobileReaderScrollStripChapter(sizes.length, (index) => sizes[index])).toBe(false);
  });

  test("a manga chapter with a two-page spread keeps its spacing", () => {
    const sizes = Array.from({ length: 20 }, (_, index) =>
      index === 7 ? { width: 2400, height: 1700 } : { width: 1200, height: 1700 },
    );
    expect(isMobileReaderScrollStripChapter(20, (index) => sizes[index])).toBe(false);
    expect(mobileReaderScrollPageGaps(20, (index) => sizes[index]).slice(1).every((gap) => gap === 8)).toBe(true);
  });

  test("mixed widths are not a strip unless one width dominates", () => {
    const mixed = [
      { width: 800, height: 1280 },
      { width: 1200, height: 1700 },
      { width: 800, height: 1280 },
      { width: 960, height: 1378 },
      { width: 800, height: 1280 },
      { width: 842, height: 1200 },
    ];
    expect(isMobileReaderScrollStripChapter(mixed.length, (index) => mixed[index])).toBe(false);
    // A webtoon with one wide credits page still reads as a strip.
    const credits = [
      ...Array.from({ length: 10 }, (_, index) => ({ width: 800, height: index % 2 ? 1280 : 1180 })),
      { width: 1600, height: 900 },
    ];
    expect(isMobileReaderScrollStripChapter(credits.length, (index) => credits[index])).toBe(true);
    // A manga chapter with a same-width short credits page stays manga.
    const manga = [
      ...Array.from({ length: 10 }, () => ({ width: 1200, height: 1700 })),
      { width: 1200, height: 800 },
    ];
    expect(isMobileReaderScrollStripChapter(manga.length, (index) => manga[index])).toBe(false);
  });

  test("too few known pages decide nothing", () => {
    const sizes = [{ width: 800, height: 1280 }, { width: 800, height: 1280 }];
    expect(isMobileReaderScrollStripChapter(10, (index) => sizes[index])).toBe(false);
  });

  test("side margins vanish at 100% page width", () => {
    expect(mobileReaderScrollSideMargin(100)).toBe(0);
    expect(mobileReaderScrollSideMargin(90)).toBe(10);
  });
});
