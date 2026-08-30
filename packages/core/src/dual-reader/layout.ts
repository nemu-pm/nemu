/**
 * Pure layout helpers for dual-reader overlay alignment, shared by web and
 * mobile. Previously duplicated in web's `components.tsx`; canonical here so
 * both apps compute identical overlay geometry (T3.1 parity).
 */

/** `min(container/natural)` aspect-fit scale; 1 if any dimension is non-positive. */
export function computeFitScale(
  containerW: number,
  containerH: number,
  naturalW: number,
  naturalH: number,
): number {
  if (containerW <= 0 || containerH <= 0 || naturalW <= 0 || naturalH <= 0) return 1;
  return Math.min(containerW / naturalW, containerH / naturalH);
}

/** Aspect-fit render rect (left/top/width/height) of a natural image inside a container. */
export function computeRenderBounds(
  containerW: number,
  containerH: number,
  naturalW: number,
  naturalH: number,
): { left: number; top: number; width: number; height: number } {
  const safeW = Math.max(1, containerW);
  const safeH = Math.max(1, containerH);
  const imgW = Math.max(1, naturalW);
  const imgH = Math.max(1, naturalH);
  const imageAspect = imgW / imgH;
  const containerAspect = safeW / safeH;
  let renderWidth: number;
  let renderHeight: number;
  if (imageAspect > containerAspect) {
    renderWidth = safeW;
    renderHeight = safeW / imageAspect;
  } else {
    renderHeight = safeH;
    renderWidth = safeH * imageAspect;
  }
  const renderLeft = (safeW - renderWidth) / 2;
  const renderTop = (safeH - renderHeight) / 2;
  return { left: renderLeft, top: renderTop, width: renderWidth, height: renderHeight };
}

/** Downsample scale so the larger dimension fits `maxSize`; 1 if already within. */
export function computeAlignmentDownsampleScale(
  width: number,
  height: number,
  maxSize: number,
): number {
  const w = Math.max(1, Math.trunc(width));
  const h = Math.max(1, Math.trunc(height));
  const maxDim = Math.max(w, h);
  if (maxDim <= maxSize) return 1;
  return maxSize / maxDim;
}