import type { WindowLayoutRect } from "@/lib/mobileWindowLayout";

/**
 * Reader pose-transition decisions (motion spec rows 1, 3 and 4), kept pure so
 * they are unit tested. `mobileReaderMotionAnimations.ts` turns them into
 * Reanimated work on the UI thread.
 *
 * - The gallery is never remounted for a stage *size* change: a fold, a dock
 *   opening or the capsule row appearing glides the stage frame (FLIP: the new layout is
 *   drawn at once, transformed to where the old page was, then springs home).
 * - A presentation change the list cannot morph (spread ⇄ single, bilingual
 *   side by side) remounts it under a short cross-fade.
 * - A window resize (outer ⇄ inner display, rotation) jumps: the app-wide pose
 *   veil already hides that reflow.
 * - Reduce Motion: no movement — a short fade only.
 */

type Rect = WindowLayoutRect;

export const MOBILE_READER_STAGE_CROSSFADE_MS = 200;
export const MOBILE_READER_REDUCE_MOTION_FADE_MS = 150;
/** Horizontal chrome ⇄ capsules: fade + this slide down from the top edge (motion spec). */
export const MOBILE_READER_CHROME_ARRANGEMENT_SLIDE = 8;
export const MOBILE_READER_CHROME_ARRANGEMENT_MS = 220;
/** Notebook console unfolding from the hinge. */
export const MOBILE_READER_CONSOLE_UNFOLD_MS = 280;
export const MOBILE_READER_CONSOLE_UNFOLD_DEG = -80;
/** Docked learning panel: slides in from its edge while it fades in. */
export const MOBILE_READER_DOCK_SLIDE = 48;
export const MOBILE_READER_DOCK_CONSOLE_SLIDE = 24;
/** A glide whose page would scale by more than this is cross-faded instead. */
export const MOBILE_READER_STAGE_FLIP_MAX_SCALE = 2.5;

const SAME = 0.5;

function sameRect(a: Rect, b: Rect): boolean {
  return Math.abs(a.x - b.x) < SAME && Math.abs(a.y - b.y) < SAME
    && Math.abs(a.width - b.width) < SAME && Math.abs(a.height - b.height) < SAME;
}

export type MobileReaderStageSnapshot = {
  /** The reader window (its size changing = display switch / rotation). */
  bounds: { width: number; height: number };
  /** Gallery rect in reader coordinates. */
  stage: Rect;
  /** What the list renders: `single`, `spread:<pairing>`, `bilingual`, `strip:<n>`… */
  presentation: string;
  /** A two-page spread: its page slots glide on their own (apart into the fold panes, or back). */
  spread: boolean;
  /** Chapter / fetch / reading direction identity; motion never spans two contents. */
  contentKey: string;
};

export type MobileReaderStageMotion =
  | { kind: "none" }
  /** Window resized: the root pose veil covers the reflow. */
  | { kind: "jump" }
  /** The list must remount: fade the old stage out over the new one. */
  | { kind: "crossfade"; durationMs: number }
  /** Same presentation, new frame: FLIP the page (`page`) or only the stage origin (`translate`, spread slots glide themselves). */
  | { kind: "glide"; flip: "page" | "translate" }
  /** Reduce Motion stand-in for a glide. */
  | { kind: "fade"; durationMs: number };

export function mobileReaderStageMotion(
  previous: MobileReaderStageSnapshot | null,
  next: MobileReaderStageSnapshot,
  { reduceMotion }: { reduceMotion: boolean },
): MobileReaderStageMotion {
  if (!previous) return { kind: "none" };
  if (previous.contentKey !== next.contentKey) return { kind: "none" };
  if (
    Math.abs(previous.bounds.width - next.bounds.width) >= SAME
    || Math.abs(previous.bounds.height - next.bounds.height) >= SAME
  ) {
    return { kind: "jump" };
  }
  if (previous.presentation !== next.presentation) {
    return {
      kind: "crossfade",
      durationMs: reduceMotion ? MOBILE_READER_REDUCE_MOTION_FADE_MS : MOBILE_READER_STAGE_CROSSFADE_MS,
    };
  }
  if (sameRect(previous.stage, next.stage)) return { kind: "none" };
  if (reduceMotion) return { kind: "fade", durationMs: MOBILE_READER_REDUCE_MOTION_FADE_MS };
  return { kind: "glide", flip: previous.spread && next.spread ? "translate" : "page" };
}

