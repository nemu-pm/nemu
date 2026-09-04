const MAX_DYNAMIC_SETTINGS_ROWS = 4;

/**
 * Estimated non-row sheet height: header chrome plus the card shell, card
 * header, and bottom scroll inset that surround the setting rows.
 */
const SHEET_CHROME_HEIGHT = 64;
const SHEET_CONTENT_BASE_HEIGHT = 150;
/**
 * Real rows measure 52pt (page/login rows) to 66pt (setting rows) plus the
 * list gap, so the per-row allowance stays slightly under the old 72pt
 * reserve to keep the fit-content detent from re-creating an empty tail.
 */
const SETTINGS_ROW_HEIGHT = 64;
/** Matches the scaffold's own minimum bounded detent. */
const MIN_BOUNDED_SHEET_HEIGHT = 240;

export type MobileSettingsSheetLayout = {
  scroll: boolean;
  /** A pixel detent hugs the estimated content; "82%" caps genuinely long forms. */
  snapPoint: "82%" | number | undefined;
};

/**
 * Small settings forms should hug their content. Long, accessibility-sized,
 * landscape, and compact-height forms need a bounded viewport so every row
 * remains reachable through the native scroll container — but the detent
 * tracks the estimated content height instead of reserving the full max
 * detent, which pooled a large empty tail under moderately long forms.
 */
export function getMobileSettingsSheetLayout({
  fontScale,
  height,
  rowCount,
  width,
}: {
  fontScale: number;
  height: number;
  rowCount: number;
  width: number;
}): MobileSettingsSheetLayout {
  const effectiveFontScale = Math.max(1, Math.min(fontScale, 2));
  const estimatedContentHeight =
    SHEET_CONTENT_BASE_HEIGHT +
    rowCount * SETTINGS_ROW_HEIGHT * effectiveFontScale;
  const safeDynamicHeight = Math.max(280, height * 0.78);
  const needsBoundedScroll =
    rowCount > MAX_DYNAMIC_SETTINGS_ROWS ||
    estimatedContentHeight > safeDynamicHeight ||
    (width > height && rowCount > 2);

  if (!needsBoundedScroll) {
    return { scroll: false, snapPoint: undefined };
  }

  // Bounded forms keep their internal scroll view, so an under-estimate only
  // scrolls; the detent just never reserves a large empty tail.
  const estimatedSheetHeight = SHEET_CHROME_HEIGHT + estimatedContentHeight;
  if (estimatedSheetHeight >= safeDynamicHeight) {
    return { scroll: true, snapPoint: "82%" };
  }
  return {
    scroll: true,
    snapPoint: Math.max(
      MIN_BOUNDED_SHEET_HEIGHT,
      Math.round(estimatedSheetHeight),
    ),
  };
}
