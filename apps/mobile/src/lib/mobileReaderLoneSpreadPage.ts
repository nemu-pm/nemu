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
 *   each page against the spine in its own half. Each page shows its own
 *   state in place: the reader background and a spinner while it waits
 *   (`MobileReaderPageFrame`, centred on its half), then its image fading in.
 *   Its partner never moves. (A pair that showed its first page centred until
 *   the second loaded, then slid it to the spine, read as a single page
 *   re-pairing into a spread on every fast turn.) Pairing comes from the
 *   pages' metadata, an unknown size counting as an ordinary page, so a pair
 *   is known before either decodes.
 *
 * Only the flat spread centres. The book posture (half folded) keeps a lone
 * page in its reading-start pane beside the fold: centring it would lay the
 * page across the crease.
 */
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

/** Both pages of a flat spread's pair have their image (or their retry). */
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
}): MobileReaderFlatSpreadPageRect[] {
  const stage = Math.max(0, Number.isFinite(input.stageWidth) ? input.stageWidth : 0);
  const centre = stage / 2;
  if (input.spread.length !== 2) {
    return input.spread.map((pageIndex) => {
      const width = input.widthAt(pageIndex);
      return { pageIndex, x: centre - width / 2, width };
    });
  }
  return visualPageIndexesForMobileReaderSpread([...input.spread], input.mode).map((pageIndex, at) => {
    const width = input.widthAt(pageIndex);
    return { pageIndex, x: at === 0 ? centre - width : centre, width };
  });
}
