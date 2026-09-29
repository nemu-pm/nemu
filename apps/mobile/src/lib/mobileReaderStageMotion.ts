import type { MobilePoseVeilPlan } from "@/lib/mobileMotion";
import type { WindowLayoutRect } from "@/lib/mobileWindowLayout";

/**
 * Reader pose-transition decisions (motion spec rows 1, 3 and 4), kept pure so
 * they are unit tested. `mobileReaderMotionAnimations.ts` turns them into
 * Reanimated work on the UI thread.
 *
 * - The gallery is never remounted for a stage *size* change: a fold, a bar
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
/** The old list stays at full strength this long before it fades (the new one decodes meanwhile). */
export const MOBILE_READER_STAGE_EXIT_HOLD_MS = 120;
/** A remounted list starts this visible (never from black) and rises to 1. */
export const MOBILE_READER_STAGE_CROSSFADE_FLOOR = 0.6;
export const MOBILE_READER_REDUCE_MOTION_FADE_MS = 150;
/** Horizontal chrome ⇄ capsules: fade + this slide down from the top edge (motion spec). */
export const MOBILE_READER_CHROME_ARRANGEMENT_SLIDE = 8;
export const MOBILE_READER_CHROME_ARRANGEMENT_MS = 220;
/** Notebook console unfolding from the hinge. */
export const MOBILE_READER_CONSOLE_UNFOLD_MS = 280;
export const MOBILE_READER_CONSOLE_UNFOLD_DEG = -80;
/**
 * Root pose veil caps while the reader is on screen (rotation, display
 * switch): a light dark frost over the pages (iOS, where the system rotates
 * a snapshot and then shows the new layout at once), never a near-opaque
 * black wash. Android has no blur and already cross-fades the rotated window
 * itself, so any wash there only deepens the system's dip to black: none.
 */
export function mobileReaderPoseVeilCaps(platform: "ios" | "android" | string): {
  maxTintOpacity: number;
  maxBlurIntensity: number;
} {
  return platform === "ios"
    ? { maxTintOpacity: 0.28, maxBlurIntensity: 24 }
    : { maxTintOpacity: 0, maxBlurIntensity: 0 };
}

/**
 * Apply a surface's veil caps (`MobilePoseVeilAppearance.maxTintOpacity` /
 * `maxBlurIntensity`) to the root veil plan. No caps: the plan unchanged.
 */
export function mobilePoseVeilPlanWithCaps(
  plan: MobilePoseVeilPlan,
  caps: { maxTintOpacity?: number; maxBlurIntensity?: number } | null | undefined,
): MobilePoseVeilPlan {
  const tintCap = caps?.maxTintOpacity;
  const blurCap = caps?.maxBlurIntensity;
  if (tintCap === undefined && blurCap === undefined) return plan;
  return {
    ...plan,
    tintOpacity: tintCap === undefined ? plan.tintOpacity : Math.min(plan.tintOpacity, Math.max(0, tintCap)),
    blurIntensity: blurCap === undefined ? plan.blurIntensity : Math.min(plan.blurIntensity, Math.max(0, blurCap)),
  };
}

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
  /**
   * Page geometry inside the stage (spread slots, page frame limits). A
   * change here at a constant stage frame — flat ⇄ book with a spread: the
   * stage stays the window, the halves move apart into the panes — glides
   * the slots and page frames themselves.
   */
  pages?: string;
  /** Chapter / fetch / reading direction identity; motion never spans two contents. */
  contentKey: string;
};

export type MobileReaderStageMotion =
  | { kind: "none" }
  /** Window resized: the root pose veil covers the reflow. */
  | { kind: "jump" }
  /** The list must remount: fade the old stage out over the new one. */
  | { kind: "crossfade"; durationMs: number }
  /**
   * Same presentation, new frame. `page`: FLIP the whole stage so the page
   * maps onto its new box (single page, stage moved). `translate`: the stage
   * only glides its origin (if it moved) while every spread slot and page
   * frame glides from its old box to its new one.
   */
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
  const stageMoved = !sameRect(previous.stage, next.stage);
  const pagesMoved = (previous.pages ?? "") !== (next.pages ?? "");
  if (!stageMoved && !pagesMoved) return { kind: "none" };
  // Reduce Motion: the stage fades; slots and page frames settle at once.
  if (reduceMotion) return { kind: "fade", durationMs: MOBILE_READER_REDUCE_MOTION_FADE_MS };
  // Only the pages moved (the stage frame is unchanged, so its own transition
  // never runs): slots and page frames glide.
  if (!stageMoved) return { kind: "glide", flip: "translate" };
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

/**
 * FLIP start transform for one page frame (transform origin = its centre):
 * drawn at `to`, it covers `from` — centre on centre, uniformly scaled by the
 * width ratio (the page keeps its aspect). Both rects in the same parent's
 * coordinates.
 */
