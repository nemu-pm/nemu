/**
 * Native reader settings: popover or sheet.
 *
 * A SwiftUI popover sizes to its content's ideal size, and a Form (a List)
 * has none, so the rows are counted with the system's inset-grouped metrics
 * (iOS 26+: ~52pt rows, compact section spacing, a section header ~28pt,
 * ~20pt top/bottom margin). When that height does not fit the space the
 * system can give the popover next to its anchor (one notebook pane on the
 * iPhone Duo), the same Form is presented as a sheet with detents instead —
 * never a clipped popover whose rows cannot be reached. Compact-width windows
 * always use the sheet.
 */
export const READER_SETTINGS_POPOVER_WIDTH = 360;
export const READER_SETTINGS_POPOVER_ROW = 52;
export const READER_SETTINGS_POPOVER_SLIDER_ROW = 72;
export const READER_SETTINGS_POPOVER_SECTION_SPACING = 20;
export const READER_SETTINGS_POPOVER_HEADER = 28;
export const READER_SETTINGS_POPOVER_MARGIN = 20;

export type ReaderSettingsNativeRows = {
  /**
   * Paged reading: the Page Layout and Page Fit menus in the page group (and
   * its footnote), and while a spread shows the pairing group.
   */
  twoPageSupported: boolean;
  showPagePairingControls: boolean;
  scrolling: boolean;
  showPlugins: boolean;
  showMarkComplete: boolean;
  /** Paged reading: the Page Turning menu row in the page group. */
  showPageTurn?: boolean;
  /** The outer display: Avoid Camera Area in "More", with that group's footnote. */
  showCameraMode?: boolean;
  /** The Orientation Lock row (absent on an iPhone and the Duo outer display); default shown. */
  showOrientationLock?: boolean;
};

/** A one-line section footer with its margins (a longer one wraps; the sheet measures itself). */
export const READER_SETTINGS_POPOVER_FOOTER = 36;

/** Ideal (unclipped) Form height for the rows shown. */
export function readerSettingsNativeContentHeight(rows: ReaderSettingsNativeRows): number {
  const row = READER_SETTINGS_POPOVER_ROW;
  const footer = READER_SETTINGS_POPOVER_FOOTER;
  // 1. Reading direction: one segmented row.
  let height = row;
  let sections = 1;
  // 2. The page: Page Turning (paged), Page Layout and Page Fit (paged, with
  //    one footnote of two lines), Page Background (every presentation).
  height += (rows.showPageTurn ? row : 0)
    + (rows.twoPageSupported ? row * 2 + footer * 2 : 0)
    + row;
  sections += 1;
  // 3. While a spread shows: pairing and Shift by One Page, with their footer.
  if (rows.twoPageSupported && rows.showPagePairingControls) {
    height += row * 2 + footer;
    sections += 1;
  }
  // 4. "More": image processing, page width, keep awake, Avoid Camera Area
  //    (outer display, with the group's footnote), orientation lock,
  //    plugins, mark complete — one headed section.
  height += READER_SETTINGS_POPOVER_HEADER
    + row * 2
    + (rows.showCameraMode ? row + footer : 0)
    + (rows.showOrientationLock !== false ? row : 0)
    + (rows.scrolling ? READER_SETTINGS_POPOVER_SLIDER_ROW : 0)
    + (rows.showPlugins ? row : 0)
    + (rows.showMarkComplete ? row : 0);
  sections += 1;
  return Math.round(height + (sections - 1) * READER_SETTINGS_POPOVER_SECTION_SPACING + READER_SETTINGS_POPOVER_MARGIN * 2);
}

/**
 * The reader settings Form's group inset: the system's inset-grouped margin
 * (20pt on iPhone, in the sheet and the popover alike), in the Form's own
 * points. A React Native page pushed in the same NavigationStack sets its
 * groups this far in, so their edges meet the Form's (both draw at the
 * sheet's scale, so they meet on screen too).
 */
export const READER_SETTINGS_FORM_INSET = 20;

/** A sheet's inline navigation bar (title + close button) above the Form. */
export const READER_SETTINGS_SHEET_BAR = 56;

/**
 * First guess at the compact-width sheet's height: the Form's rows under its
 * title bar. The sheet then sizes itself to the Form's measured content
 * (`fitSheetDetentToContent`); this only spares the first frame a full-height
 * detent before that measurement lands.
 */
export function readerSettingsNativeSheetEstimatedHeight(rows: ReaderSettingsNativeRows): number {
  return readerSettingsNativeContentHeight(rows) + READER_SETTINGS_SHEET_BAR;
}

export type ReaderSettingsNativePresentation =
  | { kind: "popover"; width: number; height: number }
  | { kind: "sheet" };

