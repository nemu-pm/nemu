export type MobileSourceManagerSheetLayout = {
  fillContent: boolean;
  snapPoints: [string] | undefined;
};

/**
 * The source list normally contains only one or two links, so it should hug
 * its content. Searching and merging need a stable viewport for asynchronous
 * result lists, while long, large-text, and landscape lists need scrolling.
 *
 * The merge list is filtered as its query is typed, so its row count changes
 * under the keyboard. A change of layout swaps the sheet's body, which drops
 * the field's focus (and the keyboard) mid-word: that list keeps the bounded
 * viewport whatever it currently matches.
 */
export function getMobileSourceManagerSheetLayout({
  addPanelFiltersWhileTyping = false,
  addPanelOpen,
  addPanelRowCount,
  fontScale,
  height,
  sourceCount,
  width,
}: {
  addPanelFiltersWhileTyping?: boolean;
  addPanelOpen: boolean;
  addPanelRowCount: number;
  fontScale: number;
  height: number;
  sourceCount: number;
  width: number;
}): MobileSourceManagerSheetLayout {
  const effectiveFontScale = Math.max(1, Math.min(fontScale, 2));
  const estimatedContentHeight = addPanelOpen
    ? 250 + Math.max(1, addPanelRowCount) * 76 * effectiveFontScale
    : 166 + sourceCount * 76 * effectiveFontScale + (sourceCount > 1 ? 24 : 0);
  const safeDynamicHeight = Math.max(300, height * 0.72);
  const needsBoundedScroll =
    (addPanelOpen && (addPanelFiltersWhileTyping || addPanelRowCount > 1)) ||
    estimatedContentHeight > safeDynamicHeight ||
    (width > height && (addPanelOpen || sourceCount > 1));

  return needsBoundedScroll
    ? {
        fillContent: true,
        snapPoints: [addPanelOpen ? "88%" : "82%"],
      }
    : { fillContent: false, snapPoints: undefined };
}
