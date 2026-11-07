import { describe, expect, test } from "bun:test";
import type { ReadingMode } from "@/data/schema";
import {
  MOBILE_READER_PAIR_PAGE_FADE_MS,
  mobileReaderPageReadyForSpread,
  mobileReaderCentresLonePages,
  mobileReaderFlatSpreadPageRects,
  mobileReaderFlatSpreadState,
  mobileReaderSpreadSettledOnScreen,
} from "./mobileReaderLoneSpreadPage";
import {
  buildMobileReaderPairedSpreads,
  nextMobileReaderSpreadTable,
  type MobileReaderPageSize,
} from "./mobileReaderPairing";
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

    test(`second page not loaded yet: the pair is laid out facing, the second hidden in its slot (${mode})`, () => {
      const ready = (index: number) => index !== 2;
      const rects = mobileReaderFlatSpreadPageRects({ stageWidth: STAGE, spread: [1, 2], mode, widthAt, ready });
      const first = rects.find((rect) => rect.pageIndex === 1)!;
      const second = rects.find((rect) => rect.pageIndex === 2)!;
      // The first page leans on the spine, on its reading-start side.
      if (mode === "rtl") expect(first.x).toBeCloseTo(CENTRE, 6);
      else expect(first.x + first.width).toBeCloseTo(CENTRE, 6);
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

  test("a pair waiting on a page hides only its second page (reading order)", () => {
    expect(mobileReaderFlatSpreadState({ spread: [1, 2], mode: "ltr", ready: (index) => index === 2 })).toEqual({
      visual: [1, 2],
      pendingSlot: 1,
    });
    expect(mobileReaderFlatSpreadState({ spread: [1, 2], mode: "ltr", ready: () => false })).toEqual({
      visual: [1, 2],
      pendingSlot: 1,
    });
    expect(mobileReaderFlatSpreadState({ spread: [1, 2], mode: "rtl", ready: () => false })).toEqual({
      visual: [2, 1],
      pendingSlot: 0,
    });
    expect(mobileReaderFlatSpreadState({ spread: [1, 2], mode: "rtl", ready: () => true }).pendingSlot).toBeNull();
    expect(mobileReaderFlatSpreadState({ spread: [3], mode: "rtl", ready: () => false }).pendingSlot).toBeNull();
  });

  test("the second page's arrival moves nothing: it only fades in, in 250 ms", () => {
    expect(MOBILE_READER_PAIR_PAGE_FADE_MS).toBe(250);
    for (const mode of MODES) {
      const before = mobileReaderFlatSpreadPageRects({ stageWidth: STAGE, spread: [3, 4], mode, widthAt, ready: (i) => i !== 4 });
      const after = mobileReaderFlatSpreadPageRects({ stageWidth: STAGE, spread: [3, 4], mode, widthAt, ready: allReady });
      expect(after.map(({ pageIndex, x, width }) => ({ pageIndex, x, width }))).toEqual(
        before.map(({ pageIndex, x, width }) => ({ pageIndex, x, width })),
      );
      expect(before.find((rect) => rect.pageIndex === 4)!.visible).toBe(false);
      expect(after.every((rect) => rect.visible)).toBe(true);
    }
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

describe("page readiness for a flat spread", () => {
  const base = { loaded: false, failed: false, everReady: false };

  test("a loaded or failed page is ready; a loading one is not", () => {
    expect(mobileReaderPageReadyForSpread({ ...base, loaded: true })).toBe(true);
    expect(mobileReaderPageReadyForSpread({ ...base, failed: true })).toBe(true);
    expect(mobileReaderPageReadyForSpread(base)).toBe(false);
  });

  test("a page once ready never turns unready again (its facing page is never hidden after showing)", () => {
    expect(mobileReaderPageReadyForSpread({ ...base, everReady: true })).toBe(true);
    const spread = [1, 2];
    const shown = mobileReaderFlatSpreadState({ spread, mode: "rtl", ready: () => true });
    expect(shown.pendingSlot).toBeNull();
  });
});

describe("a spread on screen never re-pairs as its neighbours load", () => {
  const wide = { width: 2000, height: 1400 };
  const normal = { width: 1000, height: 1400 };
  const sizeAtOf = (sizes: Array<MobileReaderPageSize | null>) => (index: number) => sizes[index] ?? null;

  test("a pair on screen is fixed at once, loaded or not; only a pair its own pages cannot form is not", () => {
    expect(mobileReaderSpreadSettledOnScreen({ spread: [2, 3], sizeAt: () => null })).toBe(true);
    expect(mobileReaderSpreadSettledOnScreen({ spread: [2, 3], sizeAt: sizeAtOf([null, null, normal, null]) })).toBe(true);
    expect(mobileReaderSpreadSettledOnScreen({ spread: [2, 3], sizeAt: sizeAtOf([null, null, normal, normal]) })).toBe(true);
    expect(mobileReaderSpreadSettledOnScreen({ spread: [2, 3], sizeAt: sizeAtOf([null, null, normal, wide]) })).toBe(false);
    // A page 30% wider than its partner is an insert, not its facing page.
    expect(mobileReaderSpreadSettledOnScreen({ spread: [2, 3], sizeAt: sizeAtOf([null, null, normal, { width: 1300, height: 1400 }]) })).toBe(false);
    expect(mobileReaderSpreadSettledOnScreen({ spread: [2], sizeAt: sizeAtOf([null, null, wide]) })).toBe(true);
  });

  /**
   * Fast turns into pages not loaded yet: the reader lands on a pair whose
   * pages have no size, then the pages around it load. `step` replays how
   * the reader rebuilds its table (ReaderScreen: computed from the sizes
   * known, kept by `nextMobileReaderSpreadTable`, the spread on screen
   * displayed while it is settled).
   */
  function replay(pairing: "cover-alone" | "cover-paired", pageCount: number) {
    const sizes: Array<MobileReaderPageSize | null> = Array.from({ length: pageCount }, () => null);
    const sizeAt = sizeAtOf(sizes);
    let table = buildMobileReaderPairedSpreads({ pageCount, sizeAt, pairing });
    const step = (currentPageIndex: number, overrides?: { computed?: number[][] }) => {
      const computed = overrides?.computed ?? buildMobileReaderPairedSpreads({ pageCount, sizeAt, pairing });
      const onScreen = table.find((spread) => spread.includes(currentPageIndex));
      table = nextMobileReaderSpreadTable({
        previous: table,
        computed,
        reset: false,
        currentPageIndex,
        displayed: mobileReaderSpreadSettledOnScreen({ spread: onScreen ?? [], sizeAt }),
      });
      return table;
    };
    return { sizes, step, table: () => table };
  }

  test("pages after the one on screen load (one of them wide): the pair on screen stays, only spreads ahead re-pair", () => {
    const run = replay("cover-alone", 14);
    expect(run.table().slice(0, 4)).toEqual([[0], [1, 2], [3, 4], [5, 6]]);
    // Fast turns: on [5, 6], neither loaded. Page 5 loads, then 6, then 7 (wide), then 8–13.
    for (const page of [5, 6]) {
      run.sizes[page] = normal;
      expect(run.step(5).find((spread) => spread.includes(5))).toEqual([5, 6]);
    }
    run.sizes[7] = wide;
    const afterWide = run.step(5);
    expect(afterWide.find((spread) => spread.includes(5))).toEqual([5, 6]);
    expect(afterWide).toContainEqual([7]);
    for (let page = 8; page < 14; page += 1) run.sizes[page] = normal;
    const settled = run.step(5);
    expect(settled.slice(0, 5)).toEqual([[0], [1, 2], [3, 4], [5, 6], [7]]);
    // After a wide page the pages pair from its next page.
    expect(settled.slice(5)).toEqual([[8, 9], [10, 11], [12, 13]]);
  });

  test("a later evidence flip of the segment's parity never re-pairs the spread on screen", () => {
    const run = replay("cover-alone", 10);
    expect(run.step(3).find((spread) => spread.includes(3))).toEqual([3, 4]);
    // Pairing learns (binding margins on pages loaded later) that the run pairs from page 0.
    const flipped = run.step(3, { computed: [[0, 1], [2, 3], [4, 5], [6, 7], [8, 9]] });
    expect(flipped.find((spread) => spread.includes(3))).toEqual([3, 4]);
    expect(flipped.slice(0, 3)).toEqual([[0], [1, 2], [3, 4]]);
    // The page straddling the old and new pairing stands alone once, then the new pairing goes on.
    expect(flipped.slice(3)).toEqual([[5], [6, 7], [8, 9]]);
  });

  test("the pair's own page found wide splits it (a double page is never squeezed into half the stage)", () => {
    // Index 1 (the credits page) has no size yet: pairing reads it as an ordinary page.
    const run = replay("cover-alone", 6);
    expect(run.table().find((spread) => spread.includes(1))).toEqual([1, 2]);
    run.sizes[2] = normal;
    expect(run.step(1).find((spread) => spread.includes(1))).toEqual([1, 2]);
    run.sizes[1] = wide;
    const after = run.step(1);
    expect(after.find((spread) => spread.includes(1))).toEqual([1]);
    expect(after.slice(0, 2)).toEqual([[0], [1]]);
  });

  test("the first page alone, both pairings, sizes arriving in any order", () => {
    for (const pairing of ["cover-alone", "cover-paired"] as const) {
      const run = replay(pairing, 9);
      const initial = run.table().map((spread) => [...spread]);
      expect(initial[0]).toEqual(pairing === "cover-alone" ? [0] : [0, 1]);
      for (const page of [4, 0, 8, 2, 6, 1, 3, 7, 5]) {
        run.sizes[page] = normal;
        run.step(4);
      }
      expect(run.table()).toEqual(initial);
    }
  });
});
