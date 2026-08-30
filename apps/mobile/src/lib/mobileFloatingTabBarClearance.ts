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