/** The page box a contain-fitted page of `aspect` (width / height) occupies, centred in `rect`. */
export function mobileReaderContainBox(rect: Rect, aspect: number | null): Rect {
  "worklet";
  if (!aspect || !(aspect > 0) || !(rect.width > 0) || !(rect.height > 0)) return rect;
  const fitsHeight = rect.width / rect.height > aspect;
  const width = fitsHeight ? rect.height * aspect : rect.width;
  const height = fitsHeight ? rect.height : rect.width / aspect;
  return {
    x: rect.x + (rect.width - width) / 2,
    y: rect.y + (rect.height - height) / 2,
    width,
    height,
  };
}

export type MobileReaderFlipTransform = { translateX: number; translateY: number; scale: number };

const IDENTITY: MobileReaderFlipTransform = { translateX: 0, translateY: 0, scale: 1 };

/**
 * FLIP start transform for the stage view (transform origin = its centre):
 * applied to the view laid out at `to`, it draws the page where it was inside
 * `from`. `translate` keeps the scale (a slotted spread's halves glide on their
 * own), `page` maps the old page box onto the new one uniformly.
 */
export function mobileReaderStageFlipTransform(input: {
  from: Rect;
  to: Rect;
  aspect: number | null;
  mode: "page" | "translate";
}): MobileReaderFlipTransform {
  "worklet";
  const { from, to } = input;
  if (!(to.width > 0) || !(to.height > 0) || !(from.width > 0) || !(from.height > 0)) return IDENTITY;
  if (input.mode === "translate") {
    return { translateX: from.x - to.x, translateY: from.y - to.y, scale: 1 };
  }
  const fromBox = mobileReaderContainBox(from, input.aspect);
  const toBox = mobileReaderContainBox(to, input.aspect);
  let scale = input.aspect && input.aspect > 0
    ? fromBox.width / toBox.width
    : Math.min(from.width / to.width, from.height / to.height);
  if (!Number.isFinite(scale) || scale <= 0) return IDENTITY;
  scale = Math.max(1 / MOBILE_READER_STAGE_FLIP_MAX_SCALE, Math.min(MOBILE_READER_STAGE_FLIP_MAX_SCALE, scale));
  const cx = to.x + to.width / 2;
  const cy = to.y + to.height / 2;
  const fromCx = fromBox.x + fromBox.width / 2;
  const fromCy = fromBox.y + fromBox.height / 2;
  const toCx = toBox.x + toBox.width / 2;
  const toCy = toBox.y + toBox.height / 2;
  return {
    translateX: fromCx - cx - scale * (toCx - cx),
    translateY: fromCy - cy - scale * (toCy - cy),
    scale,
  };
}

/** Applies a FLIP transform (origin at `to`'s centre) to a point — the inverse check used by tests. */
export function mobileReaderApplyFlip(point: { x: number; y: number }, to: Rect, flip: MobileReaderFlipTransform) {
  const cx = to.x + to.width / 2;
  const cy = to.y + to.height / 2;
  return {
    x: cx + flip.translateX + flip.scale * (point.x - cx),
    y: cy + flip.translateY + flip.scale * (point.y - cy),
  };
}

// --- Gallery list continuity -------------------------------------------------

export type MobileReaderGalleryGeometry = {
  mountKey: string;
  paged: boolean;
  /** Paged: the page width (snap interval). Strip: the image column width. */
  extent: number;
  viewport: number;
};

/**
 * A mounted list whose geometry changed under the same mount key keeps its
 * cells (zoom, decoded images) and only re-places its offset.
 */
export function mobileReaderGalleryRelayout(
  previous: MobileReaderGalleryGeometry | null,
  next: MobileReaderGalleryGeometry,
): "none" | "reoffset" {
  if (!previous || previous.mountKey !== next.mountKey || previous.paged !== next.paged) return "none";
  return Math.abs(previous.extent - next.extent) >= SAME || Math.abs(previous.viewport - next.viewport) >= SAME
    ? "reoffset"
    : "none";
}

/**
 * Long strip: the offset that keeps the same reading progress once every row
 * has rescaled by `widthRatio` (image heights follow the column width; chrome
 * paddings and gaps — `fixedLength` — do not). The content-size event then
 * refines it with the measured length.
 */
export function mobileReaderStripRelayoutOffset(input: {
  contentOffset: number;
  contentLength: number;
  viewportLength: number;
  nextViewportLength: number;
  widthRatio: number;
  fixedLength: number;
}): { progress: number; offset: number } {
  const range = Math.max(0, input.contentLength - input.viewportLength);
  const progress = range > 0 ? Math.max(0, Math.min(1, input.contentOffset / range)) : 0;
  const ratio = Number.isFinite(input.widthRatio) && input.widthRatio > 0 ? input.widthRatio : 1;
  const fixed = Math.max(0, Math.min(input.contentLength, input.fixedLength));
  const predicted = fixed + (input.contentLength - fixed) * ratio;
  const nextRange = Math.max(0, predicted - Math.max(0, input.nextViewportLength));
  return { progress, offset: Math.round(progress * nextRange) };
}

