import type { ReadingMode } from "@/data/schema";
import { readerRoutePageForDisplayIndex } from "./mobileReaderProgress";
import {
  MOBILE_SLIDER_THUMB_SIZE,
  type MobileSliderTrackWindowFrame,
} from "@/lib/mobileSliderTrack";

/** Thumbnail of the target page inside the bubble (a manga page's ~0.7 aspect). */
export const READER_SCRUBBER_PREVIEW_IMAGE_WIDTH = 56;
export const READER_SCRUBBER_PREVIEW_IMAGE_HEIGHT = 80;
/** Gap between a spread's two thumbnails. */
export const READER_SCRUBBER_PREVIEW_IMAGE_GAP = 4;
/** Bubble box width for one page, kept in sync with `MobileReaderScrubberPreview`. */
export const READER_SCRUBBER_PREVIEW_BUBBLE_WIDTH = 76;

/** The bubble's width for one page or a spread's pages side by side. */
export function readerScrubberPreviewBubbleWidth(pageCount: number): number {
  const count = Math.max(1, Math.min(2, Math.trunc(pageCount) || 1));
  return (
    READER_SCRUBBER_PREVIEW_BUBBLE_WIDTH +
    (count - 1) * (READER_SCRUBBER_PREVIEW_IMAGE_WIDTH + READER_SCRUBBER_PREVIEW_IMAGE_GAP)
  );
}
/** Bubble box height: padding 8 + thumbnail + gap 6 + 15pt label + padding 6. */
export const READER_SCRUBBER_PREVIEW_BUBBLE_HEIGHT =
  8 + READER_SCRUBBER_PREVIEW_IMAGE_HEIGHT + 6 + 15 + 6;
/** Gap between the bubble's bottom edge and the top of the slider thumb. */
export const READER_SCRUBBER_PREVIEW_THUMB_GAP = 6;
/** Keeps the bubble off the screen edges when the thumb sits at an extreme. */
export const READER_SCRUBBER_PREVIEW_EDGE_INSET = 8;

export type ReaderScrubberPreviewGeometry = {
  /** Visual thumb position: 0 is the track's left edge, 1 its right edge. */
  ratio: number;
  /** The track's window-space box, recovered from the live touch. */
  track: MobileSliderTrackWindowFrame;
};

/**
 * Resolves the track's box into window space using the toolbar panel's own
 * window box, measured from a plain view in the main tree.
 *
 * A frame measured *inside* the panel can come back in either space: the
 * reader's Liquid Glass toolbar hosts the slider in a SwiftUI host with its own
 * touch handler and hosting view, so a measurement there may be relative to the
 * panel rather than the window (the plain Android/no-glass panel is always
 * window-relative). The two are unambiguous in practice — a panel-relative box
 * sits inside the panel's height, which for a bottom-anchored toolbar is
 * hundreds of points above its own window position — so one code path can take
 * either and land on the thumb.
 */
export function readerScrubberTrackWindowFrame({
  track,
  panel,
}: {
  track: MobileSliderTrackWindowFrame;
  panel: MobileSliderTrackWindowFrame | null;
}): MobileSliderTrackWindowFrame {
  if (!panel || !(panel.width > 0) || !(panel.height > 0)) return track;
  // Whichever reading puts the track's centre nearer the panel's centre. A
  // containment test is not enough: the slider's touch box is taller than the
  // 48pt capsule it sits in (it overhangs above and below), so a window-space
  // box never fits inside the panel and was re-offset by the panel's own
  // position, pushing the bubble off the screen — no preview while dragging.
  const panelCentreY = panel.y + panel.height / 2;
  const windowCentreY = track.y + track.height / 2;
  const panelRelativeCentreY = panel.y + track.y + track.height / 2;
  if (
    Math.abs(windowCentreY - panelCentreY) <=
    Math.abs(panelRelativeCentreY - panelCentreY)
  ) {
    return track;
  }
  return {
    x: panel.x + track.x,
    y: panel.y + track.y,
    width: track.width,
    height: track.height,
  };
}

