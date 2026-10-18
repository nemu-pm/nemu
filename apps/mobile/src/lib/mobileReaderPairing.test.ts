import { describe, expect, test } from "bun:test";
import {
  buildMobileReaderPairedSpreads,
  describeMobileReaderPairing,
  freezeMobileReaderSpreadsThrough,
  isMobileReaderStripChapter,
  mobileReaderColourOddPages,
  mobileReaderFirstHeadSegment,
  isMobileReaderWidePage,
  mobileReaderPagesPairable,
  mobileReaderPairingSegments,
  mobileReaderSegmentSpreads,
  nextMobileReaderSpreadTable,
  normalizeMobileReaderSpreadPairing,
  type MobileReaderPageSize,
} from "./mobileReaderPairing";

const P: MobileReaderPageSize = { width: 700, height: 1000 };
const W: MobileReaderPageSize = { width: 1400, height: 1000 };
const sizes = (list: Array<MobileReaderPageSize | null>) => (index: number) => list[index] ?? null;

describe("mobile reader pairing", () => {
  test("wide means wider than 1.2, a near-square scan still pairs", () => {
    expect(isMobileReaderWidePage(W)).toBe(true);
    expect(isMobileReaderWidePage({ width: 1150, height: 1000 })).toBe(false);
    expect(isMobileReaderWidePage(null)).toBe(false);
  });

  test("facing pages must agree in shape within 15%; unknown sizes pair", () => {
    expect(mobileReaderPagesPairable(P, { width: 760, height: 1000 })).toBe(true);
    expect(mobileReaderPagesPairable(P, { width: 860, height: 1000 })).toBe(false);
    expect(mobileReaderPagesPairable(P, null)).toBe(true);
    expect(mobileReaderPagesPairable(P, W)).toBe(false);
  });

  test("cover alone pairs (1,2)(3,4); cover paired from the first page", () => {
    const sizeAt = sizes([]);
    expect(buildMobileReaderPairedSpreads({ pageCount: 5, sizeAt, pairing: "cover-alone" }))
      .toEqual([[0], [1, 2], [3, 4]]);
    expect(buildMobileReaderPairedSpreads({ pageCount: 5, sizeAt, pairing: "cover-paired" }))
      .toEqual([[0, 1], [2, 3], [4]]);
    expect(buildMobileReaderPairedSpreads({ pageCount: 0, sizeAt, pairing: "cover-alone" })).toEqual([]);
  });

  test("a wide page stands alone and parity restarts after it", () => {
    // Index pairing would give (1,2)(3,4)(5,6) and put page 4 with 3.
    const sizeAt = sizes([P, P, P, W, P, P, P]);
    expect(buildMobileReaderPairedSpreads({ pageCount: 7, sizeAt, pairing: "cover-alone" }))
      .toEqual([[0], [1, 2], [3], [4, 5], [6]]);
    expect(mobileReaderPairingSegments(7, sizeAt)).toEqual([
      { start: 0, end: 3, wide: false },
      { start: 3, end: 4, wide: true },
      { start: 4, end: 7, wide: false },
    ]);
  });

  test("a change of page shape ends a segment", () => {
    const insert = { width: 900, height: 1000 };
    const sizeAt = sizes([P, P, P, insert, P, P]);
    expect(buildMobileReaderPairedSpreads({ pageCount: 6, sizeAt, pairing: "cover-alone" }))
      .toEqual([[0], [1, 2], [3], [4, 5]]);
  });

  test("shift by one page flips every segment, wide pages stay alone", () => {
    const sizeAt = sizes([P, P, P, W, P, P, P]);
    expect(buildMobileReaderPairedSpreads({ pageCount: 7, sizeAt, pairing: "cover-alone", shift: true }))
      .toEqual([[0, 1], [2], [3], [4], [5, 6]]);
  });

  test("automatic pairing takes the inferred parity and falls back to the cover alone", () => {
    const sizeAt = sizes([]);
    expect(buildMobileReaderPairedSpreads({ pageCount: 4, sizeAt, pairing: "auto", inferParity: () => 0 }))
      .toEqual([[0, 1], [2, 3]]);
    expect(buildMobileReaderPairedSpreads({ pageCount: 4, sizeAt, pairing: "auto", inferParity: () => null }))
      .toEqual([[0], [1, 2], [3]]);
  });

  test("a state change mid-segment leaves one page alone (inserted page)", () => {
    expect(mobileReaderSegmentSpreads({ start: 0, end: 7, wide: false }, [1, 1, 1, 0, 0, 0, 0]))
      .toEqual([[0], [1, 2], [3], [4, 5], [6]]);
  });

  test("legacy book pairing keeps pairing from the first page", () => {
    expect(normalizeMobileReaderSpreadPairing(undefined, "book")).toBe("cover-paired");
    expect(normalizeMobileReaderSpreadPairing(undefined, "manga")).toBe("cover-alone");
    expect(normalizeMobileReaderSpreadPairing(undefined)).toBe("cover-alone");
    expect(normalizeMobileReaderSpreadPairing("cover-alone", "book")).toBe("cover-alone");
    expect(normalizeMobileReaderSpreadPairing("bogus")).toBe("cover-alone");
  });

  test("the spreads already seen stay put when pairing learns about pages ahead", () => {
    const previous = [[0], [1, 2], [3, 4], [5, 6]];
    // Page 4 turned out wide.
    const next = [[0], [1, 2], [3], [4], [5, 6]];
    expect(freezeMobileReaderSpreadsThrough(previous, next, 1)).toEqual([[0], [1, 2], [3], [4], [5, 6]]);
    // A straddling pair gives up its kept page.
    expect(freezeMobileReaderSpreadsThrough([[0], [1, 2], [3]], [[0, 1], [2, 3], [4]], 2))
      .toEqual([[0], [1, 2], [3], [4]]);
  });

  test("the current spread is kept once its pages decoded, re-pairs while they load", () => {
    const previous = [[0], [1, 2], [3, 4]];
    const computed = [[0], [1], [2], [3, 4]];
    expect(nextMobileReaderSpreadTable({
      previous, computed, reset: false, currentPageIndex: 1, settled: () => true,
    })).toEqual([[0], [1, 2], [3, 4]]);
    expect(nextMobileReaderSpreadTable({
      previous, computed, reset: false, currentPageIndex: 1, settled: (page) => page !== 2,
    })).toEqual([[0], [1], [2], [3, 4]]);
    expect(nextMobileReaderSpreadTable({
      previous, computed, reset: true, currentPageIndex: 1, settled: () => true,
    })).toBe(computed);
  });
});

