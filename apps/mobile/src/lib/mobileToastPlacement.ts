import type { MobileToastObstacle, MobileToastRegion } from "@/lib/mobileToastRegion";
import type { WindowLayoutRect } from "@/lib/mobileWindowLayout";

/** The toast never grows wider than this, however wide its region. */
export const MOBILE_TOAST_MAX_WIDTH = 420;
/** Gap above a bottom tab bar. */
export const MOBILE_TOAST_TAB_BAR_GAP = 12;
/** Gap above the bottom safe-area edge when no bottom bar is shown. */
export const MOBILE_TOAST_SAFE_AREA_GAP = 16;
/** Minimum distance from the fold (book posture) and from a split's pane edge. */
export const MOBILE_TOAST_FOLD_RAIL_GAP = 16;
/** Gap above the keyboard. */
export const MOBILE_TOAST_KEYBOARD_GAP = 12;
/** A screen's region narrower than this is ignored (the window's own rules apply). */
export const MOBILE_TOAST_MIN_REGION_WIDTH = 240;
/** UIKit's compact tab bar height above the home indicator (fallback before a measurement). */
export const MOBILE_IOS_TAB_BAR_FALLBACK_HEIGHT = 49;
/** A title and a one-line detail: a toast's height until it has measured. */
export const MOBILE_TOAST_DEFAULT_HEIGHT = 60;
/** Least distance between a bottom toast and an obstacle. */
export const MOBILE_TOAST_OBSTACLE_GAP = 8;

export type MobileToastPlacement = {
  /** Window x of the toast's left edge. */
  left: number;
  width: number;
} & (
  /** Distance from the window's bottom edge. */
  | { bottom: number; top?: undefined }
  /** Window y of the toast's top edge (a screen anchored it below its top chrome). */
  | { top: number; bottom?: undefined }
);

export type MobileToastPlacementInput = {
  windowWidth: number;
  posture: "flat" | "book" | "notebook";
  /** Panes in physical order (`mobileAdaptiveLayout().panels`). */
  panels: readonly WindowLayoutRect[];
  /** The system's vertical bar (rail) side, null when bars are horizontal. */
  verticalBarSide: "left" | "right" | null;
  /** Window safe-area insets (left/right already include a rail). */
  safeArea: { left: number; right: number; bottom: number };
  /** Page gutters (`useMobilePageGutters`). */
  gutters: { left: number; right: number };
  /** A bottom tab bar is shown on the current route. */
  bottomTabBarVisible: boolean;
  /**
   * Height the bottom tab bar occupies from the window's bottom edge,
   * including the safe area (a tab child's measured bottom safe-area inset);
   * null when not measured yet.
   */
  bottomTabBarInset: number | null;
  /** Used when `bottomTabBarInset` is null. */
  fallbackBottomTabBarInset: number;
  /** The focused screen's main column / anchor (`useMobileToastRegion`). */
  region?: MobileToastRegion | null;
  /** A control on the focused screen a bottom toast must not cover. */
  obstacle?: MobileToastObstacle | null;
  /** Needed to test a bottom toast against `obstacle`. */
  windowHeight?: number;
  /** The toast's measured height (`MOBILE_TOAST_DEFAULT_HEIGHT` until then). */
  toastHeight?: number;
  /** Keyboard extent from the window's bottom edge; 0 when hidden. */
  keyboardHeight?: number;
  layoutDirection?: "ltr" | "rtl";
};

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Where the app-wide toast sits:
 * - bottom: above a bottom tab bar (measured height + 12), else the bottom
 *   safe area + 16 (Duo rail, or a pushed screen without tabs); above the
 *   keyboard (+12) while it is up;
 * - a screen's region (a split's trailing pane, the reader's page pane): within
 *   it, ≥16pt from a pane edge inside the window, so never across a sidebar or
 *   the fold; its `top` anchors the toast there instead of at the bottom;
 * - a screen's obstacle (an empty page's main action): a bottom toast that
 *   would reach it anchors at the obstacle's `anchorTop` instead (lifted just
 *   clear of the action it would cover the copy above it);
 * - a rail is never covered: the region ends at its safe-area edge (the page
 *   gutters already keep content off it, so the toast centres on the content);
 * - book posture without a region: inside the pane next to the rail (the
 *   trailing pane when there is no rail), ≥16pt from the fold — never across
 *   it;
 * - notebook (laptop) posture: the lower pane, which a bottom-anchored toast
 *   already sits in;
 * - width min(available, 420), centred in its region.
 */