/**
 * Where the reader settings are presented.
 *
 * - Compact width (phones, iPhone Duo outer display): always a sheet with
 *   detents — HIG: a compact-width presentation is a sheet, and a popover
 *   squeezed beside a button on a phone-sized window leaves rows out of
 *   reach. Mirrors the web reader (`responsive-dialog`: drawer on narrow).
 * - Regular width (Duo inner display, tablets): a popover anchored to the
 *   settings button when the whole Form fits `availableHeight` (the space the
 *   system can give it beside its anchor); otherwise the same sheet (one
 *   notebook pane on the Duo is too short for the Form).
 */
export function readerSettingsNativePresentation(
  rows: ReaderSettingsNativeRows,
  input: { availableHeight: number; regularWidth: boolean },
): ReaderSettingsNativePresentation {
  if (!input.regularWidth) return { kind: "sheet" };
  const height = readerSettingsNativeContentHeight(rows);
  const available = Number.isFinite(input.availableHeight) ? input.availableHeight : 0;
  return height <= available
    ? { kind: "popover", width: READER_SETTINGS_POPOVER_WIDTH, height }
    : { kind: "sheet" };
}

/** Margin the system keeps between a popover and the edge of its region. */
export const READER_SETTINGS_POPOVER_EDGE_MARGIN = 16;

/**
 * Height a popover can take beside its anchor. Folded (notebook), the system
 * keeps the popover inside one pane, so the tallest pane bounds it; otherwise
 * the larger of the space below and above the anchor within the window's
 * safe area.
 */
export function readerSettingsPopoverAvailableHeight(input: {
  anchor: { y: number; height: number };
  bounds: { height: number };
  safeInsets: { top: number; bottom: number };
  panes?: readonly { height: number }[] | null;
}): number {
  const margin = READER_SETTINGS_POPOVER_EDGE_MARGIN;
  if (input.panes && input.panes.length > 1) {
    return Math.max(0, Math.max(...input.panes.map((pane) => pane.height)) - margin * 2);
  }
  const below = input.bounds.height - input.safeInsets.bottom - (input.anchor.y + input.anchor.height) - margin;
  const above = input.anchor.y - input.safeInsets.top - margin;
  return Math.max(0, below, above);
}

/** Leeway for the estimate: a Form a little taller than estimated still gets the cap. */
export const READER_SETTINGS_SHEET_CAP_SLACK = 48;

/**
 * Explicit detent for the settings sheet when it must stay below a fold (the
 * iPhone Duo half folded like a laptop: the sheet belongs to the bottom pane,
 * the half the hands rest on, and never covers the page above the hinge).
 * The system caps a fitted sheet at the screen, not at the fold, so a Form
 * that could reach past `maxHeight` gets exactly `maxHeight` and scrolls.
 * 0: no cap (the sheet keeps fitting its content).
 */
export function readerSettingsSheetDetentCap(input: { estimatedHeight: number; maxHeight: number | null | undefined }): number {
  const max = input.maxHeight;
  if (max == null || !Number.isFinite(max) || max <= 0) return 0;
  return input.estimatedHeight + READER_SETTINGS_SHEET_CAP_SLACK > max ? Math.floor(max) : 0;
}

/** The floating sheet's gutter above the bottom safe-area edge (iOS 26+, measured on the iPhone Duo inner display). */
export const READER_SHEET_FLOAT_GUTTER = 8;

/**
 * Tallest detent that keeps a sheet's top (its grabber included) below the
 * fold, half folded like a laptop: a `.height` detent excludes the bottom
 * safe area and the floating sheet's gutter, so both come off the bottom pane.
 */
export function readerNotebookSheetMaxHeight(input: { paneHeight: number; bottomInset: number }): number {
  const pane = Number.isFinite(input.paneHeight) ? input.paneHeight : 0;
  const bottom = Number.isFinite(input.bottomInset) ? Math.max(0, input.bottomInset) : 0;
  return Math.max(0, Math.floor(pane - bottom - READER_SHEET_FLOAT_GUTTER));
}

/**
 * Key of the presented settings Form per window size (whole points): a new
 * size remounts the Form, so every row is laid out at the new width instead
 * of keeping a height the List measured at the old one.
 */
export function readerSettingsFormKey(window: { width: number; height: number }): string {
  return `form:${Math.round(window.width)}x${Math.round(window.height)}`;
}

/**
 * Key of a pushed plugin page's rows at a page width (half-point steps): a new
 * width lays the rows out from scratch, so no row keeps a text measurement
 * from another width. It keys the rows inside the page's `RNHostView`, never
 * the host or its hosted view.
 */
export function pushedPageWidthKey(width: number): string {
  return `width:${Math.round(width * 2) / 2}`;
}
