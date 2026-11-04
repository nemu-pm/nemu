/**
 * Window shape classes for per-shape reader preferences (page fit).
 *
 * The class comes from the rectangle the page occupies — never from the
 * device idiom, the interface orientation or the screen model — so one rule
 * covers a phone, the iPhone Duo's two displays and its half-folded pose,
 * an iPad and every resizable window:
 *
 * - `large`: both sides are at least `READER_LARGE_MIN_SHORT_SIDE` (iPad in
 *   either orientation, the Duo's open display, a roomy Split View pane).
 * - `wide`: wider than tall and not large (a phone in landscape, the Duo's
 *   closed display in landscape, the top half of a half-folded Duo).
 * - `narrow`: everything else (a phone in portrait, the Duo's closed display
 *   in portrait, a narrow Split View pane).
 */
export type ReaderWindowShape = "narrow" | "wide" | "large";

export const READER_WINDOW_SHAPES: readonly ReaderWindowShape[] = ["narrow", "wide", "large"];

/** Material "medium" width: the point where a window stops being phone-sized. */
export const READER_LARGE_MIN_SHORT_SIDE = 600;

export function classifyReaderWindowShape(size: { width: number; height: number }): ReaderWindowShape {
  const width = Number.isFinite(size.width) ? Math.max(0, size.width) : 0;
  const height = Number.isFinite(size.height) ? Math.max(0, size.height) : 0;
  if (Math.min(width, height) >= READER_LARGE_MIN_SHORT_SIDE) return "large";
  return width > height ? "wide" : "narrow";
}
