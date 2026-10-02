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

/**
 * React Native pages in a content-sized iOS sheet (the reader's Plugins
 * sheet). They are laid out off screen at the width the sheet will show them
 * at, measured, and the sheet presents once at the detent that fits the page
 * on top. The sheet lays hosted content out compensated for the iOS 26
 * floating scale (`RNHostView compensatesPresentationScale`): a sheet drawn at
 * `scale` shows `detent × scale` points of content, so a page `h` tall needs
 * the detent `h / scale`.
 */
export type FittedSheetHostMetrics = {
  /** Width the hosted content is laid out at (points, as shown). */
  width: number;
  /** The scale the presentation draws the sheet at (1 when not floating). */
  scale: number;
};

/**
 * Before a sheet has presented in this window size: iOS 26+ floats a
 * compact-width sheet below its large detent, inset 8pt each side and drawn
 * scaled to that width; otherwise the sheet is as wide as the window.
 */
export function fittedSheetGuessHostMetrics({
  window,
  floating,
}: {
  window: { width: number; height: number };
  floating: boolean;
}): FittedSheetHostMetrics {
  const windowWidth = Math.max(0, Math.round(window.width));
  if (!floating || windowWidth <= FITTED_SHEET_SIDE_INSET * 2) {
    return { width: windowWidth, scale: 1 };
  }
  const width = fittedSheetMeasureFrame(window).width;
  return { width, scale: width / windowWidth };
}

/** The detent (points) that shows a page `pageHeight` tall in full. */
export function fittedSheetDetentForPage(pageHeight: number, scale: number): number {
  const safeScale = Number.isFinite(scale) && scale > 0 ? Math.min(scale, 1) : 1;
  return Math.max(0, Math.ceil(pageHeight / safeScale));
}

/**
 * Narrower than any real sheet (the narrowest iPhone sheet is ~300pt): the
 * hosted view's placeholder frame before the presentation lays it out (it
 * reports 1×0 first). Learning it would re-measure every page at that width
 * and resize the sheet mid-presentation.
 */
export const FITTED_SHEET_MIN_HOST_WIDTH = 100;

/** Host metrics learned from a presented sheet, per window size (so rotation or a resize re-learns). */
export function createFittedSheetHostMetricsCache() {
  const learned = new Map<string, FittedSheetHostMetrics>();
  const key = (window: { width: number; height: number }) =>
    `${Math.round(window.width)}x${Math.round(window.height)}`;
  return {
    get(window: { width: number; height: number }): FittedSheetHostMetrics | undefined {
      return learned.get(key(window));
    },
    /**
     * Records what the presented sheet reported; returns whether anything
     * changed. Where the sheet floats (`fallback.scale` < 1), a full-width,
     * unscaled report is the sheet at its large detent, not the floating
     * metrics pages are fitted with: learning it would re-fit a tall page
     * below large, float the sheet again, and loop.
     */
    learn(
      window: { width: number; height: number },
      next: Partial<FittedSheetHostMetrics>,
      fallback: FittedSheetHostMetrics,
    ): boolean {
      const previous = learned.get(key(window));
      const base = previous ?? fallback;
      const floats = fallback.scale < 1;
      const width =
        next.width !== undefined &&
        next.width >= FITTED_SHEET_MIN_HOST_WIDTH &&
        !(floats && next.width >= Math.round(window.width) - 0.5)
          ? Math.round(next.width)
          : base.width;
      const scale =
        next.scale !== undefined &&
        Number.isFinite(next.scale) &&
        next.scale > 0 &&
        !(floats && next.scale >= 0.999)
          ? Math.min(next.scale, 1)
          : base.scale;
      if (previous && previous.width === width && Math.abs(previous.scale - scale) < 0.0005) return false;
      learned.set(key(window), { width, scale });
      return true;
    },
  };
}

/**
 * Whether the sheet may present, and at which detent. It presents only once
 * the page on top has been measured at the current page width, so UIKit runs
 * a single presentation at the final height, never at a guess. Once up it
 * stays up while `visible`: a page being re-measured (a new width learned
 * from the presented sheet, a row appearing) keeps the last detent until its
 * new height is known, then resizes.
 */
export function fittedSheetPresentation({
  visible,
  page,
  pageWidth,
  measured,
  scale,
  current,
}: {
  visible: boolean;
  page: string;
  pageWidth: number;
  /** Page → its height and the width it was laid out at. */
  measured: Readonly<Record<string, { width: number; height: number } | undefined>>;
  scale: number;
  /** What the previous render decided. */
  current: { presented: boolean; detent: number };
}): { presented: boolean; detent: number } {
  const entry = measured[page];
  const height = entry && Math.abs(entry.width - pageWidth) < 0.5 && entry.height > 0 ? entry.height : null;
  const stillUp = visible && current.presented;
  return {
    presented: visible && (stillUp || height !== null),
    detent:
      height !== null ? fittedSheetDetentForPage(height, scale) : stillUp ? current.detent : 0,
  };
}
