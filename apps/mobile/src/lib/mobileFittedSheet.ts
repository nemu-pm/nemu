/**
 * Content-sized native sheets (iOS): the off-screen copy of a sheet's page
 * that measures it before the sheet presents (`measureSheetPage`, see
 * `fitSheetDetentToContent`).
 *
 * The copy must lay its Form out exactly as the sheet will: at the sheet's
 * width (row text and section footers wrap the same) and tall enough that
 * every row of a page that fits on screen is laid out (a List only sizes the
 * rows it has laid out; the rest count at an estimate).
 */

/**
 * iOS 26+: a compact-width sheet below its large detent floats inset from the
 * screen's sides (Liquid Glass), 8pt each side on iPhone.
 */
export const FITTED_SHEET_SIDE_INSET = 8;

/** Frame of the off-screen measuring copy for a window of this size. */
export function fittedSheetMeasureFrame(window: { width: number; height: number }): {
  width: number;
  height: number;
} {
  const width = Math.max(0, Math.round(window.width - FITTED_SHEET_SIDE_INSET * 2));
  const height = Math.max(0, Math.round(window.height));
  return { width, height };
}

/** Measured pages of the reader's sheets (one store per sheet). */
export const READER_SETTINGS_SHEET_GROUP = "reader-settings";
export const READER_SETTINGS_SHEET_PAGE = "settings";
export const READER_PLUGIN_SHEET_GROUP = "reader-plugins";
export const READER_PLUGIN_SHEET_LIST_PAGE = "plugins";

/** The page a plugin's settings are measured and reported as. */
export function readerPluginSheetPage(pluginId: string): string {
  return `plugin:${pluginId}`;
}

/** The plugin sheet's page on top: the plugin pushed from the list, or the list. */
export function readerPluginSheetActivePage(selectedPluginId: string | null): string {
  return selectedPluginId ? readerPluginSheetPage(selectedPluginId) : READER_PLUGIN_SHEET_LIST_PAGE;
}
