import type { MobileAdaptiveLayout, MobileWidthClass, MobileWindowPosture } from "@/lib/mobileAdaptiveLayout";
import type { WindowHingeStatus, WindowLayoutRect } from "@/lib/mobileWindowLayout";

/**
 * One motion language for pose changes (fold / unfold, outer ⇄ inner display,
 * rotation, window resize). Owner rule: a change between fold states is never
 * abrupt — it glides or is softened by a brief frosted veil, and it never
 * blocks input.
 *
 * Everything here is pure (timing tokens + decisions) so it is unit tested;
 * `MobilePoseTransitionContext.tsx` turns it into Reanimated work on the UI
 * thread, and `mobilePoseLayoutAnimations.ts` holds the shared builders.
 */

export type MobileSpringConfig = { damping: number; stiffness: number; mass: number };

export const MOBILE_MOTION = {
  /**
   * The settle spring for layout moves at a constant window size (fold gutter
   * widening, split panes lining up with the fold halves, pane-aligned empty
   * states). Damping ratio ≈ 0.81: overshoot ≈ 1.3% (< 2%), settles into the
   * 2% band in ≈ 330 ms — inside the ~350 ms motion budget.
   */
  settleSpring: { damping: 24, stiffness: 220, mass: 1 } satisfies MobileSpringConfig,
  /** Content appearing (a pane, a re-wrapped copy block). */
  fadeInMs: 220,
  /** Content leaving; slightly quicker so the incoming state leads. */
  fadeOutMs: 180,
  /** Frosted veil ramp when it can be anticipated (hinge flips before the display moves). */
  blurInMs: 120,
  /** Veil reveal once the new layout has committed. */
  blurOutMs: 260,
  /** Reduce Motion: no movement, no blur — one short cross-fade. */
  reduceMotionFadeMs: 150,
  /** Veil stays at its peak this long after the last change settles (measurements, list remounts). */
  veilHoldMs: 120,
  /** A veil session never lasts longer than this, however many changes keep arriving. */
  veilMaxHoldMs: 700,
  veilBlurIntensity: 36,
  /** Frosted tint over the blur (page background colour). */
  veilTintOpacity: 0.6,
  /** No blur (Android): the colour alone has to hide the reflow. */
  veilSolidTintOpacity: 0.86,
  /** Reduce Motion veil: a light background wash, never a flash. */
  veilReduceMotionTintOpacity: 0.5,
  /** A system-timed rotation or fold: a light page-colour wash, no blur. */
  veilSystemTintOpacity: 0.55,
  /** Opacity a re-laid-out element dips to before fading back (carousel re-snap). */
  resnapDipOpacity: 0.35,
} as const;

/** A window side changing by at least this share in one step is a display switch or rotation, not a live resize. */
export const MOBILE_POSE_RESIZE_JUMP = 0.15;

/** Peak overshoot (fraction of the travel) of an underdamped spring; 0 when critically/over-damped. */
export function mobileSpringOvershoot({ damping, stiffness, mass }: MobileSpringConfig): number {
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  if (!(zeta < 1)) return 0;
  return Math.exp((-Math.PI * zeta) / Math.sqrt(1 - zeta * zeta));
}

/** Time (ms) for the spring envelope to enter the ±`band` of its target. */
export function mobileSpringSettleMs({ damping, stiffness, mass }: MobileSpringConfig, band = 0.02): number {
  const omega = Math.sqrt(stiffness / mass);
  const zeta = Math.min(1, damping / (2 * Math.sqrt(stiffness * mass)));
  return (-Math.log(band) / (zeta * omega)) * 1000;
}

export type MobilePoseSignature = {
  width: number;
  height: number;
  widthClass: MobileWidthClass;
  posture: MobileWindowPosture;
  fold: WindowLayoutRect | null;
  verticalBarSide: "left" | "right" | null;
  hinge: WindowHingeStatus | null;
};

