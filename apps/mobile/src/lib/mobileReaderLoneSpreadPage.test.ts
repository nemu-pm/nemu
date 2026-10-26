import { describe, expect, test } from "bun:test";
import type { ReadingMode } from "@/data/schema";
import {
  MOBILE_READER_LONE_PAGE_SETTLE_MS,
  MOBILE_READER_SPREAD_LOAD_DELAY_TEST_MS,
  mobileReaderPageReadyForSpread,
  mobileReaderCentresLonePages,
  mobileReaderFlatSpreadPageRects,
  mobileReaderFlatSpreadState,
  mobileReaderLoneCentreShift,
  mobileReaderLoneCopyShift,
  mobileReaderSpreadSettledOnScreen,
} from "./mobileReaderLoneSpreadPage";
import { buildMobileReaderPairedSpreads, nextMobileReaderSpreadTable } from "./mobileReaderPairing";
import { buildMobileReaderCurlSlots } from "./mobileReaderPageCurl";

// The iPhone Duo inner display, fully open (flat) in landscape.
const STAGE = 951;
const CENTRE = STAGE / 2;
const PAGE = { width: 1000, height: 1450 };
const WIDE = { width: 2000, height: 1450 };
const MODES: ReadingMode[] = ["rtl", "ltr"];
// Fitted widths as the reader frames them: a pair's pages share one height.
const widthAt = () => 461.2;
const allReady = () => true;

function centreOf(rect: { x: number; width: number }): number {
  return rect.x + rect.width / 2;
}

/** The spread containing `page` in Auto pairing, sizes from page metadata. */
function spreadOf(sizes: { width: number; height: number }[], page: number): number[] {
  const spreads = buildMobileReaderPairedSpreads({ pageCount: sizes.length, sizeAt: (index) => sizes[index], pairing: "auto" });
  return spreads.find((spread) => spread.includes(page))!;
}