export type ReaderScrubberPreviewBubblePosition = {
  left: number;
  bottom: number;
};

/**
 * Places the scrub preview bubble inside an overlay that is a sibling of the
 * reader's bottom toolbar rather than a child of it: the toolbar panel clips
 * its content (rounded glass surface), so the bubble has to be positioned from
 * window coordinates instead of the track's own coordinate space.
 *
 * `ratio` is already the visual thumb position, so RTL scrubbing needs no
 * special case here — the caller mirrors the logical progress once.
 *
 * Both boxes must be in the same window space. Returns `null` when they are
 * not — a degenerate overlay, or a thumb so high in the overlay that the
 * bubble could not fit above it, means the caller handed over a frame from
 * another coordinate space (an embedded surface reports its own origin). The
 * bubble then stays hidden instead of being drawn over unrelated chrome.
 */
export function readerScrubberPreviewBubblePosition({
  geometry,
  layer,
  bubbleWidth = READER_SCRUBBER_PREVIEW_BUBBLE_WIDTH,
  bubbleHeight = READER_SCRUBBER_PREVIEW_BUBBLE_HEIGHT,
  edgeInset = READER_SCRUBBER_PREVIEW_EDGE_INSET,
  thumbGap = READER_SCRUBBER_PREVIEW_THUMB_GAP,
}: {
  geometry: ReaderScrubberPreviewGeometry;
  layer: MobileSliderTrackWindowFrame;
  bubbleWidth?: number;
  bubbleHeight?: number;
  edgeInset?: number;
  thumbGap?: number;
}): ReaderScrubberPreviewBubblePosition | null {
  if (!(layer.width > 0) || !(layer.height > 0)) return null;
  const ratio = Number.isFinite(geometry.ratio)
    ? Math.max(0, Math.min(1, geometry.ratio))
    : 0;
  const thumbCenterX = geometry.track.x + ratio * geometry.track.width;
  const anchoredLeft = thumbCenterX - layer.x - bubbleWidth / 2;
  const maxLeft = layer.width - bubbleWidth - edgeInset;
  const left =
    maxLeft <= edgeInset
      ? // Too narrow to inset both sides: centre what room there is.
        Math.max(0, (layer.width - bubbleWidth) / 2)
      : Math.max(edgeInset, Math.min(maxLeft, anchoredLeft));

  // The thumb is centred in the track's touch box, and the bubble grows upward
  // from its own bottom edge.
  const thumbTopY =
    geometry.track.y + (geometry.track.height - MOBILE_SLIDER_THUMB_SIZE) / 2;
  const bubbleTopY = thumbTopY - thumbGap - bubbleHeight;
  if (bubbleTopY < layer.y) return null;
  const bottom = layer.y + layer.height - (thumbTopY - thumbGap);

  return { left, bottom };
}

/**
 * The bubble's caption: the previewed page's 1-based number over the
 * chapter's page count ("12 / 53"), in the reader's page numbering (RTL
 * display order maps back to the source page).
 */
export function readerScrubberPreviewLabel(
  displayIndex: number,
  pageCount: number,
  mode: ReadingMode,
): string {
  const count = Math.max(1, Math.trunc(pageCount));
  return `${readerRoutePageForDisplayIndex(displayIndex, count, mode)} / ${count}`;
}

/**
 * The ratio a paged scrub commits on release: the one the bubble last showed.
 * The release event's own position can land a hair past the final move (and
 * the bubble publishes once per frame), so committing it could jump to the
 * page next to the one the reader was looking at in the preview.
 */
export function readerScrubberCommitRatio({
  releaseRatio,
  lastPreviewRatio,
}: {
  releaseRatio: number;
  lastPreviewRatio: number | null;
}): number {
  return lastPreviewRatio != null && Number.isFinite(lastPreviewRatio)
    ? lastPreviewRatio
    : releaseRatio;
}
