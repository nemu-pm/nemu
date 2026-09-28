import { MOBILE_FLOATING_TAB_BAR_VISUAL_HEIGHT } from "./mobileFloatingTabBarClearance";

/**
 * Android replica of the iOS 26/27 "soft" scroll edge effect under the
 * floating tab bar: content that scrolls toward the bottom edge fades toward
 * the page background and blurs progressively, strongest at the screen edge,
 * so the bar reads as floating over a soft edge instead of over a hard cut of
 * rows.
 *
 * Geometry (dp, measured from the bottom of the window):
 * - the capsule top sits at `bottomInset + tabBottom + barHeight`;
 * - the band starts at the capsule's top edge (owner rule: everything above
 *   the bar stays fully crisp — only what is beside, behind and below the bar
 *   goes soft), where both the blur and the fade are zero;
 * - the blur radius eases in (`radius = max * t^exponent`, t = 0 at the band
 *   top, 1 at the edge), so rows level with the top of the capsule stay
 *   legible and the softness builds toward the screen edge;
 * - the fade is a background-colour scrim with its own ease-in alpha ramp
 *   over the same band.
 *
 * Without the native blur (Android < 13 or a binary without the module) the
 * scrim alone carries the effect, slightly stronger. Battery saver is decided
 * natively at runtime: the host drops the blur and the regular fade remains.
 */
/** Where the band starts below the capsule's top edge (0 = exactly at it). */
export const MOBILE_SCROLL_EDGE_START_BELOW_CAPSULE_TOP = 0;
export const MOBILE_SCROLL_EDGE_MAX_BLUR_RADIUS = 12;
export const MOBILE_SCROLL_EDGE_BLUR_EXPONENT = 1.6;
export const MOBILE_SCROLL_EDGE_SCRIM_MAX_ALPHA = 0.6;
export const MOBILE_SCROLL_EDGE_FALLBACK_SCRIM_MAX_ALPHA = 0.8;
export const MOBILE_SCROLL_EDGE_SCRIM_EXPONENT = 1.4;
const SCRIM_STOP_COUNT = 9;

export type MobileScrollEdgeScrimStop = {
  /** 0 = band top, 1 = window bottom edge. */
  offset: number;
  alpha: number;
};

export type MobileBottomScrollEdgeEffect = {
  /** Total band height (dp) from the window's bottom edge. */
  height: number;
  /** Distance (dp) from the window's bottom edge up to the capsule's top edge. */
  capsuleTop: number;
  maxBlurRadius: number;
  blurExponent: number;
  scrimStops: MobileScrollEdgeScrimStop[];
};

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function roundTo(value: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

/** Blur radius (dp) at `t` (0 = band top, 1 = bottom edge). */
export function mobileScrollEdgeBlurRadiusAt(
  t: number,
  maxBlurRadius: number = MOBILE_SCROLL_EDGE_MAX_BLUR_RADIUS,
  exponent: number = MOBILE_SCROLL_EDGE_BLUR_EXPONENT,
): number {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0));
  return maxBlurRadius * clamped ** exponent;
}

export function resolveMobileBottomScrollEdgeEffect({
  bottomInset,
  tabBottom,
  blurAvailable,
}: {
  bottomInset: number;
  tabBottom: number;
  blurAvailable: boolean;
}): MobileBottomScrollEdgeEffect {
  const capsuleTop =
    finiteNonNegative(bottomInset) +
    finiteNonNegative(tabBottom) +
    MOBILE_FLOATING_TAB_BAR_VISUAL_HEIGHT;
  const height = Math.max(0, capsuleTop - MOBILE_SCROLL_EDGE_START_BELOW_CAPSULE_TOP);
  const maxAlpha = blurAvailable
    ? MOBILE_SCROLL_EDGE_SCRIM_MAX_ALPHA
    : MOBILE_SCROLL_EDGE_FALLBACK_SCRIM_MAX_ALPHA;
  const scrimStops = Array.from({ length: SCRIM_STOP_COUNT }, (_, index) => {
    const offset = index / (SCRIM_STOP_COUNT - 1);
    return {
      offset: roundTo(offset, 4),
      alpha: roundTo(maxAlpha * offset ** MOBILE_SCROLL_EDGE_SCRIM_EXPONENT, 3),
    };
  });

  return {
    height,
    capsuleTop,
    maxBlurRadius: blurAvailable ? MOBILE_SCROLL_EDGE_MAX_BLUR_RADIUS : 0,
    blurExponent: MOBILE_SCROLL_EDGE_BLUR_EXPONENT,
    scrimStops,
  };
}
