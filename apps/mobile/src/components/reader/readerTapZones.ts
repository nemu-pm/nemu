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
