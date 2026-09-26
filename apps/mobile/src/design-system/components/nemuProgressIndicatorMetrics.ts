/**
 * Box and stroke for `NemuNativeProgressView` on Android.
 *
 * Material 3's `CircularProgressIndicator` draws at its own 40dp diameter with
 * a 4dp stroke unless it is given a size, so a caller that laid the spinner
 * out in a 20dp mark column (the Nemu Agent step rows) got a 40dp ring
 * spilling up and to the left of that column. The requested size is now the
 * indicator's exact diameter, and the stroke keeps Material's 1:10 ratio so a
 * small spinner reads at the same weight as the 20dp glyphs next to it,
 * never thinner than 2dp.
 */

/** The historic 28dp host, kept as the default so size-less callers do not move. */
export const NEMU_PROGRESS_DEFAULT_SIZE = 28;

const MATERIAL_STROKE_RATIO = 4 / 40;
const MIN_STROKE_WIDTH = 2;

export type NemuProgressIndicatorMetrics = {
  /** Width and height of both the host view and the indicator, in dp. */
  size: number;
  strokeWidth: number;
};

export function resolveNemuProgressIndicatorMetrics(
  requestedSize: number | undefined,
): NemuProgressIndicatorMetrics {
  const size =
    typeof requestedSize === "number" && Number.isFinite(requestedSize) && requestedSize > 0
      ? requestedSize
      : NEMU_PROGRESS_DEFAULT_SIZE;
  const strokeWidth = Math.max(
    MIN_STROKE_WIDTH,
    Math.round(size * MATERIAL_STROKE_RATIO * 2) / 2,
  );
  return { size, strokeWidth };
}