export function mobileReaderGalleryRemountMotion(input: {
  previous: { mountKey: string; contentKey: string } | null;
  next: { mountKey: string; contentKey: string };
  reduceMotion: boolean;
}): { crossfade: boolean; durationMs: number } {
  const { previous, next } = input;
  const crossfade = Boolean(previous)
    && previous!.mountKey !== next.mountKey
    && previous!.contentKey === next.contentKey
    && previous!.mountKey !== "loading"
    && next.mountKey !== "loading";
  return {
    crossfade,
    durationMs: crossfade
      ? input.reduceMotion ? MOBILE_READER_REDUCE_MOTION_FADE_MS : MOBILE_READER_STAGE_CROSSFADE_MS
      : 0,
  };
}

// --- Chrome arrangement ----------------------------------------------------

export type MobileReaderChromeArrangement = {
  kind: "horizontal" | "capsules" | "console";
};

export type MobileReaderChromeArrangementMotion = {
  /** Start offset of the incoming arrangement (it settles at 0). */
  dx: number;
  dy: number;
  /** Notebook console: rotate open from the fold line. */
  unfold: boolean;
  durationMs: number;
};

export function mobileReaderChromeArrangementKey(arrangement: MobileReaderChromeArrangement): string {
  return arrangement.kind;
}

/**
 * Visible chrome moved to another arrangement (pose change). Capsules settle
 * the last 8pt down onto their row as they fade in (they hang from the
 * status-bar row); horizontal bars fade in place; the console unfolds from
 * the hinge. Only an arrangement change animates this way — showing/hiding
 * the chrome keeps its own fade.
 */
export function mobileReaderChromeArrangementMotion(input: {
  from: MobileReaderChromeArrangement | null;
  to: MobileReaderChromeArrangement;
  reduceMotion: boolean;
}): MobileReaderChromeArrangementMotion | null {
  const { from, to } = input;
  if (!from) return null;
  if (mobileReaderChromeArrangementKey(from) === mobileReaderChromeArrangementKey(to)) return null;
  if (input.reduceMotion) {
    return { dx: 0, dy: 0, unfold: false, durationMs: MOBILE_READER_REDUCE_MOTION_FADE_MS };
  }
  if (to.kind === "console") {
    return { dx: 0, dy: 0, unfold: true, durationMs: MOBILE_READER_CONSOLE_UNFOLD_MS };
  }
  if (to.kind === "capsules") {
    return { dx: 0, dy: -MOBILE_READER_CHROME_ARRANGEMENT_SLIDE, unfold: false, durationMs: MOBILE_READER_CHROME_ARRANGEMENT_MS };
  }
  return { dx: 0, dy: 0, unfold: false, durationMs: MOBILE_READER_CHROME_ARRANGEMENT_MS };
}

// --- Docked learning panel -------------------------------------------------

/** Where a docked panel slides in from: its outer window edge, or up into the notebook console. */
export function mobileReaderDockMotion(input: {
  region: "side" | "pane" | "console";
  frame: Rect;
  bounds: Rect;
  reduceMotion: boolean;
}): { dx: number; dy: number } {
  if (input.reduceMotion) return { dx: 0, dy: 0 };
  if (input.region === "console") return { dx: 0, dy: MOBILE_READER_DOCK_CONSOLE_SLIDE };
  const center = input.frame.x + input.frame.width / 2;
  return { dx: center >= input.bounds.x + input.bounds.width / 2 ? MOBILE_READER_DOCK_SLIDE : -MOBILE_READER_DOCK_SLIDE, dy: 0 };
}

// --- Taps and reader cards ---------------------------------------------------

/**
 * Horizontal padding that centres a reader-owned card (loading, locked,
 * error) inside `frame` — e.g. one fold pane — while it is laid out in the
 * stage. Null when the frame does not overlap the stage (another pane).
 */
export function mobileReaderStageHorizontalInsets(frame: Rect, stage: Rect): { left: number; right: number } | null {
  const left = Math.max(frame.x, stage.x);
  const right = Math.min(frame.x + frame.width, stage.x + stage.width);
  const top = Math.max(frame.y, stage.y);
  const bottom = Math.min(frame.y + frame.height, stage.y + stage.height);
  if (right - left < 1 || bottom - top < 1) return null;
  const insets = { left: Math.max(0, left - stage.x), right: Math.max(0, stage.x + stage.width - right) };
  return insets.left < SAME && insets.right < SAME ? null : insets;
}