export function mobilePoseSignature(
  adaptive: Pick<
    MobileAdaptiveLayout,
    "width" | "height" | "widthClass" | "posture" | "fold" | "verticalBarSide" | "hinge"
  >,
): MobilePoseSignature {
  return {
    width: adaptive.width,
    height: adaptive.height,
    widthClass: adaptive.widthClass,
    posture: adaptive.posture,
    fold: adaptive.fold,
    verticalBarSide: adaptive.verticalBarSide,
    hinge: adaptive.hinge,
  };
}

/**
 * - `none`: nothing a user would see move.
 * - `layout`: the window keeps its size; panes/gutters move (fold ↔ flat on
 *   the inner display, the system bar column moving). Layout transitions
 *   animate it; no veil.
 * - `resize`: the window jumps to a new size (outer ⇄ inner display,
 *   rotation, a size-class change). The system re-lays out everything; the
 *   pose veil hides the reflow.
 */
export type MobilePoseChangeKind = "none" | "layout" | "resize";

export type MobilePoseChange = {
  kind: MobilePoseChangeKind;
  /**
   * The hinge closed/opened before the window moved to the other display:
   * the veil can ramp in (the reflow has not happened yet).
   */
  anticipated: boolean;
};

const SAME = 0.5;

function sameRect(a: WindowLayoutRect | null, b: WindowLayoutRect | null): boolean {
  if (!a || !b) return a === b;
  return Math.abs(a.x - b.x) < SAME
    && Math.abs(a.y - b.y) < SAME
    && Math.abs(a.width - b.width) < SAME
    && Math.abs(a.height - b.height) < SAME;
}

function hingeIsOpen(hinge: WindowHingeStatus | null): boolean | null {
  if (hinge === "closed") return false;
  if (hinge === "partiallyOpen" || hinge === "fullyOpen") return true;
  return null;
}

function relativeChange(a: number, b: number): number {
  return Math.abs(a - b) / Math.max(1, Math.abs(a));
}

export function classifyMobilePoseChange(
  previous: MobilePoseSignature | null,
  next: MobilePoseSignature,
): MobilePoseChange {
  const none: MobilePoseChange = { kind: "none", anticipated: false };
  if (!previous) return none;
  if (!(next.width > 0 && next.height > 0) || !(previous.width > 0 && previous.height > 0)) return none;

  const rotated = (previous.width > previous.height) !== (next.width > next.height)
    && Math.abs(next.width - next.height) >= 1;
  const jumped = relativeChange(previous.width, next.width) >= MOBILE_POSE_RESIZE_JUMP
    || relativeChange(previous.height, next.height) >= MOBILE_POSE_RESIZE_JUMP;
  if (rotated || jumped || previous.widthClass !== next.widthClass) {
    return { kind: "resize", anticipated: false };
  }

  // A 180° rotation keeps the size but moves the system bar column (and the
  // page gutters that clear it) to the other side: the whole page shifts, so
  // veil it like any other rotation.
  if (previous.verticalBarSide && next.verticalBarSide && previous.verticalBarSide !== next.verticalBarSide) {
    return { kind: "resize", anticipated: false };
  }

  // Closing or opening the device: the hinge reports a few frames before the
  // window moves to the other display. Book ⇄ flat (both open) is not this.
  const wasOpen = hingeIsOpen(previous.hinge);
  const isOpen = hingeIsOpen(next.hinge);
  if (wasOpen !== null && isOpen !== null && wasOpen !== isOpen) {
    return { kind: "resize", anticipated: true };
  }

  const resized = Math.abs(previous.width - next.width) >= SAME
    || Math.abs(previous.height - next.height) >= SAME;
  if (
    resized
    || previous.posture !== next.posture
    || !sameRect(previous.fold, next.fold)
    || previous.verticalBarSide !== next.verticalBarSide
  ) {
    return { kind: "layout", anticipated: false };
  }
  return none;
}

/** Why a veil is shown: a detected pose change, or a surface asking to hide its own remount. */
export type MobilePoseVeilReason = "resize" | "layout" | "remount";

