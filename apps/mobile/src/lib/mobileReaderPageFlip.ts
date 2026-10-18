import type { WindowLayoutRect } from "@/lib/mobileWindowLayout";

/**
 * When a spread page turn plays the half-page flip (real-book spine, part 2),
 * as one deterministic rule instead of "whenever everything happened to be
 * decoded in time":
 *
 * - paged two-page spreads only — book posture (one page per fold pane) AND
 *   flat spreads (pages meeting at the centre seam) — a single-step turn;
 * - both the spread being left and the one arrived at are full pairs: a
 *   cover / odd last page (single ⇄ spread boundary) turns plainly, there is
 *   no facing page to lift;
 * - not zoomed, not Reduce Motion;
 * - the pages on screen (the leaf that lifts and the page under the landing
 *   side) have image URIs — they are what the leaves copy. The incoming page
 *   may still be loading: its leaf lands empty and fades its page in as it
 *   decodes, it never cancels the flip.
 */
export type MobileReaderPageFlipSkipReason =
  | "not-paged"
  | "not-spread"
  | "reduce-motion"
  | "zoomed"
  | "multi-step"
  | "spread-boundary"
  | "same-spread"
  | "no-panes"
  | "page-missing";

export type MobileReaderPageFlipDecision =
  | { flip: true }
  | { flip: false; reason: MobileReaderPageFlipSkipReason };

export function mobileReaderPageFlipDecision(input: {
  paged: boolean;
  spreadMode: boolean;
  reduceMotion: boolean | null;
  zoomed: boolean;
  step: number;
  /** Page count of the spread on screen and of the one being turned to. */
  fromSpreadLength: number | null;
  toSpreadLength: number | null;
  sameSpread: boolean;
  hasPanes: boolean;
  /** The pages on screen (lifting leaf + page under the landing side) have URIs. */
  onScreenPagesReady: boolean;
}): MobileReaderPageFlipDecision {
  if (!input.paged) return { flip: false, reason: "not-paged" };
  if (!input.spreadMode) return { flip: false, reason: "not-spread" };
  if (input.reduceMotion !== false) return { flip: false, reason: "reduce-motion" };
  if (input.zoomed) return { flip: false, reason: "zoomed" };
  if (Math.abs(input.step) !== 1) return { flip: false, reason: "multi-step" };
  if (input.sameSpread) return { flip: false, reason: "same-spread" };
  if (input.fromSpreadLength !== 2 || input.toSpreadLength !== 2) return { flip: false, reason: "spread-boundary" };
  if (!input.hasPanes) return { flip: false, reason: "no-panes" };
  if (!input.onScreenPagesReady) return { flip: false, reason: "page-missing" };
  return { flip: true };
}

/**
 * Leaf panes for a flat spread (no fold): each side hugs the centre seam,
 * like the spread's pages (`mobileReaderSpreadPageAlignment`), so the leaf
 * pivots on the seam and its centred copy lands exactly on the page. Widths
 * are the wider of that side's old and new page frames. Stage-local.
 */
export function mobileReaderFlatSpreadFlipPanes(input: {
  stageWidth: number;
  stageHeight: number;
  leftWidth: number;
  rightWidth: number;
}): { left: WindowLayoutRect; right: WindowLayoutRect } {
  const seam = input.stageWidth / 2;
  const clamp = (width: number) => Math.max(1, Math.min(seam, Number.isFinite(width) ? width : seam));
  const left = clamp(input.leftWidth);
  const right = clamp(input.rightWidth);
  return {
    left: { x: seam - left, y: 0, width: left, height: input.stageHeight },
    right: { x: seam, y: 0, width: right, height: input.stageHeight },
  };
}

/**
 * Pages to keep warm behind the current one: a spread turn back needs the
 * whole previous spread (two pages) decoded, not just one page.
 */
export function mobileReaderPrefetchPagesBehind(spreadMode: boolean, singleDefault: number): number {
  return spreadMode ? Math.max(2, singleDefault) : singleDefault;
}

/** Leaves wait at most this long for the on-screen copies to decode, then flip anyway. */
export const MOBILE_READER_PAGE_FLIP_DECODE_WAIT_MS = 300;
