import type { ReadingMode } from "@/data/schema";
import { mobileReaderPagesPairable, type MobileReaderPageSize } from "@/lib/mobileReaderPairing";
import { visualPageIndexesForMobileReaderSpread } from "@/lib/mobileReaderSpreads";

/**
 * Flat spreads (the fully open iPhone Duo inner display in landscape, or any
 * flat window wide enough for Auto to pair pages):
 *
 * - a spread of one page (the cover, the page beside a wide page, the last
 *   page of a chapter) is centred on the whole stage, in the slide pager and
 *   in the curl;
 * - a pair is laid out as a pair from its first frame, whatever has loaded:
 *   each page against the spine in its own half. A page whose image has not
 *   loaded yet keeps its place hidden and fades in where it stands
 *   (`MOBILE_READER_PAIR_PAGE_FADE_MS`); its partner never moves. (A pair
 *   that showed its first page centred until the second loaded, then slid
 *   it to the spine, read as a single page re-pairing into a spread on every
 *   fast turn.) Pairing comes from the pages' metadata, an unknown size
 *   counting as an ordinary page, so a pair is known before either decodes.
 *
 * Only the flat spread centres. The book posture (half folded) keeps a lone
 * page in its reading-start pane beside the fold: centring it would lay the
 * page across the crease.
 */
export const MOBILE_READER_PAIR_PAGE_FADE_MS = 250;

/**
 * Whether a page counts as ready for a flat spread's presentation.
 * `loaded`: its image loaded (its natural size is known); `failed`: its
 * load failed (its retry shows, so it counts as ready); `everReady`: it was
 * ready before (a page shown is never hidden again).
 */
export function mobileReaderPageReadyForSpread(input: {
  loaded: boolean;
  failed: boolean;
  everReady: boolean;
}): boolean {
  return input.everReady || input.failed || input.loaded;
}

/** Lone pages centre across the whole stage: a spread laid out flat, not in fold panes. */
export function mobileReaderCentresLonePages(input: { spreadMode: boolean; panes: boolean }): boolean {
  return input.spreadMode && !input.panes;
}

export type MobileReaderFlatSpreadState = {
  /** Page indexes in visual order, left to right. */
  visual: number[];
  /** Visual slot (0 left, 1 right) whose page waits, hidden, for its image (it fades in in place). */
  pendingSlot: 0 | 1 | null;
};

/**
 * How a flat spread presents its pages. `ready(pageIndex)`: the page's image
 * has loaded (or failed, so its retry shows; a text page is always ready).
 * A pair is always laid out facing; until both pages are ready the second
 * (reading order) waits hidden in its own slot.
 */
export function mobileReaderFlatSpreadState(input: {
  spread: readonly number[];
  mode: ReadingMode;
  ready: (pageIndex: number) => boolean;
}): MobileReaderFlatSpreadState {
  const { spread, mode } = input;
  if (spread.length !== 2) return { visual: [...spread], pendingSlot: null };
  const visual = visualPageIndexesForMobileReaderSpread([...spread], mode);
  if (mobileReaderFlatPairShown(spread, input.ready)) return { visual, pendingSlot: null };
  return { visual, pendingSlot: visual.indexOf(spread[1]!) === 0 ? 0 : 1 };
}

/** A flat spread's two pages both show: both are ready. */
export function mobileReaderFlatPairShown(spread: readonly number[], ready: (pageIndex: number) => boolean): boolean {
  return spread.length === 2 && ready(spread[0]!) && ready(spread[1]!);
}

/**
 * Whether the spread on screen is fixed as shown (never re-paired by a later
 * image load, whichever page it comes from). A spread on screen is shown as
 * it is paired from its first frame, so it is fixed at once; the one
 * exception is a pair whose own pages prove unable to face each other (a
 * page found wide, or of another shape, once its size is known). That pair
 * splits: a printed double page squeezed into half the stage reads worse
 * than one move.
 */
export function mobileReaderSpreadSettledOnScreen(input: {
  spread: readonly number[];
  sizeAt: (pageIndex: number) => MobileReaderPageSize | null | undefined;
}): boolean {
  if (input.spread.length !== 2) return true;
  return mobileReaderPagesPairable(input.sizeAt(input.spread[0]!), input.sizeAt(input.spread[1]!));
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
 * (a pair meets at the centre line, loaded or not; a lone page is centred).
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
    return { pageIndex, x: slot === 0 ? centre - width : centre, width, visible: state.pendingSlot !== slot };
  });
}
