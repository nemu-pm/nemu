import type { ReadingMode } from "@/data/schema";

export type ReaderEdgeDragMetrics = {
  /** Scroll offset (x in paged mode, y in scrolling mode) when the drag began. */
  startOffset: number;
  /** Scroll offset at the moment the finger lifted. */
  endOffset: number;
  /** Largest scrollable offset: contentSize - layoutMeasurement on the scroll axis. */
  maxOffset: number;
  /**
   * Finger movement on the scroll axis. Vertical stages: negative means an
   * upward drag. Paged stages: negative means the finger moved left.
   */
  gestureDelta?: number;
  mode: ReadingMode;
  pagedMode: boolean;
  /**
   * Paged mode only: reading-order index of the page (or spread) the reader
   * is showing, from reader state rather than from the scroll offset.
   */
  displayIndex?: number;
  /** Paged mode only: number of pages (or spreads) in the chapter. */
  displayCount?: number;
  /**
   * Paged mode only: measured viewport length on the paging axis. Zero or
   * missing means the pager has not been laid out yet.
   */
  viewportLength?: number;
};

/** Sub-pixel scroll jitter that should not count as movement. */
const READER_EDGE_DRAG_EPSILON = 1;
/**
 * Finger travel that proves a directional drag when the scroll offset itself
 * cannot (an unscrollable chapter, or a caller that samples one offset for
 * both ends).
 */
export const READER_EDGE_FINGER_DRAG_THRESHOLD = 32;

/**
 * Detects the "dead wall" gesture: the reader is pinned against the end of the
 * chapter and the user drags to advance. The offset may stay pinned, or move
 * beyond the edge while iOS applies its native scroll bounce.
 *
 * A drag that moved back toward readable content is not a wall hit, so the
 * end-of-chapter affordance only appears when the user genuinely tried to go
 * further.
 */
export function isReaderAdvancePastEndDrag(
  metrics: ReaderEdgeDragMetrics,
): boolean {
  if (!hasFiniteOffsets(metrics)) return false;
  if (metrics.pagedMode) return isReaderPagedEdgeDrag(metrics, "end");
  return isReaderVerticalAdvancePastEndDrag(metrics);
}

/**
 * The paged mirror of `isReaderAdvancePastEndDrag`: the reader is on the
 * chapter's first page and the user drags back toward the previous chapter.
 * Vertical stages never retreat across chapters (web does not either).
 */
export function isReaderRetreatPastStartDrag(
  metrics: ReaderEdgeDragMetrics,
): boolean {
  if (!hasFiniteOffsets(metrics)) return false;
  if (!metrics.pagedMode) return false;
  return isReaderPagedEdgeDrag(metrics, "start");
}

function hasFiniteOffsets({
  startOffset,
  endOffset,
  maxOffset,
}: ReaderEdgeDragMetrics): boolean {
  return (
    Number.isFinite(startOffset) &&
    Number.isFinite(endOffset) &&
    Number.isFinite(maxOffset)
  );
}

/**
 * Paged edges are decided from the page the reader state says is on screen
 * plus a measured pager — never from a raw offset alone. Offset 0 is the last
 * page in right-to-left mode, but it is also what an unmeasured or
 * not-yet-restored pager reports, so trusting it alone let a mid-chapter swipe
 * open the "caught up" screen or jump into an unloaded chapter.
 */
function isReaderPagedEdgeDrag(
  {
    startOffset,
    endOffset,
    maxOffset,
    gestureDelta,
    mode,
    displayIndex,
    displayCount,
    viewportLength,
  }: ReaderEdgeDragMetrics,
  edge: "start" | "end",
): boolean {
  if (
    displayCount === undefined ||
    !Number.isInteger(displayCount) ||
    displayCount < 1 ||
    displayIndex === undefined ||
    !Number.isFinite(displayIndex) ||
    viewportLength === undefined ||
    !Number.isFinite(viewportLength) ||
    viewportLength <= 0
  ) {
    return false;
  }
  const edgeIndex = edge === "end" ? displayCount - 1 : 0;
  if (Math.round(displayIndex) !== edgeIndex) return false;

  if (displayCount === 1) {
    // One page cannot scroll, so only the finger can say which way the reader
    // meant to go. Advancing moves the finger toward the reading start side:
    // left in LTR, right in RTL.
    if (gestureDelta === undefined || !Number.isFinite(gestureDelta)) {
      return false;
    }
    const advanceSign = mode === "rtl" ? 1 : -1;
    const wantedSign = edge === "end" ? advanceSign : -advanceSign;
    return gestureDelta * wantedSign >= READER_EDGE_FINGER_DRAG_THRESHOLD;
  }
  // Several pages but no scrollable range: the content has not been measured.
  if (maxOffset <= READER_EDGE_DRAG_EPSILON) return false;

  // Right-to-left paged mode renders pages in reverse, so its last page sits
  // at the origin and its first page at the far end.
  const edgeAtOrigin = (edge === "end") === (mode === "rtl");
  if (edgeAtOrigin) {
    return (
      startOffset <= READER_EDGE_DRAG_EPSILON &&
      endOffset <= startOffset + READER_EDGE_DRAG_EPSILON
    );
  }
  return (
    startOffset >= maxOffset - READER_EDGE_DRAG_EPSILON &&
    endOffset >= startOffset - READER_EDGE_DRAG_EPSILON
  );
}

function isReaderVerticalAdvancePastEndDrag({
  startOffset,
  endOffset,
  maxOffset,
  gestureDelta,
}: ReaderEdgeDragMetrics): boolean {
  // An unscrollable vertical chapter cannot express direction through its
  // content offset. Require a deliberate upward finger drag so a short or
  // one-page chapter still has an end entrance without treating taps/jitter
  // as advancement.
  if (maxOffset <= 0) {
    return isUpwardFingerDrag(gestureDelta);
  }
  if (
    startOffset < maxOffset - READER_EDGE_DRAG_EPSILON ||
    endOffset < startOffset - READER_EDGE_DRAG_EPSILON
  ) {
    return false;
  }
  // Callers that sample a single live scroll offset for both ends (the stage's
  // touch handler) cannot tell a tap apart from a drag into the wall: a chapter
  // already resting at the bottom never moves either way. When such a caller
  // supplies a finger delta, require a deliberate upward drag so finishing a
  // chapter and tapping still reaches the chrome toggle instead of advancing.
  if (
    gestureDelta !== undefined &&
    Math.abs(endOffset - startOffset) <= READER_EDGE_DRAG_EPSILON
  ) {
    return isUpwardFingerDrag(gestureDelta);
  }
  return true;
}

function isUpwardFingerDrag(gestureDelta: number | undefined): boolean {
  return (
    gestureDelta !== undefined &&
    Number.isFinite(gestureDelta) &&
    gestureDelta <= -READER_EDGE_FINGER_DRAG_THRESHOLD
  );
}
