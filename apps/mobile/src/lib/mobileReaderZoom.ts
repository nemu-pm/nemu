export const MOBILE_READER_MIN_ZOOM_SCALE = 1;
export const MOBILE_READER_MAX_ZOOM_SCALE = 4;
export const MOBILE_READER_DOUBLE_TAP_ZOOM_SCALE = 2.25;
export const MOBILE_READER_ZOOM_RESET_THRESHOLD = 1.02;

export function clampMobileReaderZoomScale(value: number): number {
  "worklet";
  if (!Number.isFinite(value)) return MOBILE_READER_MIN_ZOOM_SCALE;
  return Math.max(
    MOBILE_READER_MIN_ZOOM_SCALE,
    Math.min(MOBILE_READER_MAX_ZOOM_SCALE, value),
  );
}

export function shouldResetMobileReaderZoom(scale: number): boolean {
  "worklet";
  return !Number.isFinite(scale) || scale <= MOBILE_READER_ZOOM_RESET_THRESHOLD;
}

export function mobileReaderZoomOffsetBound(
  frameSize: number,
  scale: number,
): number {
  "worklet";
  if (!Number.isFinite(frameSize) || frameSize <= 0 || scale <= 1) return 0;
  return (frameSize * (scale - 1)) / 2;
}

export function clampMobileReaderZoomOffset(
  value: number,
  frameSize: number,
  scale: number,
): number {
  "worklet";
  const bound = mobileReaderZoomOffsetBound(frameSize, scale);
  if (!Number.isFinite(value) || bound <= 0) return 0;
  return Math.max(-bound, Math.min(bound, value));
}

/**
 * Pan bound for a zoomed continuous strip axis: the overflow of the scaled
 * content over the viewport, halved so either edge can be pulled to the
 * viewport edge. Falls back to the viewport itself when the content length is
 * unknown (equal overflow, center-anchored), and never allows pasting past
 * the content at scale 1.
 */
export function mobileReaderStripOffsetBound(
  viewportSize: number,
  contentSize: number,
  scale: number,
): number {
  "worklet";
  if (!Number.isFinite(viewportSize) || viewportSize <= 0 || scale <= 1) {
    return 0;
  }
  const scaled =
    Number.isFinite(contentSize) && contentSize > viewportSize
      ? contentSize * scale
      : viewportSize * scale;
  return Math.max(0, (scaled - viewportSize) / 2);
}

export function clampMobileReaderStripOffset(
  value: number,
  viewportSize: number,
  contentSize: number,
  scale: number,
): number {
  "worklet";
  const bound = mobileReaderStripOffsetBound(viewportSize, contentSize, scale);
  if (!Number.isFinite(value) || bound <= 0) return 0;
  return Math.max(-bound, Math.min(bound, value));
}
