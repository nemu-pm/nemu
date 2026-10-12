import type { ReadingMode } from "@/data/schema";

/**
 * What a single tap on the reading stage should do.
 *
 * `previous`/`next` are expressed in *source* page order (the same order
 * progress is persisted in), so the caller never has to re-apply the reading
 * direction — this helper already folded it in.
 */
export type ReaderTapZone = "previous" | "toggle" | "next";

/**
 * Edge zones take 35% of the stage width each, leaving a 30% centre band for
 * the chrome toggle.
 */
export const READER_TAP_EDGE_ZONE_RATIO = 0.35;

/**
 * Whether the stage takes taps at all. Loading does not switch it off (owner
 * rule): while the chapter or a visible page is loading every band acts like
 * the centre and toggles the chrome — page turns are gated separately.
 */
export function isReaderStageTapEnabled({
  tapGesturesEnabled,
}: {
  tapGesturesEnabled: boolean;
}): boolean {
  return tapGesturesEnabled;
}

/**
 * Reader chrome is rendered above the gallery, but React Native touch events
 * can still bubble through that overlay to the gallery's edge tap zones. Keep
 * toolbar actions from also turning a page.
 */
export function isReaderTapInsideChrome({
  y,
  height,
  topInset,
  bottomInset,
}: {
  y: number;
  height: number;
  topInset: number;
  bottomInset: number;
}): boolean {
  if (!Number.isFinite(y) || !Number.isFinite(height) || height <= 0) {
    return false;
  }
  const safeTopInset = Number.isFinite(topInset) ? Math.max(0, topInset) : 0;
  const safeBottomInset = Number.isFinite(bottomInset)
    ? Math.max(0, bottomInset)
    : 0;
  return y <= safeTopInset || y >= height - safeBottomInset;
}

/**
 * Who a touch that reached the reading stage belongs to.
 *
 * - `stage`: bare page; the tap zones decide what it does.
 * - `chrome`: a chrome piece (or the toolbar band) owns it; the stage ignores it.
 * - `revealChrome`: it landed on a chrome piece that is still on screen while
 *   it dematerializes. The pieces stop hit-testing the moment the hide starts,
 *   so the touch arrives here instead. It brings the chrome back so the reader
 *   can choose the control again, rather than running a partly hidden button
 *   or turning the page under a control they can still see.
 */
export type ReaderStageTouchOwner = "stage" | "chrome" | "revealChrome";

type ReaderStageRect = { x: number; y: number; width: number; height: number };

export function readerStageTouchOwner({
  x,
  y,
  height,
  topInset,
  bottomInset,
  chromePieces,
  chromeDismissing = false,
}: {
  /** Stage-local touch position. */
  x: number;
  y: number;
  height: number;
  topInset: number;
  bottomInset: number;
  /**
   * Stage-local rects of the chrome pieces that are on screen — shown, or
   * still fading out. Omitted once the chrome is fully hidden.
   */
  chromePieces?: readonly ReaderStageRect[];
  /** The chrome is fading out: its pieces are visible but no longer hit-test. */
  chromeDismissing?: boolean;
}): ReaderStageTouchOwner {
  const onPiece =
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    (chromePieces ?? []).some(
      (rect) =>
        x >= rect.x &&
        x <= rect.x + rect.width &&
        y >= rect.y &&
        y <= rect.y + rect.height,
    );
  if (onPiece) return chromeDismissing ? "revealChrome" : "chrome";
  return isReaderTapInsideChrome({ y, height, topInset, bottomInset })
    ? "chrome"
    : "stage";
}

/**
 * The stage rect a chrome piece covers while it dematerializes: its pose rect
 * plus the slide it travels on the way out (the top row leaves upward, the
 * bottom row downward). Hit-testing reads stage coordinates, not the native
 * slide, so a tap on the moving piece's leading edge still belongs to it; the
 * page beside its trailing edge stays the page's.
 */
export function readerChromeDismissSweep<Rect extends ReaderStageRect>(
  rect: Rect,
  { slide, stageHeight }: { slide: number; stageHeight: number },
): Rect {
  if (!Number.isFinite(slide) || slide <= 0) return rect;
  // Without a usable stage height the row is unknown: reserve both sides.
  const knownStage = Number.isFinite(stageHeight) && stageHeight > 0;
  const leavesUpward = !knownStage || rect.y + rect.height / 2 < stageHeight / 2;
  const leavesDownward = !knownStage || !leavesUpward;
  return {
    ...rect,
    y: leavesUpward ? rect.y - slide : rect.y,
    height: rect.height + (leavesUpward ? slide : 0) + (leavesDownward ? slide : 0),
  };
}

