import type { ReadingMode } from "@/data/schema";
import { visualPageIndexesForMobileReaderSpread } from "@/lib/mobileReaderSpreads";

/**
 * A page alone in a flat spread (the fully open iPhone Duo inner display in
 * landscape, or any flat window wide enough for Auto to pair pages) rests
 * centred on the whole stage, never in its usual left / right half with the
 * other half blank:
 *
 * - a spread of one page (the cover, the page beside a wide page, the last
 *   page of a chapter) is centred, in the slide pager and in the curl;
 * - a pair whose second page (in reading order) has not loaded yet shows its
 *   first page centred and hides the second; once the second page is ready
 *   the first slides to its slot against the spine
 *   (`MOBILE_READER_LONE_PAGE_SETTLE_MS`, ease-out) while the second fades in
 *   over the same time. Pairing itself comes from the pages' metadata
 *   (sizes, binding margins), so a pair is known to be a pair before either
 *   image decodes; only its presentation waits for the second image.
 *
 * Only the flat spread centres. The book posture (half folded) keeps a lone
 * page in its reading-start pane beside the fold: centring it would lay the
 * page across the crease.
 */
export const MOBILE_READER_LONE_PAGE_SETTLE_MS = 250;

/** TEST-ONLY: the latency the "Delay Facing Page (Test)" switch adds to every page image load. */
export const MOBILE_READER_SPREAD_LOAD_DELAY_TEST_MS = 2000;

/**
 * Whether a page counts as ready for a flat spread's presentation.
 * `loadedAt`: when its image really loaded (null: not loaded); `failed`: its
 * load failed (its retry shows, so it counts as ready); `everReady`: it was
 * ready before (a page shown is never hidden again). The TEST-ONLY delay
 * models a slower network faithfully: a page counts as loaded `delayMs` after
 * it really loaded, so a page prefetched long enough before its spread shows
 * pairs at once, as a cached page does, and only a page still "loading" when
 * its spread arrives makes the first page wait centred.
 */
export function mobileReaderPageReadyForSpread(input: {
  loadedAt: number | null;
  failed: boolean;
  everReady: boolean;
  now: number;
  delayMs: number;
}): boolean {
  if (input.everReady || input.failed) return true;
  if (input.loadedAt == null) return false;
  return input.now - input.loadedAt >= Math.max(0, input.delayMs);
}

/** Lone pages centre across the whole stage: a spread laid out flat, not in fold panes. */
export function mobileReaderCentresLonePages(input: { spreadMode: boolean; panes: boolean }): boolean {
  return input.spreadMode && !input.panes;
}

export type MobileReaderFlatSpreadState = {
  /** Page indexes in visual order, left to right. */
  visual: number[];
  /** Visual slot (0 left, 1 right) of the page shown centred; null while the pages face each other. */
  centredSlot: 0 | 1 | null;
  /** Visual slot whose page waits, hidden, for its image (it fades in as the pair completes). */
  pendingSlot: 0 | 1 | null;
};

/**
 * How a flat spread presents its pages. `ready(pageIndex)`: the page's image
 * has loaded (or failed, so its retry shows; a text page is always ready).
 */
export function mobileReaderFlatSpreadState(input: {
  spread: readonly number[];
  mode: ReadingMode;
  ready: (pageIndex: number) => boolean;
}): MobileReaderFlatSpreadState {
  const { spread, mode } = input;
  if (spread.length !== 2) {
    return { visual: [...spread], centredSlot: spread.length === 1 ? 0 : null, pendingSlot: null };
  }
  const visual = visualPageIndexesForMobileReaderSpread([...spread], mode);
  if (input.ready(spread[1]!)) return { visual, centredSlot: null, pendingSlot: null };
  const first = visual.indexOf(spread[0]!) === 0 ? 0 : 1;
  return { visual, centredSlot: first, pendingSlot: first === 0 ? 1 : 0 };
}

/**
 * The horizontal shift that moves a page from its spread slot (leaning on
 * the spine: the left page's right edge, the right page's left edge, on the
 * stage centre line) to the stage centre: half its width, toward the other
 * side.
 */
export function mobileReaderLoneCentreShift(slot: 0 | 1, pageWidth: number): number {
  const half = Math.max(0, Number.isFinite(pageWidth) ? pageWidth : 0) / 2;
  return slot === 0 ? half : -half;
}

/**
 * Curl: the centred page also shows in the other leaf (each leaf clips at the
 * spine). Where that copy sits, relative to the page leaning on the spine in
 * the other leaf: a page width further across the spine, plus the same
 * shift, so the two halves always meet at the spine and, once the shift is
 * back to 0, the copy lies wholly outside its leaf.
 */
export function mobileReaderLoneCopyShift(slot: 0 | 1, pageWidth: number, shift: number): number {
  const width = Math.max(0, Number.isFinite(pageWidth) ? pageWidth : 0);
  return shift + (slot === 0 ? -width : width);
}

export type MobileReaderFlatSpreadPageRect = {
  pageIndex: number;
  /** Left edge in stage coordinates. */
  x: number;
  width: number;
  visible: boolean;
};

/**
 * Where a flat spread's pages rest on a stage `stageWidth` wide, in visual
 * order: the arithmetic the slide pager's rows and the curl's leaves follow
 * (a pair meets at the centre line; a lone or still-alone page is centred).
 */
export function mobileReaderFlatSpreadPageRects(input: {
  stageWidth: number;
  spread: readonly number[];
  mode: ReadingMode;
  widthAt: (pageIndex: number) => number;
  ready: (pageIndex: number) => boolean;
}): MobileReaderFlatSpreadPageRect[] {
  const stage = Math.max(0, Number.isFinite(input.stageWidth) ? input.stageWidth : 0);
  const centre = stage / 2;
  const state = mobileReaderFlatSpreadState(input);
  if (state.visual.length === 1) {
    const pageIndex = state.visual[0]!;
    const width = input.widthAt(pageIndex);
    return [{ pageIndex, x: centre - width / 2, width, visible: true }];
  }
  return state.visual.map((pageIndex, at) => {
    const slot = at === 0 ? 0 : 1;
    const width = input.widthAt(pageIndex);
    const paired = slot === 0 ? centre - width : centre;
    const shift = state.centredSlot === slot ? mobileReaderLoneCentreShift(slot, width) : 0;
    return { pageIndex, x: paired + shift, width, visible: state.pendingSlot !== slot };
  });
}
