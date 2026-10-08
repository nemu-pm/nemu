/** The bar's leading side: the page margin, the back button and the gap after it. */
const LEADING = 20 + 44 + 12;
/** The trailing button group: its glass padding, each button's slot, and the page margin. */
const TRAILING_PADDING = 16;
const TRAILING_ITEM = 48;
const TRAILING_MARGIN = 20;
const GAP = 8;

export const MOBILE_EXPLORE_BAR_TITLE_MIN_WIDTH = 96;
export const MOBILE_EXPLORE_BAR_TITLE_MAX_WIDTH = 260;

/**
 * The widest the bar's title (small cover and title) may be so it stays
 * between the back button and the bar's trailing buttons: a long title is
 * truncated before the buttons instead of running underneath them. Never
 * narrower than a few characters beside the cover, never wider than reads as
 * a bar title on a wide window.
 */
export function getMobileExploreBarTitleMaxWidth(windowWidth: number, trailingItems: number): number {
  const trailing = trailingItems > 0 ? TRAILING_MARGIN + TRAILING_PADDING + TRAILING_ITEM * trailingItems : TRAILING_MARGIN;
  const room = windowWidth - LEADING - GAP - trailing;
  return Math.round(
    Math.min(MOBILE_EXPLORE_BAR_TITLE_MAX_WIDTH, Math.max(MOBILE_EXPLORE_BAR_TITLE_MIN_WIDTH, room)),
  );
}

/**
 * The bar title's width when it sits centred on the window: the same width
 * on both sides of the centre, so it clears the wider of the back button and
 * the trailing group (one menu button leaves about 236 pt on a 420 pt phone).
 */
export function getMobileExploreBarTitleCentredWidth(windowWidth: number, trailingItems: number): number {
  const trailing = trailingItems > 0 ? TRAILING_MARGIN + TRAILING_PADDING + TRAILING_ITEM * trailingItems : TRAILING_MARGIN;
  const side = Math.max(LEADING, trailing) + GAP;
  return Math.round(
    Math.min(MOBILE_EXPLORE_BAR_TITLE_MAX_WIDTH, Math.max(MOBILE_EXPLORE_BAR_TITLE_MIN_WIDTH, windowWidth - side * 2)),
  );
}

/** The bar title's cross-fade (the system's large-title hand-off is about this long). */
export const MOBILE_EXPLORE_BAR_TITLE_FADE_MS = 180;
/** Points either side of the line before the bar title changes state. */
export const MOBILE_EXPLORE_BAR_TITLE_HYSTERESIS = 8;

/**
 * Whether the bar shows the title at scroll offset `y` given whether it shows
 * it now: on once the hero's title (ending at `threshold`) is a little past
 * the bar, off once it is a little back below it, never latched either way.
 */
export function getMobileExploreBarTitleShown(shown: boolean, y: number, threshold: number): boolean {
  if (!Number.isFinite(threshold)) return false;
  return shown ? y > threshold - MOBILE_EXPLORE_BAR_TITLE_HYSTERESIS : y > threshold + MOBILE_EXPLORE_BAR_TITLE_HYSTERESIS;
}
