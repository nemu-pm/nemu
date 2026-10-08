/**
 * Whether the Library's first Continue Reading card stands in for the Now
 * Reading accessory (both name the same title, the one read last): only
 * while the Library is in front, that card is the active one, and the list
 * is scrolled less than `hideWhileScrolledUnder` (the card still shows
 * `MOBILE_NOW_READING_CARD_MIN_VISIBLE` of itself below the bar).
 */
export type MobileNowReadingCover = {
  libraryFocused: boolean;
  scrolledBy: number;
  hideWhileScrolledUnder: number | null;
  firstCardActive: boolean;
  /**
   * The window is short (a phone in landscape): the cards cannot rest whole
   * above the accessory however they shrink, so it steps aside while any of
   * them rests in view, whichever is active and in every Now Reading mode.
   */
  compactHeight?: boolean;
  /**
   * A title page is in front with its info pane beside the chapters in a
   * compact-height window. The pane holds the page's own Continue, and with
   * the tab bar and the accessory a third of the height is gone: its facts
   * and synopsis would rest under the accessory, so it steps aside there too.
   */
  shortTitlePane?: boolean;
};

/** Windows shorter than this are compact height (an iPhone in landscape is 402–440 pt). */
export const MOBILE_NOW_READING_COMPACT_HEIGHT = 500;

export function isMobileNowReadingCompactHeight(windowHeight: number): boolean {
  return windowHeight > 0 && windowHeight < MOBILE_NOW_READING_COMPACT_HEIGHT;
}

export const MOBILE_NOW_READING_CARD_MIN_VISIBLE = 80;

export function isMobileNowReadingCovered(state: MobileNowReadingCover): boolean {
  if (state.shortTitlePane === true) return true;
  return (
    state.libraryFocused &&
    (state.firstCardActive || state.compactHeight === true) &&
    state.hideWhileScrolledUnder !== null &&
    state.scrolledBy < state.hideWhileScrolledUnder
  );
}

/**
 * The scroll distance at which the first card has `MOBILE_NOW_READING_CARD_MIN_VISIBLE`
 * left below the bar: its resting bottom less the bar's bottom less that.
 */
export function getMobileNowReadingHideUnder(cardsBottomAtRest: number, barBottom: number): number {
  return Math.max(0, cardsBottomAtRest - barBottom - MOBILE_NOW_READING_CARD_MIN_VISIBLE);
}
