/**
 * Pure overlay alignment-layout math for the mobile dual-reader overlay.
 *
 * A faithful port of web's `updateAlignmentLayout`
 * (`src/lib/plugins/builtin/dual-reader/components.tsx:3139-3230`), factored out
 * as a pure function so it is unit-testable and stays in lock-step with web's
 * `alignmentStyle` (translate + scale, `transformOrigin: top-left`).
 *
 * The geometry helpers (`computeRenderBounds`/`computeFitScale`/
 * `computeAlignmentDownsampleScale`) live in `@nemu/core/dual-reader` so both
 * apps compute identical overlay geometry.
 */
import {
  ALIGNMENT_FINE_MAX_DEFAULT,
  computeAlignmentDownsampleScale,
  computeFitScale,
  computeRenderBounds,
} from "@nemu/core/dual-reader";
import type { SecondaryAlignment } from "@nemu/core/dual-reader";

export type AlignmentLayout = {
  left: number;
  top: number;
  width: number;
  height: number;
  translateX: number;
  translateY: number;
  scale: number;
};

export type OverlayNaturalSize = { width: number; height: number };

/**
 * Compute the aligned overlay layout. Returns null when the inputs are degenerate
 * (non-positive container/frame, non-finite scale) — matching web's early
 * returns. The overlay draws the secondary SkImage into the dest rect
 * `{ x: left + translateX, y: top + translateY, w: width * scale,
 * h: height * scale }`, which is the Skia equivalent of web's
 * `transform: translate(tx,ty) scale(s)` with `transformOrigin: top-left` on an
 * element sized `width × height` at `(left, top)`.
 */
export function computeAlignmentLayout(input: {
  container: OverlayNaturalSize;
  primaryNatural: OverlayNaturalSize;
  secondaryNatural: OverlayNaturalSize;
  alignment: SecondaryAlignment;
  fineMax?: number;
}): AlignmentLayout | null {
  const { container, primaryNatural, secondaryNatural, alignment } = input;
  const containerW = container.width;
  const containerH = container.height;
  if (containerW <= 0 || containerH <= 0) return null;

  const primaryRender = computeRenderBounds(
    containerW,
    containerH,
    primaryNatural.width,
    primaryNatural.height,
  );
  const frameLeft = primaryRender.left;
  const frameTop = primaryRender.top;
  const frameW = primaryRender.width;
  const frameH = primaryRender.height;
  if (frameW <= 0 || frameH <= 0) return null;

  const primaryDisplayW = primaryRender.width;
  const primaryDisplayH = primaryRender.height;
  const primaryScale = primaryDisplayW / Math.max(1, primaryNatural.width);

  const secondaryScale = computeFitScale(
    frameW,
    frameH,
    secondaryNatural.width,
    secondaryNatural.height,
  );
  if (!Number.isFinite(secondaryScale) || secondaryScale === 0) return null;

  const fineMax = input.fineMax ?? ALIGNMENT_FINE_MAX_DEFAULT;
  const primaryDownsample = computeAlignmentDownsampleScale(
    primaryNatural.width,
    primaryNatural.height,
    fineMax,
  );
  const secondaryDownsample = computeAlignmentDownsampleScale(
    secondaryNatural.width,
    secondaryNatural.height,
    fineMax,
  );

  const secondaryDisplayW = secondaryNatural.width * secondaryScale;
  const secondaryDisplayH = secondaryNatural.height * secondaryScale;

  const secondaryLeft = frameLeft + (frameW - secondaryDisplayW) / 2;
  const secondaryTop = frameTop + (frameH - secondaryDisplayH) / 2;
  const baseTranslateX = (secondaryDisplayW - primaryDisplayW) / 2;
  const baseTranslateY = (secondaryDisplayH - primaryDisplayH) / 2;
  const alignTranslateX = alignment.dx * primaryDisplayW;
  const alignTranslateY = alignment.dy * primaryDisplayH;
  const alignmentScale = alignment.scale * (secondaryDownsample / primaryDownsample);
  const scale = alignmentScale * (primaryScale / secondaryScale);
  if (
    !Number.isFinite(scale) ||
    !Number.isFinite(secondaryDisplayW) ||
    !Number.isFinite(secondaryDisplayH)
  ) {
    return null;
  }

  return {
    left: secondaryLeft,
    top: secondaryTop,
    width: secondaryDisplayW,
    height: secondaryDisplayH,
    translateX: baseTranslateX + alignTranslateX,
    translateY: baseTranslateY + alignTranslateY,
    scale,
  };
}

/**
 * The dest rect the Skia `<Image>` should draw into for an aligned overlay.
 * Equivalent to web's `transform: translate(tx,ty) scale(s)` with
 * `transformOrigin: top-left` on an element at `(left, top)` of size
 * `width × height`.
 */
export function alignmentLayoutToDestRect(
  layout: AlignmentLayout,
): { x: number; y: number; width: number; height: number } {
  return {
    x: layout.left + layout.translateX,
    y: layout.top + layout.translateY,
    width: layout.width * layout.scale,
    height: layout.height * layout.scale,
  };
}

/**
 * The aspect-fit rect for the non-aligned overlay (secondary centered in the
 * frame, matching web's `object-contain` full-frame img). Uses the same
 * `computeRenderBounds` so it matches web's centered contain.
 */
export function computeContainRect(input: {
  container: OverlayNaturalSize;
  natural: OverlayNaturalSize;
}): { x: number; y: number; width: number; height: number } {
  const bounds = computeRenderBounds(
    input.container.width,
    input.container.height,
    input.natural.width,
    input.natural.height,
  );
  return { x: bounds.left, y: bounds.top, width: bounds.width, height: bounds.height };
}