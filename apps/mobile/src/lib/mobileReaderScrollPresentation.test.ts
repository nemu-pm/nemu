import { describe, expect, test } from "bun:test";
import {
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

  test("side margins vanish at 100% page width", () => {
    expect(mobileReaderScrollSideMargin(100)).toBe(0);
    expect(mobileReaderScrollSideMargin(90)).toBe(10);
  });
});
