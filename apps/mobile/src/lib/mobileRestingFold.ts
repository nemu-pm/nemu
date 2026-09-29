import {
  mobileAdaptiveLayout,
  mobileFoldSplitForContainer,
  type MobileAdaptiveLayout,
  type MobileContainerFoldSplit,
} from "@/lib/mobileAdaptiveLayout";
import {
  MOBILE_FOLD_MIN_GUTTER,
  type MobileWindowLayout,
  type WindowLayoutRect,
  type WindowReservedRegion,
} from "@/lib/mobileWindowLayout";

/**
 * The resting fold: where the device's fold crosses the window while it is
 * FLAT, so regular-width two-pane surfaces can split on it exactly like book
 * posture and folding ⇄ unfolding moves nothing (HIG, Designing for iPhone
 * Duo: "avoid extreme layout changes as people fold the device… favor small
 * adjustments over rearrangement"; Apple: "use inactive regions to make
 * high-level decisions about your app").
 *
 * A fully open iPhone Duo still reports its division, only inactive (iOS
 * `reservedRegions(kind: .division, options: .includeInactive)`; Android a
 * FLAT, non-separating `FoldingFeature`). Content may still cross it — it is
 * not a reserved region while inactive — it is only a split line.
 *
 * Only a book-axis division (a vertical fold line, left/right halves) rests:
 * the notebook split (top/bottom) would cut the common fully-open portrait
 * pose in half, so portrait keeps its flat layouts.
 *
 * Gutter: never the inactive region's own width. Apple's Tech Talk says the
 * inactive division is zero-wide when flat; the Duo simulator reports the
 * active 40pt frame. So the resting gutter is centred on the division and
 * takes, in order: the width the active fold had at this window size earlier
 * in the session (exact match with book posture), else the platform's active
 * fold width — iOS division frames include Apple's 20pt interaction margin on
 * each side (40pt), Android frames are physical and a Pixel Fold hinge is a
 * zero-width line that `mobileWindowPanels` widens to `MOBILE_FOLD_MIN_GUTTER`
 * (20pt) — whichever is wider than what the region reports.
 */

/** iOS division frames include Apple's 20pt interaction margin per side. */
export const MOBILE_IOS_FOLD_GUTTER = 40;

/** Resting-fold gutter for a platform when no active fold has been seen yet. */
export function mobileRestingFoldMinGutter(platform: string): number {
  return platform === "ios" ? MOBILE_IOS_FOLD_GUTTER : MOBILE_FOLD_MIN_GUTTER;
}

type LearnedFold = { center: number; x: number; width: number };

/** Active book-axis folds seen this session, keyed by window size. */
const learnedFolds = new Map<string, LearnedFold>();

function windowKey(layout: Pick<MobileWindowLayout, "width" | "height">) {
  return `${Math.round(layout.width)}x${Math.round(layout.height)}`;
}

/** A vertical fold line crossing the whole window height, strictly inside its width. */
function crossesAsBook(region: WindowLayoutRect, layout: Pick<MobileWindowLayout, "width" | "height">) {
  return region.y <= 0.5 && region.y + region.height >= layout.height - 0.5
    && region.x > 0 && region.x + region.width < layout.width;
}

function bookAxisDivisions(layout: MobileWindowLayout, active: boolean): WindowReservedRegion[] {
  return layout.divisions.filter((division) =>
    division.active === active
    && [division.x, division.y, division.width, division.height].every(Number.isFinite)
    && division.width >= 0
    && crossesAsBook(division, layout));
}

/**
 * Remember the active book-axis fold for this window size so the resting fold
 * matches it exactly after unfolding. Call with every observed layout (the
 * container hooks do); cheap and idempotent.
 */
export function noteMobileActiveFold(layout: MobileWindowLayout) {
  const [division] = bookAxisDivisions(layout, true);
  if (!division) return;
  const x = division.width >= MOBILE_FOLD_MIN_GUTTER
    ? division.x
    : division.x + division.width / 2 - MOBILE_FOLD_MIN_GUTTER / 2;
  const width = Math.max(division.width, MOBILE_FOLD_MIN_GUTTER);
  learnedFolds.set(windowKey(layout), { center: x + width / 2, x, width });
}

/** Tests only: forget the folds seen so far. */
export function resetMobileRestingFoldMemory() {
  learnedFolds.clear();
}

/**
 * The window layout as it would be folded as a book, when it is flat and
 * reports an inactive book-axis division; null otherwise (active fold, no
 * fold, notebook-axis fold only). Feed it to `mobileAdaptiveLayout` /
 * `mobileFoldSplitForContainer` like an active layout.
 */
export function mobileRestingFoldLayout(
  layout: MobileWindowLayout,
  minGutter = MOBILE_FOLD_MIN_GUTTER,
): MobileWindowLayout | null {
  if (layout.divisions.some((division) => division.active)) return null;
  const [division] = bookAxisDivisions(layout, false);
  if (!division) return null;
  const center = division.x + division.width / 2;
  const learned = learnedFolds.get(windowKey(layout));
  let x: number;
  let width: number;
  if (learned && Math.abs(learned.center - center) < 1) {
    x = learned.x;
    width = learned.width;
  } else {
    width = Math.max(division.width, minGutter);
    x = center - width / 2;
  }
  return {
    ...layout,
    divisions: [{ ...division, active: true, x, width, y: 0, height: layout.height }],
  };
}

/**
 * `mobileAdaptiveLayout` of the resting fold: posture `book`, `fold` and
 * `panels` on the inactive division. Null when there is no resting fold.
 */
export function mobileRestingFoldAdaptive(
  layout: MobileWindowLayout,
  minGutter = MOBILE_FOLD_MIN_GUTTER,
): MobileAdaptiveLayout | null {
  const resting = mobileRestingFoldLayout(layout, minGutter);
  if (!resting) return null;
  const adaptive = mobileAdaptiveLayout(resting);
  return adaptive.posture === "book" ? adaptive : null;
}

/**
 * Where the resting fold crosses a container (window coordinates), with the
 * exact geometry `mobileFoldSplitForContainer` returns for the same division
 * when it is active. Null while an active fold is present (use the active
 * split) or when the resting division does not cut through the container
 * with room on both sides.
 */
export function mobileRestingFoldSplitForContainer(
  layout: MobileWindowLayout,
  container: WindowLayoutRect,
  minPane = 120,
  minGutter = MOBILE_FOLD_MIN_GUTTER,
): MobileContainerFoldSplit | null {
  const resting = mobileRestingFoldAdaptive(layout, minGutter);
  return resting ? mobileFoldSplitForContainer(resting, container, minPane) : null;
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
 * Unlike the book-axis resting fold this one is never a split line for
 * content; surfaces that already cover part of the window (bottom sheets,
 * the bubble popout) use it to take whole halves instead of straddling the
 * crease. The band includes the fold's interaction margins: an active
 * division as `mobileWindowPanels` widens it, an inactive one centred on
 * the reported division and at least `minGutter` tall (its own height is
 * unreliable while flat, see `mobileRestingFoldLayout`).
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
