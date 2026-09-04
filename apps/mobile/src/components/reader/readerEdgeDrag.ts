import type { ReadingMode } from "@/data/schema";

export type ReaderEdgeDragMetrics = {
  /** Scroll offset (x in paged mode, y in scrolling mode) when the drag began. */
  startOffset: number;
  /** Scroll offset at the moment the finger lifted. */
  endOffset: number;
  /** Largest scrollable offset: contentSize - layoutMeasurement on the scroll axis. */
  maxOffset: number;
  /** Finger movement on the scroll axis; negative means an upward drag. */
  gestureDelta?: number;
  mode: ReadingMode;
  pagedMode: boolean;
};

/** Sub-pixel scroll jitter that should not count as movement. */
const READER_EDGE_DRAG_EPSILON = 1;
const READER_UNSCROLLABLE_VERTICAL_DRAG_THRESHOLD = 32;

/**
 * Detects the "dead wall" gesture: the reader is pinned against the end of the
 * chapter and the user drags to advance. The offset may stay pinned, or move
 * beyond the edge while iOS applies its native scroll bounce.
 *
 * A drag that moved back toward readable content is not a wall hit, so the
 * end-of-chapter affordance only appears when the user genuinely tried to go
 * further.
 */
export function isReaderAdvancePastEndDrag({
  startOffset,
  endOffset,
  maxOffset,
  gestureDelta,
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
  // Right-to-left paged mode renders pages in reverse, so the chapter's last
  // page sits at offset 0 rather than at the far end of the content.
  const nextEdgeAtOrigin = pagedMode && mode === "rtl";
  if (nextEdgeAtOrigin) {
    return (
      startOffset <= READER_EDGE_DRAG_EPSILON &&
      endOffset <= startOffset + READER_EDGE_DRAG_EPSILON
    );
  }

  // An unscrollable vertical chapter cannot express direction through its
  // content offset. Require a deliberate upward finger drag so a short or
  // one-page chapter still has an end entrance without treating taps/jitter
  // as advancement. Paged mode already has a directional page-pan gesture.
  if (maxOffset <= 0) {
    return (
      pagedMode ||
      (Number.isFinite(gestureDelta) &&
        (gestureDelta ?? 0) <=
          -READER_UNSCROLLABLE_VERTICAL_DRAG_THRESHOLD)
    );
  }
  return (
    startOffset >= maxOffset - READER_EDGE_DRAG_EPSILON &&
    endOffset >= startOffset - READER_EDGE_DRAG_EPSILON
  );
}