export function readerTapZoneForPosition({
  x,
  width,
  mode,
  pagedMode,
  edgeRatio = READER_TAP_EDGE_ZONE_RATIO,
}: {
  x: number;
  width: number;
  mode: ReadingMode;
  pagedMode: boolean;
  edgeRatio?: number;
}): ReaderTapZone {
  // Vertical/scrolling mode is driven by the scroll position; a tap anywhere
  // only toggles the chrome.
  if (!pagedMode) return "toggle";
  if (!Number.isFinite(x) || !Number.isFinite(width) || width <= 0) {
    return "toggle";
  }

  const clampedEdgeRatio = Math.max(0, Math.min(0.5, edgeRatio));
  if (clampedEdgeRatio <= 0) return "toggle";

  const ratio = Math.max(0, Math.min(1, x / width));
  const atLeadingEdge = ratio < clampedEdgeRatio;
  const atTrailingEdge = ratio > 1 - clampedEdgeRatio;
  if (!atLeadingEdge && !atTrailingEdge) return "toggle";

  // Right-to-left reading flips which physical edge advances the chapter.
  const nextIsOnTheLeft = mode === "rtl";
  if (atLeadingEdge) return nextIsOnTheLeft ? "next" : "previous";
  return nextIsOnTheLeft ? "previous" : "next";
}

/**
 * What a resolved stage tap should do *right now*.
 *
 * Page turns are unambiguous: nothing in the edge bands offers a double-tap
 * affordance, so a turn fires on touch-up instead of waiting out a
 * double-tap window. Only the centre band shares its space with the page's
 * double-tap zoom, so only the centre band defers.
 *
 * A zoomed page is the exception: it owns the whole stage, its double tap
 * resets the zoom wherever it lands, and an edge tap that also turned the page
 * would page twice *and* leave the page zoomed. While zoomed, every band
 * behaves like the centre band.
 */
export type ReaderTapDispatch =
  | { kind: "turn"; zone: "previous" | "next" }
  /** Schedule the chrome toggle after the double-tap window. */
  | { kind: "deferToggle" }
  /** The second centre tap of a double-tap zoom: drop the pending toggle. */
  | { kind: "cancelPendingToggle" };

export function readerTapDispatchForZone({
  zone,
  isSecondCentreTap,
  pageZoomed = false,
  followsZoomedTap = false,
}: {
  zone: ReaderTapZone;
  isSecondCentreTap: boolean;
  /** The page under the tap is zoomed in past its fit scale. */
  pageZoomed?: boolean;
  /**
   * The previous tap landed on a zoomed page within the double-tap delay:
   * this is the second tap of a zoom reset. The reset may already have
   * reported the page unzoomed by the time this tap lifts, so without this
   * the tap would read as an edge tap and turn the page.
   */
  followsZoomedTap?: boolean;
}): ReaderTapDispatch {
  if (zone !== "toggle" && !pageZoomed && !followsZoomedTap) {
    return { kind: "turn", zone };
  }
  return isSecondCentreTap
    ? { kind: "cancelPendingToggle" }
    : { kind: "deferToggle" };
}

/**
 * The stage-x span where a double-tap may zoom, in the same coordinate space
 * `readerTapZoneForPosition` reads (`pageX` against the stage width).
 *
 * A tap in an edge band now turns the page on touch-up, so a double tap there
 * would page twice *and* zoom. Keeping the page zoom to the centre band is
 * what makes the two gestures agree on who owns each part of the stage.
 * `null` means "no restriction" — every position may zoom.
 */
export function readerCentreTapBand({
  width,
  edgeRatio = READER_TAP_EDGE_ZONE_RATIO,
}: {
  width: number;
  edgeRatio?: number;
}): { start: number; end: number } | null {
  if (!Number.isFinite(width) || width <= 0) return null;
  const clampedEdgeRatio = Math.max(0, Math.min(0.5, edgeRatio));
  if (clampedEdgeRatio <= 0) return null;
  return {
    start: width * clampedEdgeRatio,
    end: width * (1 - clampedEdgeRatio),
  };
}

/** A touch never transfers to another chapter when a route/fetch settles. */
export function readerStageTouchMatchesContent(
  startedContentKey: string,
  currentContentKey: string,
): boolean {
  return startedContentKey === currentContentKey;
}
