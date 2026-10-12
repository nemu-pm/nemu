const POPOUT_HEIGHT_FRACTION = 0.2;

/**
 * Clearance between the popout's top edge and the top safe area. Web centres
 * the popout at 15vh, which on a Dynamic Island iPhone in portrait puts its
 * top edge at ~44pt, under the island (safe area 62pt): the island notched
 * the bubble.
 */
export const JAPANESE_LEARNING_POPOUT_SAFE_AREA_GAP = 8;

function popoutCenterY(windowHeight: number, safeAreaTop: number) {
  return Math.max(windowHeight * 0.15, safeAreaTop + 16);
}

function popoutMinTop(safeAreaTop: number) {
  return Math.max(0, safeAreaTop) + JAPANESE_LEARNING_POPOUT_SAFE_AREA_GAP;
}

/** Web's placement (centred at `popoutCenterY`), pushed down clear of the top safe area. */
function popoutTop(windowHeight: number, safeAreaTop: number, height: number) {
  return Math.max(popoutCenterY(windowHeight, safeAreaTop) - height / 2, popoutMinTop(safeAreaTop));
}

/**
 * The lowest the popout's bottom edge can reach (a crop tall enough to use
 * the full 20% height), in window points: sheets that should leave the
 * popout clear keep their top edge below this.
 */
export function japaneseLearningBubblePopoutMaxBottom({
  windowHeight,
  safeAreaTop,
}: {
  windowHeight: number;
  safeAreaTop: number;
}): number {
  const height = windowHeight * POPOUT_HEIGHT_FRACTION;
  return popoutTop(windowHeight, safeAreaTop, height) + height;
}

/**
 * Frame of the web `TextPopout` (japanese-learning/ui/text-popout.tsx) when
 * it is shown without a click position (the transcript / sheet flow): 20% of
 * the window tall, width from the crop's aspect ratio capped to 90% of the
 * window width, centred horizontally with its centre at
 * `max(15vh, safe-area top + 16px)`.
 *
 * Native adaptations: the top edge never rises above the top safe area plus
 * `JAPANESE_LEARNING_POPOUT_SAFE_AREA_GAP` (the Dynamic Island, the status
 * bar), and the bottom edge never passes `maxBottom` (the sheet's top edge
 * less a gap): the popout moves up, then shrinks, to stay in that band.
 */
export function japaneseLearningBubblePopoutFrame({
  cropWidth,
  cropHeight,
  windowWidth,
  windowHeight,
  safeAreaTop,
  region,
  verticalSpan,
  maxBottom,
}: {
  cropWidth: number;
  cropHeight: number;
  windowWidth: number;
  windowHeight: number;
  safeAreaTop: number;
  /**
   * Horizontal span to stay inside (window coordinates): on a vertical fold
   * the pane that holds the sheet (`japaneseLearningBubblePopoutRegion`), so
   * the popout never straddles the fold. Omitted: the whole window.
   */
  region?: { x: number; width: number } | null;
  /**
   * Vertical span to stay inside (window coordinates): on a horizontal fold
   * the half above it (`japaneseLearningBubblePopoutVerticalSpan`), where
   * the popout is centred, since the drawer takes the half below. Omitted:
   * web's placement.
   */
  verticalSpan?: { y: number; height: number } | null;
  /**
   * Lowest window y the popout's bottom edge may reach: the top of the sheet
   * under it less `JAPANESE_LEARNING_POPOUT_SHEET_GAP`
   * (`resolveJapaneseLearningDrawerTop`). Omitted: no limit.
   */
  maxBottom?: number | null;
}): { x: number; y: number; width: number; height: number } | null {
  if (!(cropWidth > 0 && cropHeight > 0 && windowWidth > 0 && windowHeight > 0)) return null;
  const span = region && region.width > 0 ? region : { x: 0, width: windowWidth };
  const aspect = cropWidth / cropHeight;
  const band = verticalSpan && verticalSpan.height > 0 ? verticalSpan : null;
  const minTop = popoutMinTop(safeAreaTop);
  const bottomLimit = !band && maxBottom != null && Number.isFinite(maxBottom) ? maxBottom : null;
  let height = windowHeight * POPOUT_HEIGHT_FRACTION;
  if (band) height = Math.min(height, band.height);
  if (bottomLimit != null) height = Math.min(height, bottomLimit - minTop);
  if (!(height > 0)) return null;
  let width = height * aspect;
  const maxWidth = span.width * 0.9;
  if (width > maxWidth) {
    width = maxWidth;
    height = width / aspect;
  }
  let y: number;
  if (band) {
    y = band.y + band.height / 2 - height / 2;
  } else {
    y = popoutTop(windowHeight, safeAreaTop, height);
    if (bottomLimit != null && y + height > bottomLimit) y = Math.max(minTop, bottomLimit - height);
  }
  return {
    x: span.x + (span.width - width) / 2,
    y,
    width,
    height,
  };
}

