const MAX_DYNAMIC_SETTINGS_ROWS = 4;

export type MobileSettingsSheetLayout = {
  scroll: boolean;
  snapPoint: "82%" | undefined;
};

/**
 * Small settings forms should hug their content. Long, accessibility-sized,
 * landscape, and compact-height forms need a bounded viewport so every row
 * remains reachable through the native scroll container.
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
  const estimatedContentHeight = 150 + rowCount * 72 * effectiveFontScale;
  const safeDynamicHeight = Math.max(280, height * 0.78);
  const needsBoundedScroll =
    rowCount > MAX_DYNAMIC_SETTINGS_ROWS ||
    estimatedContentHeight > safeDynamicHeight ||
    (width > height && rowCount > 2);

  return needsBoundedScroll
    ? { scroll: true, snapPoint: "82%" }
    : { scroll: false, snapPoint: undefined };
}
