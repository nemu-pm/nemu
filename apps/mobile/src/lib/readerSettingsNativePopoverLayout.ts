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
  twoPageSupported: boolean;
  showPagePairingControls: boolean;
  scrolling: boolean;
  showPlugins: boolean;
  showMarkComplete: boolean;
  /** Foldables: the notebook layout menu row. */
  showNotebookPane?: boolean;
};

/** Ideal (unclipped) Form height for the rows shown. */
export function readerSettingsNativeContentHeight(rows: ReaderSettingsNativeRows): number {
  const row = READER_SETTINGS_POPOVER_ROW;
  // 1. Reading direction: one segmented row.
  let height = row;
  let sections = 1;
  // 2. Two-page + pairing (most used after direction).
  if (rows.twoPageSupported) {
    height += row + (rows.showPagePairingControls ? row : 0);
    sections += 1;
  }
  // 3. "More": image processing, page width, keep awake, lock portrait,
  //    notebook layout, plugins, mark complete — one headed section.
  height += READER_SETTINGS_POPOVER_HEADER
    + row * 3
    + (rows.scrolling ? READER_SETTINGS_POPOVER_SLIDER_ROW : 0)
    + (rows.showNotebookPane ? row : 0)
    + (rows.showPlugins ? row : 0)
    + (rows.showMarkComplete ? row : 0);
  sections += 1;
  return Math.round(height + (sections - 1) * READER_SETTINGS_POPOVER_SECTION_SPACING + READER_SETTINGS_POPOVER_MARGIN * 2);
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