export function resolveMobileToastPlacement(
  input: MobileToastPlacementInput,
): MobileToastPlacement {
  const windowWidth = Math.max(0, finite(input.windowWidth));
  const safeLeft = Math.max(0, finite(input.safeArea.left));
  const safeRight = Math.max(0, finite(input.safeArea.right));
  const safeBottom = Math.max(0, finite(input.safeArea.bottom));
  const gutterLeft = Math.max(0, finite(input.gutters.left));
  const gutterRight = Math.max(0, finite(input.gutters.right));
  const rail = input.verticalBarSide;

  let start = gutterLeft;
  let end = windowWidth - gutterRight;
  if (rail === "left") start = Math.max(start, safeLeft);
  if (rail === "right") end = Math.min(end, windowWidth - safeRight);

  // A screen's region decides first: it already accounts for the fold (a
  // split's fold-aligned pane, the reader's page pane).
  const region = input.region;
  let inRegion = false;
  if (region && Number.isFinite(region.x) && Number.isFinite(region.width)) {
    const regionEnd = region.x + region.width;
    // Pane edges inside the window (a sidebar, the fold) keep a gap; edges at
    // the window's own edge are already covered by the gutters.
    const regionStart = Math.max(start, region.x > 0 ? region.x + MOBILE_TOAST_FOLD_RAIL_GAP : region.x);
    const regionStop = Math.min(end, regionEnd < windowWidth ? regionEnd - MOBILE_TOAST_FOLD_RAIL_GAP : regionEnd);
    if (regionStop - regionStart >= MOBILE_TOAST_MIN_REGION_WIDTH) {
      start = regionStart;
      end = regionStop;
      inRegion = true;
    }
  }

  const panels = input.panels;
  if (!inRegion && input.posture === "book" && panels.length === 2) {
    const [first, second] = panels;
    const trailingIsSecond = (input.layoutDirection ?? "ltr") === "ltr";
    const useSecond = rail === "right" ? true : rail === "left" ? false : trailingIsSecond;
    const pane = useSecond ? second : first;
    if (useSecond) {
      // Fold on the pane's left edge.
      start = Math.max(start, pane.x + MOBILE_TOAST_FOLD_RAIL_GAP);
      end = Math.min(end, pane.x + pane.width);
    } else {
      // Fold on the pane's right edge.
      start = Math.max(start, pane.x);
      end = Math.min(end, pane.x + pane.width - MOBILE_TOAST_FOLD_RAIL_GAP);
    }
  } else if (!inRegion && input.posture === "notebook" && panels.length === 2) {
    const lower = panels[1];
    start = Math.max(start, lower.x);
    end = Math.min(end, lower.x + lower.width);
  }

  const available = Math.max(0, end - start);
  const width = Math.min(available, MOBILE_TOAST_MAX_WIDTH);
  const left = start + (available - width) / 2;
  if (region?.top !== undefined && Number.isFinite(region.top)) {
    return { left, width, top: Math.max(0, region.top) };
  }

  const hasBottomTabBar = input.bottomTabBarVisible && rail === null;
  const measured = input.bottomTabBarInset;
  const tabBarInset = measured !== null && Number.isFinite(measured) && measured > 0
    ? Math.max(measured, safeBottom)
    : Math.max(0, finite(input.fallbackBottomTabBarInset));
  const resting = hasBottomTabBar
    ? tabBarInset + MOBILE_TOAST_TAB_BAR_GAP
    : safeBottom + MOBILE_TOAST_SAFE_AREA_GAP;
  const keyboard = Math.max(0, finite(input.keyboardHeight ?? 0));
  const bottom = keyboard > 0 ? Math.max(resting, keyboard + MOBILE_TOAST_KEYBOARD_GAP) : resting;

  const obstacle = input.obstacle;
  const windowHeight = finite(input.windowHeight ?? 0);
  if (obstacle && windowHeight > 0 && keyboard === 0) {
    const toastBottom = windowHeight - bottom;
    const toastTop = toastBottom - finite(input.toastHeight ?? MOBILE_TOAST_DEFAULT_HEIGHT, MOBILE_TOAST_DEFAULT_HEIGHT);
    const reaches =
      left < obstacle.right &&
      left + width > obstacle.left &&
      toastTop - MOBILE_TOAST_OBSTACLE_GAP < obstacle.bottom &&
      toastBottom + MOBILE_TOAST_OBSTACLE_GAP > obstacle.top;
    if (reaches) return { left, width, top: Math.max(0, obstacle.anchorTop) };
  }

  return { left, width, bottom };
}
