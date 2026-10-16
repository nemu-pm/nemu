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
 * The edges UIKit cannot draw, drawn by the app (iOS). Native bars own the
 * system scroll edge effect, pinned to `soft` (see `nativeHeaderChrome.ts`).
 * Two places have no native effect over the page:
 *
 * - Beside a vertical bar (iPhone Duo): the rail carries the status bar and
 *   the bar items, and its native top / bottom effects are `hidden` (UIKit
 *   sized them for a bar band the page does not sit under, which blurred
 *   resting content). A title, a search field or a detail page's compact title
 *   still sits in a bar row at the top, and content scrolled into a hard cut
 *   at the window's edges.
 * - Under a bar the page draws itself (a screen with the native header
 *   hidden, e.g. a compact-height source page).
 *
 * There the page's scroll container draws a progressive blur band,
 * strongest at the edge, under the bar and over the content
 * (`NemuScrollEdgeSurface`). Its top band covers what the page has pinned at
 * the top (its bar extent, `useNemuScrollEdge`): the whole bar row while the
 * row shows something, so content fades out beneath the title instead of
 * colliding with it, and only the page's top padding otherwise. It always
 * ends where resting content starts, so nothing at rest is blurred.
 */
export const MOBILE_RAIL_TOP_EDGE_BLUR_INTENSITY = 28;
/** Below a bar row's bottom the band fades out over this much (pt). */
export const MOBILE_SCROLL_EDGE_BAR_TAIL = 8;
/** How long the band takes to follow a bar row appearing or going (ms). */
export const MOBILE_SCROLL_EDGE_BAND_DURATION_MS = 200;

export type MobileScrollEdgeBarExtent = {
  /** Bottom of what is pinned at the top (pt from the window top); 0 = nothing. */
  extent: number;
  /** The page draws that bar itself (no native bar, no native effect). */
  drawn: boolean;
};

export const MOBILE_NO_SCROLL_EDGE_BAR: MobileScrollEdgeBarExtent = { extent: 0, drawn: false };

/**
 * What a page scroll container has pinned over its top: the native bar's
 * height while its row shows a title / search field (`barContentVisible`),
 * or a bar the page draws itself (`headerBarHeight`, below the safe area).
 */
export function resolveMobileScrollEdgeBarExtent({
  platform,
  nativeHeader,
  barContentVisible,
  headerHeight,
  headerBarHeight,
  safeAreaTop,
}: {
  platform: string;
  nativeHeader: boolean;
  barContentVisible: boolean;
  /** The native stack's measured header (status bar included); 0 when hidden. */
  headerHeight: number | undefined;
  headerBarHeight: number | undefined;
  safeAreaTop: number;
}): MobileScrollEdgeBarExtent {
  if (platform !== "ios") return MOBILE_NO_SCROLL_EDGE_BAR;
  const drawn = finiteNonNegative(headerBarHeight ?? 0);
  if (drawn > 0 && !(nativeHeader && finiteNonNegative(headerHeight ?? 0) > 0)) {
    return { extent: Math.round(finiteNonNegative(safeAreaTop) + drawn), drawn: true };
  }
  if (!nativeHeader || !barContentVisible) return MOBILE_NO_SCROLL_EDGE_BAR;
  const bar = finiteNonNegative(headerHeight ?? 0);
  return bar > 0 ? { extent: Math.round(Math.max(bar, finiteNonNegative(safeAreaTop))), drawn: false } : MOBILE_NO_SCROLL_EDGE_BAR;
}

export type MobileRailTopScrollEdge = {
  /** Band height (pt) from the window's top edge; 0 = no band. */
  height: number;
  /** Mask stops: blur opacity from the top edge (offset 0) to the band's end (1). */
  maskStops: ReadonlyArray<readonly [string, number]>;
  /**
   * Under a bar row the content also fades toward the page background (the
   * native soft edge's dimming), at this opacity times the mask's; 0 = none.
   */
  scrimAlpha: number;
};