describe("flat spread: a lone page is centred on the whole stage", () => {
  for (const mode of MODES) {
    test(`cover (${mode})`, () => {
      const spread = spreadOf(Array.from({ length: 9 }, () => PAGE), 0);
      expect(spread).toEqual([0]);
      const [cover] = mobileReaderFlatSpreadPageRects({ stageWidth: STAGE, spread, mode, widthAt, ready: allReady });
      expect(Math.abs(centreOf(cover!) - CENTRE)).toBeLessThanOrEqual(1);
      expect(cover!.visible).toBe(true);
    });

    test(`page next to a wide page (${mode})`, () => {
      // An odd run between two wide pages: 3–4 pair after the wide 2, and 5
      // stands alone before the wide 6.
      const sizes = [PAGE, PAGE, WIDE, PAGE, PAGE, PAGE, WIDE, PAGE, PAGE];
      const spreads = buildMobileReaderPairedSpreads({ pageCount: sizes.length, sizeAt: (index) => sizes[index], pairing: "auto" });
      expect(spreads).toContainEqual([5]);
      for (const spread of [[5], [2], [6]]) {
        expect(spreads).toContainEqual(spread);
        const [page] = mobileReaderFlatSpreadPageRects({ stageWidth: STAGE, spread, mode, widthAt, ready: allReady });
        expect(Math.abs(centreOf(page!) - CENTRE)).toBeLessThanOrEqual(1);
      }
    });

    test(`last page (${mode})`, () => {
      const spread = spreadOf(Array.from({ length: 8 }, () => PAGE), 7);
      expect(spread).toEqual([7]);
      const [last] = mobileReaderFlatSpreadPageRects({ stageWidth: STAGE, spread, mode, widthAt, ready: allReady });
      expect(Math.abs(centreOf(last!) - CENTRE)).toBeLessThanOrEqual(1);
    });

    test(`second page not loaded yet: the first is centred, the second hidden (${mode})`, () => {
      const ready = (index: number) => index !== 2;
      const rects = mobileReaderFlatSpreadPageRects({ stageWidth: STAGE, spread: [1, 2], mode, widthAt, ready });
      const first = rects.find((rect) => rect.pageIndex === 1)!;
      const second = rects.find((rect) => rect.pageIndex === 2)!;
      expect(Math.abs(centreOf(first) - CENTRE)).toBeLessThanOrEqual(1);
      expect(first.visible).toBe(true);
      expect(second.visible).toBe(false);
    });

    test(`the complete pair meets at the spine, first page on the reading-start side (${mode})`, () => {
      const rects = mobileReaderFlatSpreadPageRects({ stageWidth: STAGE, spread: [1, 2], mode, widthAt, ready: allReady });
      const [left, right] = rects;
      expect(left!.x + left!.width).toBeCloseTo(CENTRE, 6);
      expect(right!.x).toBeCloseTo(CENTRE, 6);
      expect(left!.pageIndex).toBe(mode === "rtl" ? 2 : 1);
      expect(rects.every((rect) => rect.visible)).toBe(true);
    });
  }

  test("the pair faces only once both pages are ready: a first page of unknown size waits centred too", () => {
    expect(mobileReaderFlatSpreadState({ spread: [1, 2], mode: "ltr", ready: (index) => index === 2 })).toMatchObject({
      centredSlot: 0,
      pendingSlot: 1,
    });
    expect(mobileReaderFlatSpreadState({ spread: [1, 2], mode: "ltr", ready: () => false })).toMatchObject({
      visual: [1, 2],
      centredSlot: 0,
      pendingSlot: 1,
    });
    expect(mobileReaderFlatSpreadState({ spread: [1, 2], mode: "rtl", ready: () => false })).toMatchObject({
      visual: [2, 1],
      centredSlot: 1,
      pendingSlot: 0,
    });
  });

  test("the settle moves only by the centring shift (no jump), in 250 ms", () => {
    expect(MOBILE_READER_LONE_PAGE_SETTLE_MS).toBe(250);
    for (const mode of MODES) {
      const before = mobileReaderFlatSpreadPageRects({ stageWidth: STAGE, spread: [3, 4], mode, widthAt, ready: (i) => i !== 4 });
      const after = mobileReaderFlatSpreadPageRects({ stageWidth: STAGE, spread: [3, 4], mode, widthAt, ready: allReady });
      const slot = before.findIndex((rect) => rect.pageIndex === 3) as 0 | 1;
      expect(after[slot]!.x + mobileReaderLoneCentreShift(slot, widthAt())).toBeCloseTo(before[slot]!.x, 6);
      // The page's size never changes: it only slides.
      expect(after[slot]!.width).toBe(before[slot]!.width);
    }
  });

  test("curl: the copy in the other leaf meets the page at the spine, and leaves it once settled", () => {
    const width = 400;
    const half = STAGE / 2;
    // Centred page in the left leaf: its copy in the right leaf (x from the spine, leaning left).
    const shift0 = mobileReaderLoneCentreShift(0, width);
    expect(mobileReaderLoneCopyShift(0, width, shift0)).toBe(-width / 2); // spans [-w/2, w/2]
    expect(mobileReaderLoneCopyShift(0, width, 0)).toBe(-width); // wholly left of the spine
    // Centred page in the right leaf: its copy in the left leaf (leaning on the spine at `half`).
    const shift1 = mobileReaderLoneCentreShift(1, width);
    expect(half - width + mobileReaderLoneCopyShift(1, width, shift1) + width / 2).toBe(half);
    expect(mobileReaderLoneCopyShift(1, width, 0)).toBe(width);
  });

  test("curl: a lone page lies across the spine in a flat spread, on one leaf in fold panes", () => {
    for (const mode of MODES) {
      const frames = mode === "rtl" ? [[3], [1, 2], [0]] : [[0], [1, 2], [3]];
      const flat = buildMobileReaderCurlSlots({ frames, spreadMode: true, mode, isWide: () => false, centreLone: true });
      expect(flat.filter((slot) => slot.kind === "blank")).toEqual([]);
      for (const page of [0, 3]) {
        const parts = flat.filter((slot) => slot.kind === "page" && slot.pageIndex === page).map((slot) => slot.kind === "page" ? slot.part : null);
        expect(parts).toEqual(["left", "right"]);
      }
      const book = buildMobileReaderCurlSlots({ frames, spreadMode: true, mode, isWide: () => false });
      expect(book.filter((slot) => slot.kind === "blank").length).toBe(2);
    }
  });

  test("only the flat spread centres; the book posture keeps its panes", () => {
    expect(mobileReaderCentresLonePages({ spreadMode: true, panes: false })).toBe(true);
    expect(mobileReaderCentresLonePages({ spreadMode: true, panes: true })).toBe(false);
    expect(mobileReaderCentresLonePages({ spreadMode: false, panes: false })).toBe(false);
  });
});

