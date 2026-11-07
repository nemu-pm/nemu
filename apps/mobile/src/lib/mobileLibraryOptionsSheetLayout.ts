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
  bottom: 12,
  /**
   * The least room under the footer: where there is no home indicator (an
   * iPhone SE) the system adds no inset below the detent, and the footnote's
   * last line was cut at the sheet's edge.
   */
  minBottomRoom: 28,
} as const;

/**
 * Height a `tightTop` form saves: the empty title row and the form's top
 * margin above its first group (measured on the Air, iOS 27: the first row's
 * centre moves 50 pt up under the bar).
 */
const MOBILE_LIBRARY_OPTIONS_TIGHT_TOP_SAVING = 50;

export function getMobileLibraryOptionsNativeSheetHeight({
  sections,
  footerLines,
  fontScale = 1,
  maxHeight,
  tightTop = false,
  bottomInset = 34,
}: {
  /** Row count of each section, top to bottom. */
  sections: readonly number[];
  footerLines: number;
  fontScale?: number;
  /** Tallest the sheet may be (the window's height minus its top inset). */
  maxHeight: number;
  /** The form starts just under the bar (`MobileNativeFormSheet` `tightTop`). */
  tightTop?: boolean;
  /** The window's bottom safe-area inset, which the system adds under the detent. */
  bottomInset?: number;
}): number {
  const m = MOBILE_LIBRARY_OPTIONS_SHEET_METRICS;
  const scale = Math.max(1, fontScale);
  const rows = sections.reduce((sum, count) => sum + Math.max(0, count), 0);
  const gaps = Math.max(0, sections.length - 1) * m.sectionGap;
  const footer = footerLines > 0 ? footerLines * m.footerLine * scale + m.footerPadding : 0;
  const top = m.chrome + m.formTop - (tightTop ? MOBILE_LIBRARY_OPTIONS_TIGHT_TOP_SAVING : 0);
  const bottom = Math.max(m.bottom, m.minBottomRoom - Math.max(0, bottomInset));
  const height = top + rows * m.row * scale + gaps + footer + bottom;
  return Math.round(Math.min(height, Math.max(240, maxHeight)));
}

/** Rough line count of `text` set at `fontSize` in `width` points (CJK one em, Latin about half). */
function estimateTextLines(text: string, width: number, fontSize: number): number {
  const ems = Array.from(text).reduce((sum, ch) => sum + (ch.charCodeAt(0) > 0x2e80 ? 1 : 0.52), 0);
  return Math.max(1, Math.ceil((ems * fontSize) / Math.max(80, width)));
}

/**
 * From this window width the sheet floats clear of the window's bottom edge, about
 * `MOBILE_LIBRARY_OPTIONS_FLOATING_SHEET_WIDTH` wide (494 pt on the iPhone Duo inner display).
 */
export const MOBILE_LIBRARY_OPTIONS_FLOATING_WINDOW_WIDTH = 600;
export const MOBILE_LIBRARY_OPTIONS_FLOATING_SHEET_WIDTH = 490;

/** An inset-grouped Form's footer text inset from each sheet edge (the group's margin and the text's own). */
const MOBILE_LIBRARY_OPTIONS_FOOTER_INSET = 36;

/**
 * Lines the library-options sheet's footer (a footnote) wraps to at the sheet's width, for
 * `getMobileLibraryOptionsNativeSheetHeight`'s `footerLines`.
 */
export function getMobileLibraryOptionsFooterLines(text: string, sheetWidth: number, fontScale = 1): number {
  if (!text) return 0;
  return estimateTextLines(
    text,
    sheetWidth - 2 * MOBILE_LIBRARY_OPTIONS_FOOTER_INSET,
    13 * Math.max(1, fontScale),
  );
}

/**
 * Height of the native Sign Out sheet: the question as the group's header,
 * the two data choices (title + secondary text, wrapped to at most two
 * lines), and when signing out failed, a group with the error, its Clear row
 * and its detail. Text lines are estimated at the sheet's width.
 */
export function getMobileCloudSignOutNativeSheetHeight({
  question,
  choiceDetails,
  errorDetail,
  sheetWidth,
  fontScale = 1,
  maxHeight,
  bottomInset = 34,
}: {
  question: string;
  choiceDetails: readonly string[];
  /** The failure's detail (its group shows only when there is one). */
  errorDetail: string | null;
  sheetWidth: number;
  fontScale?: number;
  maxHeight: number;
  bottomInset?: number;
}): number {
  const m = MOBILE_LIBRARY_OPTIONS_SHEET_METRICS;
  const scale = Math.max(1, fontScale);
  // Inset-grouped margins, then the row's insets, symbol and checkmark.
  const headerWidth = sheetWidth - 2 * 20 - 2 * 16;
  const detailWidth = sheetWidth - 2 * 20 - 2 * 16 - 30 - 30;
  const header = estimateTextLines(question, headerWidth, 17 * scale) * 22 * scale + 18;
  const choices = choiceDetails.reduce(
    (sum, detail) => sum + (24 + 22 * scale + Math.min(2, estimateTextLines(detail, detailWidth, 15 * scale)) * 20 * scale),
    0,
  );
  const errorGroup = errorDetail
    ? m.sectionGap +
      2 * m.row * scale +
      estimateTextLines(errorDetail, headerWidth, 13 * scale) * m.footerLine * scale +
      m.footerPadding
    : 0;
  // The bar, then the group's title in place of the form's top margin.
  const top = m.chrome + 8;
  const bottom = Math.max(16, m.minBottomRoom - Math.max(0, bottomInset));
  const height = top + header + choices + errorGroup + bottom;
  return Math.round(Math.min(height, Math.max(240, maxHeight)));
}
