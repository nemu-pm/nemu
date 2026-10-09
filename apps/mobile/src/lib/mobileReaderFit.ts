import type { ReaderWindowShape } from "@/lib/mobileReaderWindowShape";

/**
 * How a single page is sized in the paged reader.
 *
 * - `page`: the whole page, as large as fits (the default; also the only
 *   mode a two-page spread uses, since both pages are fitted together).
 * - `width`: the page spans the window's width; a tall page scrolls.
 * - `height`: the page spans the window's height; a wide window shows the
 *   page whole, a narrow one pans sideways.
 * - `fill`: the page covers the whole window (cover crop) and pans.
 */
export type ReaderFitMode = "page" | "width" | "height" | "fill";

export const READER_FIT_MODES: readonly ReaderFitMode[] = ["page", "width", "height", "fill"];
export const DEFAULT_READER_FIT_MODE: ReaderFitMode = "page";

/** A remembered choice per window shape; a missing shape means the default. */
export type ReaderFitModesByShape = Partial<Record<ReaderWindowShape, ReaderFitMode>>;

export function isReaderFitMode(value: unknown): value is ReaderFitMode {
  return typeof value === "string" && (READER_FIT_MODES as readonly string[]).includes(value);
}

export function normalizeReaderFitMode(value: unknown): ReaderFitMode {
  return isReaderFitMode(value) ? value : DEFAULT_READER_FIT_MODE;
}

export function readerFitModeForShape(
  modes: ReaderFitModesByShape | null | undefined,
  shape: ReaderWindowShape,
): ReaderFitMode {
  return normalizeReaderFitMode(modes?.[shape]);
}

/** Copy of `modes` with `shape` set to `mode`; the default is stored as absent. */
export function withReaderFitMode(
  modes: ReaderFitModesByShape | null | undefined,
  shape: ReaderWindowShape,
  mode: ReaderFitMode,
): ReaderFitModesByShape {
  const next: ReaderFitModesByShape = {};
  for (const key of ["narrow", "wide", "large"] as const) {
    const value = key === shape ? mode : modes?.[key];
    if (isReaderFitMode(value) && value !== DEFAULT_READER_FIT_MODE) next[key] = value;
  }
  return next;
}

/** Drops anything that is not a known shape → mode pair (settings written by other builds). */
export function normalizeReaderFitModes(value: unknown): ReaderFitModesByShape {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  const next: ReaderFitModesByShape = {};
  for (const key of ["narrow", "wide", "large"] as const) {
    if (isReaderFitMode(record[key]) && record[key] !== DEFAULT_READER_FIT_MODE) next[key] = record[key] as ReaderFitMode;
  }
  return next;
}

/** Ratio used until a page reports its natural size. */
export const READER_FIT_FALLBACK_RATIO = 1.45;

/** A page overflows its window by less than this and counts as fitting. */
export const READER_FIT_OVERFLOW_EPSILON = 1;

export type ReaderFitFrame = {
  width: number;
  height: number;
  /** The page is wider than the window and pans sideways. */
  overflowX: boolean;
  /** The page is taller than the window and pans vertically. */
  overflowY: boolean;
};

function positive(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

/** Height ÷ width of a page, with the fallback for unknown or degenerate sizes. */
export function readerFitRatio(naturalSize: { width: number; height: number } | null | undefined): number {
  if (!naturalSize) return READER_FIT_FALLBACK_RATIO;
  const width = positive(naturalSize.width, 0);
  const height = positive(naturalSize.height, 0);
  return width > 0 && height > 0 ? height / width : READER_FIT_FALLBACK_RATIO;
}

/**
 * The page's own rectangle for a non-default fit mode inside a window of
 * `viewport`, so the image fills its frame exactly (no inner letterbox) and
 * `overflowX/Y` say which axes pan. `page` returns the contained rectangle
 * (the paged reader keeps its own gutters for that mode and does not use
 * this for it, but the maths is the reference for the others).
 */
export function mobileReaderFitFrame({
  mode,
  viewport,
  ratio,
}: {
  mode: ReaderFitMode;
  viewport: { width: number; height: number };
  /** Page height ÷ width. */
  ratio: number;
}): ReaderFitFrame {
  const vw = positive(viewport.width, 1);
  const vh = positive(viewport.height, 1);
  const r = positive(ratio, READER_FIT_FALLBACK_RATIO);
  let width: number;
  switch (mode) {
    case "width":
      width = vw;
      break;
    case "height":
      width = vh / r;
      break;
    case "fill":
      width = Math.max(vw, vh / r);
      break;
    default:
      width = Math.min(vw, vh / r);
  }
  const height = width * r;
  return {
    width,
    height,
    overflowX: width > vw + READER_FIT_OVERFLOW_EPSILON,
    overflowY: height > vh + READER_FIT_OVERFLOW_EPSILON,
  };
}

/**
 * Where an overflowing page rests when it appears: the top edge, and
 * horizontally the edge reading starts from (right for right-to-left books).
 * `x`/`y` are -1 (show the far/start edge …) as translation signs: the page
 * is centred in its window, so showing its left edge shifts it right (+).
 */
export function mobileReaderFitRestingOffset({
  frame,
  viewport,
  rtl,
}: {
  frame: { width: number; height: number };
  viewport: { width: number; height: number };
  rtl: boolean;
}): { x: number; y: number } {
  const overflowX = Math.max(0, frame.width - viewport.width);
  const overflowY = Math.max(0, frame.height - viewport.height);
  return {
    x: (rtl ? -1 : 1) * overflowX / 2,
    y: overflowY / 2,
  };
}

/** Pan limit on one axis: how far the scaled page may sit off-centre. */
export function mobileReaderPanBound(frameSize: number, viewportSize: number, scale: number): number {
  "worklet";
  if (!Number.isFinite(frameSize) || !Number.isFinite(viewportSize) || !Number.isFinite(scale)) return 0;
  return Math.max(0, (frameSize * scale - viewportSize) / 2);
}

export function clampMobileReaderPan(value: number, frameSize: number, viewportSize: number, scale: number): number {
  "worklet";
  const bound = mobileReaderPanBound(frameSize, viewportSize, scale);
  if (!Number.isFinite(value) || bound <= 0) return 0;
  return Math.max(-bound, Math.min(bound, value));
}

export type ReaderPanClaim = "claim" | "yield" | "wait";

/**
 * Whether a one-finger drag on a page that is not zoomed but overflows its
 * window belongs to the page (pan) or to the gallery (turn the page). The drag
 * must pass a small slop first; the dominant axis decides; a pan that is
 * already at that axis' edge in the drag's direction hands the touch over,
 * so the next swipe turns the page.
 */
export function mobileReaderPanClaim({
  dx,
  dy,
  offsetX,
  offsetY,
  boundX,
  boundY,
  slop = 8,
}: {
  dx: number;
  dy: number;
  offsetX: number;
  offsetY: number;
  boundX: number;
  boundY: number;
  slop?: number;
}): ReaderPanClaim {
  "worklet";
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (Math.max(ax, ay) < slop) return "wait";
  const edge = 0.5;
  if (ax >= ay) {
    if (boundX <= 0) return "yield";
    // Dragging right moves the page right: possible while it is left of its right limit.
    return dx > 0 ? (offsetX < boundX - edge ? "claim" : "yield") : offsetX > -boundX + edge ? "claim" : "yield";
  }
  if (boundY <= 0) return "yield";
  return dy > 0 ? (offsetY < boundY - edge ? "claim" : "yield") : offsetY > -boundY + edge ? "claim" : "yield";
}