describe("page readiness for a flat spread (and the TEST-ONLY load delay)", () => {
  const base = { loadedAt: null, failed: false, everReady: false, now: 10_000, delayMs: 0 };

  test("without the delay a loaded or failed page is ready; a loading one is not", () => {
    expect(mobileReaderPageReadyForSpread({ ...base, loadedAt: 9_999 })).toBe(true);
    expect(mobileReaderPageReadyForSpread({ ...base, failed: true })).toBe(true);
    expect(mobileReaderPageReadyForSpread(base)).toBe(false);
  });

  test("the delay counts from the real load: a page prefetched long enough before its spread pairs at once", () => {
    const delayMs = MOBILE_READER_SPREAD_LOAD_DELAY_TEST_MS;
    // Loaded (prefetched or visited) 2 s+ before the spread arrives: the pair shows directly.
    expect(mobileReaderPageReadyForSpread({ ...base, delayMs, loadedAt: 10_000 - delayMs })).toBe(true);
    // Loaded just now: still "loading", the first page waits centred.
    expect(mobileReaderPageReadyForSpread({ ...base, delayMs, loadedAt: 9_500 })).toBe(false);
    expect(mobileReaderPageReadyForSpread({ ...base, delayMs })).toBe(false);
  });

  test("a page once ready never turns unready again (its facing page is never hidden after showing)", () => {
    expect(mobileReaderPageReadyForSpread({ ...base, delayMs: 2000, everReady: true })).toBe(true);
    expect(mobileReaderPageReadyForSpread({ ...base, everReady: true })).toBe(true);
    const spread = [1, 2];
    const shown = mobileReaderFlatSpreadState({ spread, mode: "rtl", ready: () => true });
    expect(shown.pendingSlot).toBeNull();
  });
});

describe("a page whose size is unknown is never shown paired (D2)", () => {
  const wide = { width: 2000, height: 1400 };
  const normal = { width: 1000, height: 1400 };

  test("a pair shows facing only once both pages are ready; else its first page alone, centred", () => {
    for (const mode of ["rtl", "ltr"] as ReadingMode[]) {
      const firstMissing = mobileReaderFlatSpreadState({ spread: [2, 3], mode, ready: (index) => index === 3 });
      const firstSlot = firstMissing.visual.indexOf(2) as 0 | 1;
      expect(firstMissing.centredSlot).toBe(firstSlot);
      expect(firstMissing.pendingSlot).toBe(firstSlot === 0 ? 1 : 0);
      expect(mobileReaderFlatSpreadState({ spread: [2, 3], mode, ready: () => true }).centredSlot).toBeNull();
    }
  });

  test("a flat pair not yet shown facing is not fixed on screen; lone pages and fold panes are", () => {
    const notReady = (index: number) => index !== 2;
    expect(mobileReaderSpreadSettledOnScreen({ spread: [2, 3], centresLonePages: true, ready: notReady })).toBe(false);
    expect(mobileReaderSpreadSettledOnScreen({ spread: [2, 3], centresLonePages: true, ready: () => true })).toBe(true);
    expect(mobileReaderSpreadSettledOnScreen({ spread: [2], centresLonePages: true, ready: () => false })).toBe(true);
    expect(mobileReaderSpreadSettledOnScreen({ spread: [2, 3], centresLonePages: false, ready: () => false })).toBe(true);
  });

  test("Ch.95: a wide credits page found while its pair waits splits off and stays alone; the shown pairing never splits", () => {
    // Index 1 (the credits page) has no size yet: pairing reads it as an ordinary page.
    const sizes: Array<{ width: number; height: number } | null> = [normal, null, normal, normal, normal, normal];
    const build = () => buildMobileReaderPairedSpreads({ pageCount: sizes.length, sizeAt: (index) => sizes[index] ?? null, pairing: "cover-alone" });
    const before = build();
    const current = before.find((spread) => spread.includes(1))!;
    expect(current.length).toBe(2);
    // Index 1 not ready: its pair shows it alone, centred, and is not fixed.
    const settled = mobileReaderSpreadSettledOnScreen({ spread: current, centresLonePages: true, ready: (index) => index !== 1 });
    expect(settled).toBe(false);
    sizes[1] = wide;
    const after = nextMobileReaderSpreadTable({ previous: before, computed: build(), reset: false, currentPageIndex: 1, displayed: settled });
    expect(after.find((spread) => spread.includes(1))).toEqual([1]);
    // Had the pair been shown facing, it would have stayed (never split under the reader).
    const kept = nextMobileReaderSpreadTable({ previous: before, computed: build(), reset: false, currentPageIndex: 1, displayed: true });
    expect(kept.find((spread) => spread.includes(1))).toEqual(current);
  });
});
