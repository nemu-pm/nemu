import type { MobileAdaptiveLayout } from "@/lib/mobileAdaptiveLayout";
import { READER_LAPTOP_CREASE_CLEARANCE } from "@/lib/mobileReaderPoseLayout";

/** The bar's leading side: the page margin, the back button and the gap after it. */
const LEADING = 20 + 44 + 12;
/** The trailing button group: its glass padding, each button's slot, and the page margin. */
const TRAILING_PADDING = 16;
const TRAILING_ITEM = 48;
const TRAILING_MARGIN = 20;
const GAP = 8;

const MOBILE_EXPLORE_BAR_TITLE_MIN_WIDTH = 96;
const MOBILE_EXPLORE_BAR_TITLE_MAX_WIDTH = 260;

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

/** Book posture: the bar title's inset from either edge of the leading pane. */
export const MOBILE_EXPLORE_BAR_TITLE_PANE_MARGIN = 16;
/**
 * Book posture: the bar title ends at least this far before the fold
 * region's leading edge — the reader's clearance, measured from the region's
 * edge, never its centre line (a 40pt region would swallow it).
 */
export const MOBILE_EXPLORE_BAR_TITLE_FOLD_CLEARANCE = READER_LAPTOP_CREASE_CLEARANCE;

/**
 * Where the bar title sits in book posture, in window coordinates: centred
 * in the left pane (from the window's left edge to the fold region's leading
 * edge), at most the pane less 16pt a side wide and ending at least 20pt
 * before the fold, the tail truncated past that. The left pane is the
 * leading one in both book orientations (book-flipped included). Null in
 * every other posture: the bar keeps its own placement there.
 */
export function getMobileExploreBarTitleBookFrame(
  adaptive: Pick<MobileAdaptiveLayout, "posture" | "fold">,
): { x: number; width: number } | null {
  const fold = adaptive.fold;
  if (adaptive.posture !== "book" || !fold) return null;
  if (![fold.x, fold.width].every(Number.isFinite)) return null;
  const paneEnd = fold.x;
  if (paneEnd <= 0) return null;
  const centre = paneEnd / 2;
  const start = MOBILE_EXPLORE_BAR_TITLE_PANE_MARGIN;
  const end = Math.min(paneEnd - MOBILE_EXPLORE_BAR_TITLE_PANE_MARGIN, paneEnd - MOBILE_EXPLORE_BAR_TITLE_FOLD_CLEARANCE);
  // The same room either side of the pane's centre, whole points.
  const width = Math.max(0, Math.floor(2 * Math.min(centre - start, end - centre)));
  return { x: centre - width / 2, width };
}

/**
 * Where the bar lays out a title view `slotWidth` wide, in window x, computed
 * rather than measured. UIKit centres the title view on the bar between its
 * layout margins — the safe area (a vertical bar column) plus the system
 * minimum margins, the same edges as the page gutters (`margins`) — and only
 * moves it off that centre to clear the bar's own leading/trailing items.
 * `inlineItems` is the room those items take from either edge, or null when
 * they sit in the vertical bar (the rail) instead of the horizontal bar.
 *
 * Not measured on purpose: `measureInWindow` on a header title reads the
 * react-native-screens header subview's shadow origin, which native only
 * refreshes from the subview's own `layoutSubviews` (a size change). When the
 * bar re-centres the title without resizing it (laptop → book: the slot grows
 * from 260 to 415 and is re-centred a pass later), the origin JS sees stays
 * the old one — 77.35pt off on the Duo — and no layout event ever corrects it.
 */
export function getMobileExploreBarTitleSlotX({
  windowWidth,
  slotWidth,
  margins,
  inlineItems = null,
}: {
  windowWidth: number;
  slotWidth: number;
  margins: { left: number; right: number };
  inlineItems?: { leading: number; trailing: number } | null;
}): number | null {
  if (![windowWidth, slotWidth, margins.left, margins.right].every(Number.isFinite)) return null;
  const centre = (margins.left + windowWidth - margins.right) / 2;
  let x = centre - slotWidth / 2;
  if (inlineItems) {
    const min = inlineItems.leading;
    const max = windowWidth - inlineItems.trailing - slotWidth;
    if (max >= min) x = Math.min(max, Math.max(min, x));
  }
  return x;
}

/**
 * The horizontal bar's own items on either side of the title (back button;
 * the trailing group), for `getMobileExploreBarTitleSlotX`.
 */
export function getMobileExploreBarTitleInlineItems(trailingItems: number): { leading: number; trailing: number } {
  const trailing = trailingItems > 0 ? TRAILING_MARGIN + TRAILING_PADDING + TRAILING_ITEM * trailingItems : TRAILING_MARGIN;
  return { leading: LEADING, trailing: trailing + GAP };
}

/**
 * How far to move the bar title from where the bar laid it out (`measuredX`,
 * its window x — `getMobileExploreBarTitleSlotX`) to `targetX`; 0 while unknown.
 */
export function getMobileExploreBarTitleShift(targetX: number, measuredX: number | null): number {
  if (measuredX === null || !Number.isFinite(measuredX) || !Number.isFinite(targetX)) return 0;
  return targetX - measuredX;
}

/** The bar title's cross-fade (the system's large-title hand-off is about this long). */
export const MOBILE_EXPLORE_BAR_TITLE_FADE_MS = 180;
/** Points either side of the line before the bar title changes state. */
const MOBILE_EXPLORE_BAR_TITLE_HYSTERESIS = 8;

/**
 * Whether the bar shows the title at scroll offset `y` given whether it shows
 * it now: on once the hero's title (ending at `threshold`) is a little past
 * the bar, off once it is a little back below it, never latched either way.
 */
export function getMobileExploreBarTitleShown(shown: boolean, y: number, threshold: number): boolean {
  if (!Number.isFinite(threshold)) return false;
  return shown ? y > threshold - MOBILE_EXPLORE_BAR_TITLE_HYSTERESIS : y > threshold + MOBILE_EXPLORE_BAR_TITLE_HYSTERESIS;
}
