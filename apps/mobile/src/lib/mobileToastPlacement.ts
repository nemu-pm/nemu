import type { WindowLayoutRect } from "@/lib/mobileWindowLayout";

/** The toast never grows wider than this, however wide its region. */
export const MOBILE_TOAST_MAX_WIDTH = 420;
/** Gap above a bottom tab bar. */
export const MOBILE_TOAST_TAB_BAR_GAP = 12;
/** Gap above the bottom safe-area edge when no bottom bar is shown. */
export const MOBILE_TOAST_SAFE_AREA_GAP = 16;
/** Minimum distance from the fold and from the system rail (book posture). */
export const MOBILE_TOAST_FOLD_RAIL_GAP = 16;
/** UIKit's compact tab bar height above the home indicator (fallback before a measurement). */
export const MOBILE_IOS_TAB_BAR_FALLBACK_HEIGHT = 49;

export type MobileToastPlacement = {
  /** Window x of the toast's left edge. */
  left: number;
  width: number;
  /** Distance from the window's bottom edge. */
  bottom: number;
};

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
  layoutDirection?: "ltr" | "rtl";
};

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Where the app-wide toast sits:
 * - bottom: above a bottom tab bar (measured height + 12), else the bottom
 *   safe area + 16 (Duo rail, or a pushed screen without tabs);
 * - book posture: inside the pane next to the rail (the trailing pane when
 *   there is no rail), ≥16pt from the fold and the rail — never across the
 *   fold;
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
  // A rail is never covered: keep ≥16pt off it even if the gutters are smaller.
  if (rail === "left") start = Math.max(start, safeLeft + MOBILE_TOAST_FOLD_RAIL_GAP);
  if (rail === "right") end = Math.min(end, windowWidth - safeRight - MOBILE_TOAST_FOLD_RAIL_GAP);

  const panels = input.panels;
  if (input.posture === "book" && panels.length === 2) {
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
  } else if (input.posture === "notebook" && panels.length === 2) {
    const lower = panels[1];
    start = Math.max(start, lower.x);
    end = Math.min(end, lower.x + lower.width);
  }

  const available = Math.max(0, end - start);
  const width = Math.min(available, MOBILE_TOAST_MAX_WIDTH);
  const left = start + (available - width) / 2;

  const hasBottomTabBar = input.bottomTabBarVisible && rail === null;
  const measured = input.bottomTabBarInset;
  const tabBarInset = measured !== null && Number.isFinite(measured) && measured > 0
    ? Math.max(measured, safeBottom)
    : Math.max(0, finite(input.fallbackBottomTabBarInset));
  const bottom = hasBottomTabBar
    ? tabBarInset + MOBILE_TOAST_TAB_BAR_GAP
    : safeBottom + MOBILE_TOAST_SAFE_AREA_GAP;

  return { left, width, bottom };
}
