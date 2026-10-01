/**
 * Geometry shared between the Android floating glass tab bar and the page
 * scaffolds that scroll beneath it. The bar is a translucent absolute overlay:
 * pages stay full height so content remains visible through the glass, and
 * scrollable content ends with enough runway that its final row can be brought
 * fully above the bar.
 */
export const MOBILE_FLOATING_TAB_BAR_ITEM_MIN_HEIGHT = 54;
export const MOBILE_FLOATING_TAB_BAR_VERTICAL_PADDING = 8;
export const MOBILE_FLOATING_TAB_BAR_VISUAL_HEIGHT =
  MOBILE_FLOATING_TAB_BAR_ITEM_MIN_HEIGHT +
  MOBILE_FLOATING_TAB_BAR_VERTICAL_PADDING * 2;

/**
 * The normal end margin of a scrolling page: the space left between its last
 * row and whatever sits below it (the tab bar, or the home indicator).
 */
export const MOBILE_PAGE_CONTENT_BOTTOM_MARGIN = 24;

/**
 * Bottom padding of a page scroll view's content: exactly enough to bring the
 * last row fully clear of what overlays the page's bottom edge, plus the
 * normal page margin — never a fixed runway, which left a large blank band
 * past the last row wherever the overlay was shorter (or absent).
 *
 * - `systemAdjustsBottomInset` (iOS scroll views with automatic content
 *   inset adjustment): UIKit's adjusted inset already equals the view's
 *   bottom safe area — the tab bar where one is shown (`UITabBarController`
 *   extends its children's safe area by the bar), else the home indicator —
 *   so the content only adds the margin. Adding the safe area here too would
 *   count it twice.
 * - Otherwise (Android, iOS pages that opt out of automatic insets): the
 *   safe-area inset, plus the floating tab bar overlay when it is shown, plus
 *   the margin.
 */
export function getMobilePageContentBottomPadding({
  safeAreaBottom,
  systemAdjustsBottomInset,
  floatingTabBar,
  tabBottom,
}: {
  safeAreaBottom: number;
  systemAdjustsBottomInset: boolean;
  /** The Android floating tab bar overlays this page's bottom edge. */
  floatingTabBar: boolean;
  /** Distance from the bottom safe-area edge to the floating bar (`spacing.tabBottom`). */
  tabBottom: number;
}): number {
  if (systemAdjustsBottomInset) return MOBILE_PAGE_CONTENT_BOTTOM_MARGIN;
  const safeBottomInset = Number.isFinite(safeAreaBottom)
    ? Math.max(0, safeAreaBottom)
    : 0;
  const overlay = floatingTabBar ? getMobileFloatingTabBarOverlayExtent(tabBottom) : 0;
  return safeBottomInset + overlay + MOBILE_PAGE_CONTENT_BOTTOM_MARGIN;
}

/**
 * Space between the bottom safe-area edge and the top of the floating bar,
 * i.e. how much of the runway the overlay itself consumes.
 */
export function getMobileFloatingTabBarOverlayExtent(tabBottom: number): number {
  const safeTabBottom = Number.isFinite(tabBottom) ? Math.max(0, tabBottom) : 0;
  return safeTabBottom + MOBILE_FLOATING_TAB_BAR_VISUAL_HEIGHT;
}

/** The bar's own width: four 72pt items, 8pt gaps, 12pt side padding. */
export const MOBILE_FLOATING_TAB_BAR_WIDTH = 4 * 72 + 3 * 8 + 2 * 12;

export type MobileFloatingTabBarFrame = { left: number; width: number };

/**
 * Where the floating tab bar is centred. Full width (centred on the window)
 * unless the window is folded into two side-by-side panes (book posture):
 * then it sits inside the trailing pane — the same pane Android sheets use —
 * so it never straddles the hinge. Falls back to the window when that pane
 * is too narrow for the bar.
 */
export function resolveMobileFloatingTabBarFrame({
  windowWidth,
  posture,
  panels,
  layoutDirection = "ltr",
}: {
  windowWidth: number;
  posture: "flat" | "book" | "notebook";
  /** Window-coordinate panes in physical order (`mobileAdaptiveLayout`). */
  panels: readonly { x: number; width: number }[];
  layoutDirection?: "ltr" | "rtl";
}): MobileFloatingTabBarFrame | null {
  if (posture !== "book" || panels.length !== 2 || !(windowWidth > 0)) return null;
  const pane = layoutDirection === "rtl" ? panels[0] : panels[panels.length - 1];
  if (!pane || !(pane.width >= MOBILE_FLOATING_TAB_BAR_WIDTH + 16)) return null;
  return { left: pane.x, width: pane.width };
}