export function mobileReaderPageFrameFlip(from: Rect, to: Rect): MobileReaderFlipTransform {
  "worklet";
  if (!(to.width > 0) || !(to.height > 0) || !(from.width > 0) || !(from.height > 0)) return IDENTITY;
  let scale = from.width / to.width;
  if (!Number.isFinite(scale) || scale <= 0) return IDENTITY;
  scale = Math.max(1 / MOBILE_READER_STAGE_FLIP_MAX_SCALE, Math.min(MOBILE_READER_STAGE_FLIP_MAX_SCALE, scale));
  const translateX = from.x + from.width / 2 - (to.x + to.width / 2);
  const translateY = from.y + from.height / 2 - (to.y + to.height / 2);
  const still = Math.abs(translateX) < SAME && Math.abs(translateY) < SAME && Math.abs(scale - 1) < 0.002;
  return still ? IDENTITY : { translateX, translateY, scale };
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

/**
 * Whether a gallery remount cross-fades. Only a presentation change inside
 * the same window does (spread ⇄ single on a fold): after a window resize
 * (rotation, display switch) the old list is laid out for the old window, so
 * fading it out over the new one — and the new one in from black — only
 * showed a dark, ghosted frame. The new list then appears at once, already
 * scrolled to the page being read.
 */
export function mobileReaderGalleryRemountMotion(input: {
  previous: { mountKey: string; contentKey: string; windowKey?: string } | null;
  next: { mountKey: string; contentKey: string; windowKey?: string };
  reduceMotion: boolean;
}): { crossfade: boolean; durationMs: number } {
  const { previous, next } = input;
  const crossfade = Boolean(previous)
    && previous!.mountKey !== next.mountKey
    && previous!.contentKey === next.contentKey
    && (previous!.windowKey ?? "") === (next.windowKey ?? "")
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
  kind: "capsules" | "console";
  /**
   * Where the pieces sit (capsule rects). A pose change that only moves them
   * (flat ⇄ book: the row snaps per pane) glides the same capsules to their
   * new frames — nothing fades out and back in.
   */
  geometry?: string;
};

export type MobileReaderChromeArrangementMotion = {
  /** Start offset of the incoming arrangement (it settles at 0). */
  dx: number;
  dy: number;
  /** Notebook console: rotate open from the fold line. */
  unfold: boolean;
  durationMs: number;
};

/** Identity of the chrome layer: one per arrangement kind (a geometry change never remounts it). */
export function mobileReaderChromeArrangementKey(arrangement: MobileReaderChromeArrangement): string {
  return arrangement.kind;
}

/** Capsule piece rects rounded to whole points: the chrome's geometry key. */
export function mobileReaderChromeGeometryKey(rects: ReadonlyArray<Rect | null>): string {
  return rects
    .map((rect) => (rect ? `${Math.round(rect.x)},${Math.round(rect.y)},${Math.round(rect.width)},${Math.round(rect.height)}` : "-"))
    .join("|");
}

/**
 * Visible chrome moved to another arrangement kind (pose change): capsules
 * settle the last 8pt down onto their row as they fade in; the console
 * unfolds from the hinge. Only a kind change remounts the layer this way —
 * showing/hiding keeps its own fade, and moved pieces glide
 * (`mobileReaderChromeGlide`).
 */
export function mobileReaderChromeArrangementMotion(input: {
  from: MobileReaderChromeArrangement | null;
  to: MobileReaderChromeArrangement;
  reduceMotion: boolean;
}): MobileReaderChromeArrangementMotion | null {
  const { from, to } = input;
  if (!from) return null;
  if (from.kind === to.kind) return null;
  if (input.reduceMotion) {
    return { dx: 0, dy: 0, unfold: false, durationMs: MOBILE_READER_REDUCE_MOTION_FADE_MS };
  }
  if (to.kind === "console") {
    return { dx: 0, dy: 0, unfold: true, durationMs: MOBILE_READER_CONSOLE_UNFOLD_MS };
  }
  return { dx: 0, dy: -MOBILE_READER_CHROME_ARRANGEMENT_SLIDE, unfold: false, durationMs: MOBILE_READER_CHROME_ARRANGEMENT_MS };
}

/**
 * The same visible capsules moved (flat ⇄ book, dock, rotation within a
 * window): each piece is one persistent element that glides and resizes to
 * its new frame with the settle spring, content visible throughout — never a
 * fade out in one pane and in at the other (read as a flash). Reduce Motion:
 * they move at once.
 */
export function mobileReaderChromeGlide(input: {
  from: MobileReaderChromeArrangement | null;
  to: MobileReaderChromeArrangement;
  reduceMotion: boolean;
}): boolean {
  const { from, to } = input;
  if (!from || input.reduceMotion || from.kind !== to.kind) return false;
  return (from.geometry ?? "") !== (to.geometry ?? "");
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
