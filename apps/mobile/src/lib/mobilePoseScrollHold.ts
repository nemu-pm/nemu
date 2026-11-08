/**
 * Why a fold lost the Library's scroll position: folding shrinks the covers
 * (and the Continue Reading card) to fit a pane, so a list that was only a
 * little taller than the viewport becomes shorter than `offset + viewport`.
 * UIScrollView then clamps the offset — back to the top — and unfolding grows
 * the content again but leaves the offset where the clamp put it.
 *
 * The hold: when a pose change arrives while the list is scrolled, its
 * content gets enough extra bottom padding that the current offset stays
 * reachable through the re-layout, so nothing clamps and the first visible
 * row stays where it was (the grid's own anchor still handles a column or
 * cell-size change further down the list). Once the change has settled the
 * padding is trimmed to what the offset actually needs, and it only ever
 * shrinks after that — as the user scrolls back up it melts away, never
 * moving what is on screen.
 */

export type MobilePoseScrollMetrics = {
  /** contentOffset.y */
  offsetY: number;
  /** Adjusted top inset (large title / translucent bar). */
  insetTop: number;
  insetBottom: number;
  /** The scroll view's visible height. */
  viewportHeight: number;
  /** Reported content height (includes the current extra padding). */
  contentHeight: number;
};

/** Extra padding to add when a pose change starts: enough that no content shrink can clamp the offset. */
export function mobilePoseScrollHoldStart(metrics: MobilePoseScrollMetrics, current = 0): number {
  const scrolled = metrics.offsetY + metrics.insetTop;
  if (!(scrolled > 0.5) || !(metrics.viewportHeight > 0)) return current;
  return Math.max(current, Math.ceil(scrolled + metrics.viewportHeight));
}

/**
 * The padding the current offset still needs once the layout has settled:
 * the part of `offset + viewport` the natural content no longer reaches.
 * Never more than `extra` (the hold only shrinks).
 */
export function mobilePoseScrollHoldTrim(metrics: MobilePoseScrollMetrics, extra: number): number {
  if (extra <= 0) return 0;
  const natural = metrics.contentHeight - extra;
  const needed = Math.ceil(metrics.offsetY + metrics.viewportHeight - metrics.insetBottom - natural);
  return Math.max(0, Math.min(extra, needed));
}
