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

  test("WEBTOON slices wider than 1:2 (800×1280, short last slice) meet edge to edge", () => {
    const sizes = [
      ...Array.from({ length: 40 }, () => ({ width: 800, height: 1280 })),
      { width: 800, height: 713 },
    ];
    const at = (index: number) => sizes[index];
    expect(isMobileReaderScrollStripChapter(sizes.length, at)).toBe(true);
    expect(mobileReaderScrollPageGaps(sizes.length, at).every((gap) => gap === 0)).toBe(true);
  });

  test("the first three loaded slices already decide, unknown pages included", () => {
    const at = (index: number) => (index < 3 ? { width: 800, height: 1280 } : null);
    expect(mobileReaderScrollPageGaps(30, at).every((gap) => gap === 0)).toBe(true);
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
      ...Array.from({ length: 10 }, () => ({ width: 800, height: 1280 })),
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
