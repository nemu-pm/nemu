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

/**
 * iOS beside a vertical bar (iPhone Duo): the rail carries the status bar and
 * the navigation items, so no bar floats over the top of the page and UIKit
 * draws no top scroll edge effect there (the native effects are `hidden`
 * beside the rail, see `nativeHeaderChrome.ts`). Content then scrolled into a
 * hard cut at the screen's top edge. This band replaces it: a progressive
 * blur, strongest at the edge, over exactly the page's top padding — it ends
 * where resting content starts, so nothing at rest is ever blurred.
 */
export const MOBILE_RAIL_TOP_EDGE_BLUR_INTENSITY = 28;

export type MobileRailTopScrollEdge = {
  /** Band height (pt) from the window's top edge; 0 = no band. */
  height: number;
  /** Mask stops: blur opacity from the top edge (offset 0) to the band's end (1). */
  maskStops: ReadonlyArray<readonly [string, number]>;
};

const RAIL_TOP_EDGE_STOP_COUNT = 6;

export function resolveMobileRailTopScrollEdge({
  platform,
  verticalBarSide,
  safeAreaTop,
  pageTop,
  reader,
}: {
  platform: string;
  verticalBarSide: "left" | "right" | null;
  safeAreaTop: number;
  pageTop: number;
  /** The reader is full-bleed and owns its own top scrim. */
  reader: boolean;
}): MobileRailTopScrollEdge {
  if (platform !== "ios" || !verticalBarSide || reader) return { height: 0, maskStops: [] };
  const height = Math.round(finiteNonNegative(safeAreaTop) + finiteNonNegative(pageTop));
  // Ease out from the edge: fully blurred at the top, gone at the band's end.
  const maskStops = Array.from({ length: RAIL_TOP_EDGE_STOP_COUNT }, (_, index) => {
    const offset = index / (RAIL_TOP_EDGE_STOP_COUNT - 1);
    const alpha = roundTo((1 - offset) ** 1.6, 3);
    return [`rgba(0,0,0,${alpha})`, roundTo(offset, 4)] as const;
  });
  return { height, maskStops };
}