/**
 * The pane the popout stays in on a vertical fold (book posture): the pane
 * the system sheet sits in, so the bubble floats above its own sheet and
 * never across the fold. iOS moves sheets off the fold into the leading pane
 * (measured on the iPhone Duo 27.1 simulator); the Android sheet is pinned
 * to the trailing pane (`resolveMobileNativeSheetAndroidPlacement`). Null
 * when there is no vertical fold (flat, notebook): the whole window.
 */
export function japaneseLearningBubblePopoutRegion({
  platform,
  posture,
  panels,
  layoutDirection = "ltr",
}: {
  platform: string;
  posture: "flat" | "book" | "notebook";
  /** Window-coordinate panes in physical order (`mobileAdaptiveLayout`). */
  panels: readonly { x: number; width: number }[];
  layoutDirection?: "ltr" | "rtl";
}): { x: number; width: number } | null {
  if (posture !== "book" || panels.length !== 2) return null;
  const first = panels[0];
  const last = panels[panels.length - 1];
  const leading = layoutDirection === "rtl" ? last : first;
  const trailing = layoutDirection === "rtl" ? first : last;
  const pane = platform === "android" ? trailing : leading;
  return pane.width > 0 ? { x: pane.x, width: pane.width } : null;
}

/** Clearance between the popout and the edges of the half it floats in. */
export const JAPANESE_LEARNING_POPOUT_FOLD_MARGIN = 16;

/**
 * The half the popout floats in on a horizontal fold (the iPhone Duo inner
 * display in portrait, tabletop): below the top safe area (status bar,
 * reader chrome) and above the fold, `JAPANESE_LEARNING_POPOUT_FOLD_MARGIN`
 * clear of both, so it never touches the crease or the drawer under it.
 * Null without a horizontal fold, or when that half has no room.
 */
export function japaneseLearningBubblePopoutVerticalSpan({
  horizontalFold,
  safeAreaTop,
}: {
  horizontalFold: { top: number; bottom: number } | null | undefined;
  safeAreaTop: number;
}): { y: number; height: number } | null {
  if (!horizontalFold) return null;
  const y = Math.max(0, safeAreaTop) + JAPANESE_LEARNING_POPOUT_FOLD_MARGIN;
  const height = horizontalFold.top - JAPANESE_LEARNING_POPOUT_FOLD_MARGIN - y;
  return height > 0 ? { y, height } : null;
}

type Box = { x1: number; y1: number; x2: number; y2: number };
type Size = { width: number; height: number };

/**
 * A detection box in the page image's natural pixels. OCR boxes are measured
 * in the image the engine read (`boxSpace`), which on-device recognition may
 * rescale; used as-is they fall outside the page (no popout) or crop the
 * wrong area.
 */
export function japaneseLearningBubbleBoxInNaturalPixels(source: {
  box: Box;
  naturalSize: Size;
  boxSpace?: Size;
}): Box {
  const space = source.boxSpace;
  if (!space || !(space.width > 0 && space.height > 0)) return source.box;
  const sx = source.naturalSize.width / space.width;
  const sy = source.naturalSize.height / space.height;
  return {
    x1: source.box.x1 * sx,
    y1: source.box.y1 * sy,
    x2: source.box.x2 * sx,
    y2: source.box.y2 * sy,
  };
}
