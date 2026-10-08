/**
 * Height of the native (SwiftUI) library-options sheet: a navigation bar and
 * a grouped Form with a few button rows. A fixed detent that fits its rows —
 * a "medium" half-screen would leave most of the sheet empty — grown with
 * Dynamic Type and capped so the Form scrolls rather than covering the page.
 */
export const MOBILE_LIBRARY_OPTIONS_SHEET_METRICS = {
  /** Grabber band + inline navigation bar. */
  chrome: 64,
  /** Form's top content margin. */
  formTop: 20,
  /** An iOS 26 inset-grouped row with a symbol. */
  row: 52,
  /** Gap between two sections. */
  sectionGap: 36,
  /** One line of section footer text (footnote). */
  footerLine: 18,
  /** Footer's top / bottom margins. */
  footerPadding: 14,
  /**
   * Breathing room under the last row. The system adds the home-indicator
   * inset on top of a height detent (measured on iPhone 17 Pro, iOS 27).
   */
  bottom: 4,
} as const;

/**
 * Height a `tightTop` form saves: the empty title row and the form's top
 * margin above its first group (measured on the Air, iOS 27: the first row's
 * centre moves 50 pt up under the bar).
 */
export const MOBILE_LIBRARY_OPTIONS_TIGHT_TOP_SAVING = 50;

export function getMobileLibraryOptionsNativeSheetHeight({
  sections,
  footerLines,
  fontScale = 1,
  maxHeight,
  tightTop = false,
}: {
  /** Row count of each section, top to bottom. */
  sections: readonly number[];
  footerLines: number;
  fontScale?: number;
  /** Tallest the sheet may be (the window's height minus its top inset). */
  maxHeight: number;
  /** The form starts just under the bar (`MobileNativeFormSheet` `tightTop`). */
  tightTop?: boolean;
}): number {
  const m = MOBILE_LIBRARY_OPTIONS_SHEET_METRICS;
  const scale = Math.max(1, fontScale);
  const rows = sections.reduce((sum, count) => sum + Math.max(0, count), 0);
  const gaps = Math.max(0, sections.length - 1) * m.sectionGap;
  const footer = footerLines > 0 ? footerLines * m.footerLine * scale + m.footerPadding : 0;
  const top = m.chrome + m.formTop - (tightTop ? MOBILE_LIBRARY_OPTIONS_TIGHT_TOP_SAVING : 0);
  const height = top + rows * m.row * scale + gaps + footer + m.bottom;
  return Math.round(Math.min(height, Math.max(240, maxHeight)));
}