/** Page-colour fade under a bar row, at the band's strongest. */
export const MOBILE_SCROLL_EDGE_BAR_SCRIM_ALPHA = 0.55;

const NO_BAND: MobileRailTopScrollEdge = { height: 0, maskStops: [], scrimAlpha: 0 };

const RAIL_TOP_EDGE_STOP_COUNT = 6;

function easedMaskStops(plateau: number, fromEdge: "top" | "bottom") {
  return Array.from({ length: RAIL_TOP_EDGE_STOP_COUNT }, (_, index) => {
    const offset = index / (RAIL_TOP_EDGE_STOP_COUNT - 1);
    // Fully blurred at the edge (and over a bar row's plateau), gone at the
    // band's far end.
    const fromStrong = fromEdge === "top" ? offset : 1 - offset;
    const t = plateau >= 1 ? 0 : Math.max(0, (fromStrong - plateau) / (1 - plateau));
    const alpha = roundTo((1 - t) ** 1.6, 3);
    return [`rgba(0,0,0,${alpha})`, roundTo(offset, 4)] as const;
  });
}

export function resolveMobileRailTopScrollEdge({
  platform,
  verticalBarSide,
  safeAreaTop,
  pageTop,
  reader,
  bar = MOBILE_NO_SCROLL_EDGE_BAR,
}: {
  platform: string;
  verticalBarSide: "left" | "right" | null;
  safeAreaTop: number;
  pageTop: number;
  /** The reader is full-bleed and owns its own top scrim. */
  reader: boolean;
  /** What the page has pinned at the top. */
  bar?: MobileScrollEdgeBarExtent;
}): MobileRailTopScrollEdge {
  if (platform !== "ios" || reader) return NO_BAND;
  const barExtent = finiteNonNegative(bar.extent);
  // Under horizontal native bars the system draws the edge.
  if (!verticalBarSide && !(bar.drawn && barExtent > 0)) return NO_BAND;
  const restingTop = Math.round(finiteNonNegative(safeAreaTop) + finiteNonNegative(pageTop));
  if (barExtent > 0) {
    const height = Math.round(barExtent + MOBILE_SCROLL_EDGE_BAR_TAIL);
    // Full strength down to the bar row's middle, then eased out.
    const plateau = roundTo(Math.max(0, (barExtent - restingTop / 2) / height) * 0.75, 4);
    return { height, maskStops: easedMaskStops(plateau, "top"), scrimAlpha: MOBILE_SCROLL_EDGE_BAR_SCRIM_ALPHA };
  }
  return { height: restingTop, maskStops: easedMaskStops(0, "top"), scrimAlpha: 0 };
}

/**
 * Beside a vertical bar nothing sits along the bottom either: content scrolls
 * under the home indicator. The band covers the bottom safe area, strongest at
 * the edge; resting content ends above that inset.
 */
export function resolveMobileRailBottomScrollEdge({
  platform,
  verticalBarSide,
  safeAreaBottom,
  reader,
}: {
  platform: string;
  verticalBarSide: "left" | "right" | null;
  safeAreaBottom: number;
  reader: boolean;
}): MobileRailTopScrollEdge {
  if (platform !== "ios" || reader || !verticalBarSide) return NO_BAND;
  const height = Math.round(finiteNonNegative(safeAreaBottom));
  return height > 0 ? { height, maskStops: easedMaskStops(0, "bottom"), scrimAlpha: 0 } : NO_BAND;
}

/**
 * An RN-drawn sheet's scrolling body (`NemuSheetScrollEdge`): its header sits
 * above the body, so the band is short, covers only the body's top edge, and
 * shows once the body has scrolled past `threshold`.
 */
export const MOBILE_SHEET_SCROLL_EDGE = {
  height: 16,
  threshold: 2,
  fadeMs: 160,
  maskStops: easedMaskStops(0, "top"),
} as const;
