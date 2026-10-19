import {
  MOBILE_FOLD_MIN_GUTTER,
  type MobileWindowLayout,
  type WindowReservedRegion,
} from "@/lib/mobileWindowLayout";

/**
 * Fold rule (owner decision): a folded device (book or tabletop posture, an
 * ACTIVE division) splits two-pane surfaces at the fold; a fully open (flat)
 * device uses the ordinary layout for its window size, e.g. the ~40% sidebar
 * split for manga detail and Settings. An inactive (flat) division is never a
 * split line for content.
 *
 * What remains here are the flat-fold uses: sheets and the bubble popout on
 * a window crossed by a horizontal fold (the iPhone Duo inner display in
 * portrait, an Android foldable in tabletop) snap to whole halves instead of
 * straddling the crease, folded or flat (`mobileHorizontalFoldBand`); and the
 * empty-state hero (design decision), whose art and copy sit on either side
 * of a vertical fold folded or flat so its copy does not move when the device
 * folds (`mobileVerticalFoldBand`, `mobileVerticalFoldGutterForContainer`).
 */

/** iOS division frames include Apple's 20pt interaction margin per side. */
export const MOBILE_IOS_FOLD_GUTTER = 40;

/**
 * Band height for an inactive fold, whose own reported size is unreliable:
 * iOS division frames include Apple's 20pt interaction margin on each side
 * (40pt); Android frames are physical and a Pixel Fold hinge is a zero-width
 * line that `mobileWindowPanels` widens to `MOBILE_FOLD_MIN_GUTTER` (20pt).
 */
export function mobileRestingFoldMinGutter(platform: string): number {
  return platform === "ios" ? MOBILE_IOS_FOLD_GUTTER : MOBILE_FOLD_MIN_GUTTER;
}

/** A fold band across the window, in window y coordinates (`top` < `bottom`). */
export type MobileHorizontalFoldBand = { top: number; bottom: number; active: boolean };

/** Smallest half a horizontal fold must leave above and below it to count as a split. */
const HORIZONTAL_FOLD_MIN_PANE = 120;

/**
 * Where a horizontal fold (a fold line spanning the window's whole width,
 * with room above and below it) crosses the window, folded or flat: the
 * iPhone Duo inner display in portrait, fully open or half open; an Android
 * foldable in tabletop. Null when the window has no such fold (phones,
 * tablets, the Duo outer display) or only a vertical one (book posture,
 * inner landscape).
 *
 * This is never a split line for content (a flat fold changes no pane
 * layout); surfaces that already cover part of the window (bottom sheets,
 * the bubble popout) use it to take whole halves instead of straddling the
 * crease. The band includes the fold's interaction margins: an active
 * division as `mobileWindowPanels` widens it, an inactive one centred on
 * the reported division and at least `minGutter` tall (its own height is
 * unreliable while flat: Apple's Tech Talk says the inactive division is
 * zero-wide, the Duo simulator reports the active 40pt frame).
 */
export function mobileHorizontalFoldBand(
  layout: MobileWindowLayout,
  minGutter = MOBILE_FOLD_MIN_GUTTER,
): MobileHorizontalFoldBand | null {
  const { width, height } = layout;
  if (!(width > 0 && height > 0)) return null;
  const spansWidth = (division: WindowReservedRegion) =>
    [division.x, division.y, division.width, division.height].every(Number.isFinite)
    && division.height >= 0
    && division.x <= 0.5 && division.x + division.width >= width - 0.5
    && division.y > 0 && division.y + division.height < height;
  const active = layout.divisions.some((division) => division.active);
  const division = layout.divisions.find((d) => d.active === active && spansWidth(d));
  if (!division) return null;
  const gutter = Math.max(division.height, active ? MOBILE_FOLD_MIN_GUTTER : minGutter);
  const center = division.y + division.height / 2;
  const top = Math.max(0, center - gutter / 2);
  const bottom = Math.min(height, center + gutter / 2);
  if (top < HORIZONTAL_FOLD_MIN_PANE || height - bottom < HORIZONTAL_FOLD_MIN_PANE) return null;
  return { top, bottom, active };
}

/** A fold band down the window, in window x coordinates (`left` < `right`). */
export type MobileVerticalFoldBand = { left: number; right: number; active: boolean };

/**
 * Where a vertical fold (a fold line spanning the window's whole height)
 * crosses the window, folded or flat: the iPhone Duo inner display in
 * landscape, fully open or half open (book); an Android foldable's inner
 * display held as a book. Null when the window has no such fold.
 *
 * One computation for both states, so a surface that splits on it does not
 * move when the device folds: the band is centred on the division and
 * `minGutter` wide (`mobileRestingFoldMinGutter`: the iOS 40pt frame with
 * its interaction margins, Android's 20pt minimum). The inactive division's
 * own width is never used (unreliable while flat); an active one only
 * widens the band when it is wider than `minGutter` (a physically wide
 * hinge), never narrows it. On the Duo both states give 455.5…495.5.
 */
export function mobileVerticalFoldBand(
  layout: MobileWindowLayout,
  minGutter = MOBILE_FOLD_MIN_GUTTER,
): MobileVerticalFoldBand | null {
  const { width, height } = layout;
  if (!(width > 0 && height > 0)) return null;
  const spansHeight = (division: WindowReservedRegion) =>
    [division.x, division.y, division.width, division.height].every(Number.isFinite)
    && division.width >= 0
    && division.y <= 0.5 && division.y + division.height >= height - 0.5
    && division.x > 0 && division.x + division.width < width;
  const active = layout.divisions.some((division) => division.active);
  const division = layout.divisions.find((d) => d.active === active && spansHeight(d));
  if (!division) return null;
  const gutter = active ? Math.max(division.width, minGutter) : minGutter;
  const center = division.x + division.width / 2;
  return {
    left: Math.max(0, center - gutter / 2),
    right: Math.min(width, center + gutter / 2),
    active,
  };
}

/**
 * A vertical fold band in a container's local x coordinates (`start` <
 * `end`), for a container measured in window coordinates. Null when the band
 * does not cut through the container with at least `minPane` on both sides
 * (e.g. a sheet already on one half), like `mobileFoldSplitForContainer`.
 */
export function mobileVerticalFoldGutterForContainer(
  band: Pick<MobileVerticalFoldBand, "left" | "right"> | null,
  container: { x: number; width: number } | null,
  minPane = 120,
): { start: number; end: number } | null {
  if (!band || !container) return null;
  const start = band.left - container.x;
  const end = band.right - container.x;
  if (start < minPane || container.width - end < minPane) return null;
  return { start, end };
}
