import type { ReadingMode } from "@/data/schema";

export type ReaderEdgeDragMetrics = {
  /** Scroll offset (x in paged mode, y in scrolling mode) when the drag began. */
  startOffset: number;
  /** Scroll offset at the moment the finger lifted. */
  endOffset: number;
  /** Largest scrollable offset: contentSize - layoutMeasurement on the scroll axis. */
  maxOffset: number;
  mode: ReadingMode;
  pagedMode: boolean;
};

/** Sub-pixel scroll jitter that should not count as movement. */
const READER_EDGE_DRAG_EPSILON = 1;

/**
 * Detects the "dead wall" gesture: the reader is pinned against the end of the
 * chapter, the user drags to advance, and nothing moves because the list has
 * `bounces={false}` / `overScrollMode="never"`.
 *
 * A drag that *did* move the list (including one that snapped back toward the
 * previous page) is not a wall hit, so the end-of-chapter affordance only
 * appears when the user genuinely tried to go further.
 */
export function isReaderAdvancePastEndDrag({
  startOffset,
  endOffset,
  maxOffset,
  mode,
  pagedMode,
}: ReaderEdgeDragMetrics): boolean {
  if (
    !Number.isFinite(startOffset) ||
    !Number.isFinite(endOffset) ||
    !Number.isFinite(maxOffset)
  ) {
    return false;
  }
  if (Math.abs(endOffset - startOffset) > READER_EDGE_DRAG_EPSILON) return false;

  // Right-to-left paged mode renders pages in reverse, so the chapter's last
  // page sits at offset 0 rather than at the far end of the content.
  const nextEdgeAtOrigin = pagedMode && mode === "rtl";
  if (nextEdgeAtOrigin) return endOffset <= READER_EDGE_DRAG_EPSILON;

  // A stage with nothing to scroll gives no directional signal in vertical
  // mode, where any stray drag would otherwise look like a wall hit. Paged
  // mode still counts: a one-page chapter has a real "no next page" edge.
  if (maxOffset <= 0) return pagedMode;
  return endOffset >= maxOffset - READER_EDGE_DRAG_EPSILON;
}
