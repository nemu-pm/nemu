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

/** Bottom runway (above the safe-area inset) appended to scrollable pages. */
export const MOBILE_PAGE_CONTENT_BOTTOM_RUNWAY = 148;

export function getMobilePageContentBottomPadding(bottomInset: number): number {
  const safeBottomInset = Number.isFinite(bottomInset)
    ? Math.max(0, bottomInset)
    : 0;
  return safeBottomInset + MOBILE_PAGE_CONTENT_BOTTOM_RUNWAY;
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