export type MobilePoseVeilPlan = {
  /** Blur intensity at the peak (0 = no blur layer). */
  blurIntensity: number;
  /** Background-colour wash at the peak. */
  tintOpacity: number;
  /** 0 = appear at the peak in the same frame as the new layout. */
  fadeInMs: number;
  holdMs: number;
  fadeOutMs: number;
};

/**
 * Whether (and how) the root pose veil covers a change.
 *
 * - Layout-only changes animate in place, so they get no veil — except under
 *   Reduce Motion, where layout transitions are skipped and a 150 ms wash
 *   softens the jump instead.
 * - Resizes and surface remounts get the frosted veil (iOS blur + tint;
 *   Android a denser colour wash, no blur). Reduce Motion: a 150 ms wash.
 */
export function mobilePoseVeilPlan({
  reason,
  anticipated = false,
  reduceMotion,
  blurAvailable,
  systemTransitionMs = null,
}: {
  reason: MobilePoseVeilReason;
  anticipated?: boolean;
  reduceMotion: boolean;
  blurAvailable: boolean;
  /**
   * The system's own transition duration for this change (design-explore on
   * iOS): the veil is then a plain page-colour cross-fade of that length, no
   * frosted blur, so the new layout settles on the system's timing.
   */
  systemTransitionMs?: number | null;
}): MobilePoseVeilPlan | null {
  if (reduceMotion) {
    return {
      blurIntensity: 0,
      tintOpacity: MOBILE_MOTION.veilReduceMotionTintOpacity,
      fadeInMs: 0,
      holdMs: reason === "layout" ? 0 : MOBILE_MOTION.veilHoldMs,
      fadeOutMs: MOBILE_MOTION.reduceMotionFadeMs,
    };
  }
  if (reason === "layout") return null;
  if (systemTransitionMs !== null && systemTransitionMs > 0) {
    return {
      blurIntensity: 0,
      tintOpacity: MOBILE_MOTION.veilSystemTintOpacity,
      fadeInMs: 0,
      holdMs: MOBILE_MOTION.veilHoldMs,
      fadeOutMs: Math.round(systemTransitionMs),
    };
  }
  return {
    blurIntensity: blurAvailable ? MOBILE_MOTION.veilBlurIntensity : 0,
    tintOpacity: blurAvailable ? MOBILE_MOTION.veilTintOpacity : MOBILE_MOTION.veilSolidTintOpacity,
    fadeInMs: anticipated ? MOBILE_MOTION.blurInMs : 0,
    holdMs: MOBILE_MOTION.veilHoldMs,
    fadeOutMs: MOBILE_MOTION.blurOutMs,
  };
}

/** Merge a plan into a running veil session: keep the strongest peak, the longest hold. */
export function mergeMobilePoseVeilPlans(
  current: MobilePoseVeilPlan | null,
  next: MobilePoseVeilPlan,
): MobilePoseVeilPlan {
  if (!current) return next;
  return {
    blurIntensity: Math.max(current.blurIntensity, next.blurIntensity),
    tintOpacity: Math.max(current.tintOpacity, next.tintOpacity),
    // Already visible: never ramp again from zero.
    fadeInMs: Math.min(current.fadeInMs, next.fadeInMs),
    holdMs: Math.max(current.holdMs, next.holdMs),
    fadeOutMs: Math.max(current.fadeOutMs, next.fadeOutMs),
  };
}

/**
 * When the veil starts revealing, given when its session began and when the
 * latest change settled (both ms). Capped so a stream of changes (a live
 * window drag) can never keep the app veiled.
 */
export function mobilePoseVeilRevealAt({
  sessionStart,
  settledAt,
  holdMs,
  maxHoldMs = MOBILE_MOTION.veilMaxHoldMs,
}: {
  sessionStart: number;
  settledAt: number;
  holdMs: number;
  maxHoldMs?: number;
}): number {
  return Math.min(settledAt + holdMs, sessionStart + maxHoldMs);
}
