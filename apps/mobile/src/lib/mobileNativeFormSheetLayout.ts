/**
 * Height of a content-sized `MobileNativeFormSheet` (iOS): the bar, then
 * grouped Form sections — rows, an optional header and footer — estimated at
 * the sheet's width so wrapped text is counted. A height detent excludes the
 * home indicator's inset (the system adds it below), so only a phone without
 * one gets extra room under the last line.
 */

/** Grabber band + inline navigation bar. */
const BAR = 64;
/** The Form's top content margin. */
const FORM_TOP = 20;
/** Gap between two sections. */
const SECTION_GAP = 36;
/** One line of section header / footer text (footnote) and its margins. */
const NOTE_LINE = 18;
const NOTE_PADDING = 14;
/** An inset-grouped row at the default text size. */
export const MOBILE_NATIVE_FORM_ROW = 44;
/** Inset-grouped margins plus the row's own insets, either side. */
const TEXT_INSET = 2 * 20 + 2 * 16;
/** What a `tightTop` sheet saves: the empty title row and the Form's top margin. */
const TIGHT_TOP_SAVING = 50;
/** The least room under the last line where the system adds no bottom inset. */
const MIN_BOTTOM_ROOM = 28;

export type MobileNativeFormSheetSection = {
  /** Row heights at the default text size (each grows with Dynamic Type). */
  rows: readonly number[];
  header?: string | null;
  footer?: string | null;
};

/** Rough line count of `text` set at `fontSize` in `width` points (CJK one em, Latin about half). */
export function estimateMobileTextLines(text: string, width: number, fontSize: number): number {
  const ems = Array.from(text).reduce((sum, ch) => sum + (ch.charCodeAt(0) > 0x2e80 ? 1 : 0.52), 0);
  return Math.max(1, Math.ceil((ems * fontSize) / Math.max(80, width)));
}

export function getMobileNativeFormSheetHeight({
  sections,
  sheetWidth,
  fontScale = 1,
  minHeight = 240,
  maxHeight,
  tightTop = false,
  bottomInset = 34,
}: {
  sections: readonly MobileNativeFormSheetSection[];
  sheetWidth: number;
  fontScale?: number;
  minHeight?: number;
  /** The tallest the sheet may be; a taller Form scrolls. */
  maxHeight: number;
  /** The first group starts just under the bar (`MobileNativeFormSheet` `tightTop`). */
  tightTop?: boolean;
  /** The window's bottom safe-area inset. */
  bottomInset?: number;
}): number {
  const scale = Math.max(1, fontScale);
  const noteWidth = sheetWidth - TEXT_INSET;
  const note = (text: string | null | undefined) =>
    text ? estimateMobileTextLines(text, noteWidth, 13 * scale) * NOTE_LINE * scale + NOTE_PADDING : 0;
  const body = sections.reduce(
    (sum, section, index) =>
      sum +
      (index > 0 ? SECTION_GAP : 0) +
      note(section.header) +
      section.rows.reduce((rows, row) => rows + row * scale, 0) +
      note(section.footer),
    0,
  );
  const bottom = Math.max(16, MIN_BOTTOM_ROOM - Math.max(0, bottomInset));
  const height = BAR + FORM_TOP - (tightTop ? TIGHT_TOP_SAVING : 0) + body + bottom;
  return Math.round(Math.max(Math.min(height, maxHeight), Math.min(minHeight, maxHeight)));
}