describe("mobile reader pairing v2", () => {
  const n = (count: number) => Array.from({ length: count }, () => P);

  test("a colour page inside a black-and-white chapter stands alone and the chapter proper starts after it", () => {
    const chroma = [0.6, 0, 0, 0, 0, 0, 0, 0, 0];
    const oddAt = mobileReaderColourOddPages(chroma.length, (i) => chroma[i]);
    expect(oddAt(0)).toBe(true);
    expect(oddAt(1)).toBe(false);
    // The first page of the chapter proper stands alone (cover alone), after the colour credit.
    expect(buildMobileReaderPairedSpreads({ pageCount: 9, sizeAt: sizes(n(9)), pairing: "cover-alone", oddAt }))
      .toEqual([[0], [1], [2, 3], [4, 5], [6, 7], [8]]);
  });

  test("in a colour chapter, or with too few pages measured, no page is odd for its colour", () => {
    const colour = [0.5, 0.4, 0.6, 0.5, 0.3, 0.7, 0.5];
    expect(mobileReaderColourOddPages(colour.length, (i) => colour[i])(0)).toBe(false);
    const few = [0.6, 0, 0];
    expect(mobileReaderColourOddPages(few.length, (i) => few[i])(0)).toBe(false);
  });

  test("webtoon strips never pair", () => {
    const strip = { width: 700, height: 2200 };
    expect(isMobileReaderStripChapter(4, sizes([strip, strip, P, strip]))).toBe(true);
    expect(buildMobileReaderPairedSpreads({ pageCount: 4, sizeAt: sizes([strip, strip, P, strip]), pairing: "cover-paired" }))
      .toEqual([[0], [1], [2], [3]]);
  });

  test("the first head is the first run of ordinary pages within the opening; the old rule only looked at page 0", () => {
    const list = [W, ...n(5)];
    const segments = mobileReaderPairingSegments(6, sizes(list));
    expect(mobileReaderFirstHeadSegment(segments)).toBe(1);
    // After a wide page the book pairs from the head, whatever the rule.
    expect(buildMobileReaderPairedSpreads({ pageCount: 6, sizeAt: sizes(list), pairing: "cover-alone" }))
      .toEqual([[0], [1, 2], [3, 4], [5]]);
  });

  test("automatic: the opening run that ends at a wide page ends on a full pair (anchor)", () => {
    const list = [...n(5), W, ...n(4)];
    const result = describeMobileReaderPairing({ pageCount: 10, sizeAt: sizes(list), pairing: "auto" });
    expect(result.spreads.slice(0, 4)).toEqual([[0], [1, 2], [3, 4], [5]]);
    expect(result.segments[0]?.source).toBe("anchor");
    const even = [...n(4), W, ...n(2)];
    expect(buildMobileReaderPairedSpreads({ pageCount: 7, sizeAt: sizes(even), pairing: "auto" }))
      .toEqual([[0, 1], [2, 3], [4], [5, 6]]);
    // The fixed rule ignores the anchor.
    expect(buildMobileReaderPairedSpreads({ pageCount: 7, sizeAt: sizes(even), pairing: "cover-alone" }))
      .toEqual([[0], [1, 2], [3], [4], [5, 6]]);
  });

  test("the learned default flips only rule-decided spreads; a chapter's own shift flips everything but anchors after wide pages", () => {
    const list = [...n(5), W, ...n(4)];
    const sizeAt = sizes(list);
    // Anchored opening: the learned default leaves it alone.
    expect(buildMobileReaderPairedSpreads({ pageCount: 10, sizeAt, pairing: "auto", fallbackShift: true }).slice(0, 3))
      .toEqual([[0], [1, 2], [3, 4]]);
    // No evidence: the learned default flips the fallback.
    expect(buildMobileReaderPairedSpreads({ pageCount: 5, sizeAt: sizes(n(5)), pairing: "auto", fallbackShift: true }))
      .toEqual([[0, 1], [2, 3], [4]]);
    // The chapter's own choice wins over evidence.
    expect(buildMobileReaderPairedSpreads({ pageCount: 10, sizeAt, pairing: "auto", shift: true }).slice(0, 3))
      .toEqual([[0, 1], [2, 3], [4]]);
  });
});
