// Matches the hero button's 14pt horizontal padding, 18pt image slot and 6pt gap.
export const MOBILE_DETAIL_ACTION_HORIZONTAL_PADDING = 14;
export const MOBILE_DETAIL_ACTION_ICON_WIDTH = 18;
export const MOBILE_DETAIL_ACTION_GAP = 6;
const FULL_LABEL_TEXT_BUDGET = 140;

/** Select presentation text only; the caller retains the full accessibility label. */
export function getMobileMangaDetailActionLabel({
  label, compactLabel, buttonWidth, fontScale,
}: { label: string; compactLabel?: string; buttonWidth: number; fontScale: number }) {
  if (!compactLabel || !Number.isFinite(buttonWidth) || buttonWidth <= 0) return label;
  // The hero's maxFontSizeMultiplier is 2; do not reserve space for a scale
  // that the text itself will never reach.
  const scale = Number.isFinite(fontScale) ? Math.max(1, Math.min(fontScale, 2)) : 1;
  const textWidth = buttonWidth - MOBILE_DETAIL_ACTION_HORIZONTAL_PADDING * 2
    - MOBILE_DETAIL_ACTION_ICON_WIDTH - MOBILE_DETAIL_ACTION_GAP;
  return textWidth < FULL_LABEL_TEXT_BUDGET * scale ? compactLabel : label;
}

/** Gap between the primary pill and each 36pt icon action (hero `actionRow`). */
export const MOBILE_DETAIL_ACTION_ROW_GAP = 10;
export const MOBILE_DETAIL_ICON_ACTION_WIDTH = 36;
/** Sub-point rounding between the measured text and the laid-out pill. */
const LABEL_FIT_SLACK = 2;

/** Width of the primary pill's label box for a button of `buttonWidth`. */
export function getMobileMangaDetailActionTextBudget(buttonWidth: number): number {
  return buttonWidth - MOBILE_DETAIL_ACTION_HORIZONTAL_PADDING * 2
    - MOBILE_DETAIL_ACTION_ICON_WIDTH - MOBILE_DETAIL_ACTION_GAP;
}

/** Width the primary pill gets in an action row of `rowWidth` beside `secondaryCount` icons. */
export function getMobileMangaDetailPrimaryButtonWidth({
  rowWidth, secondaryCount, maxWidth, fullRow = false, minimumTouchTarget = 0,
}: {
  rowWidth: number;
  secondaryCount: number;
  maxWidth: number;
  fullRow?: boolean;
  /**
   * `getNemuButtonMinimumTargetSize(Platform.OS)`: depth buttons grow their
   * layout frame to the touch target (48dp on Android, 44pt on iOS), so each
   * 36pt icon action occupies at least that much of the row.
   */
  minimumTouchTarget?: number;
}): number {
  if (!Number.isFinite(rowWidth) || rowWidth <= 0) return 0;
  if (fullRow) return Math.min(maxWidth, rowWidth);
  const iconSlot = Math.max(MOBILE_DETAIL_ICON_ACTION_WIDTH, Number.isFinite(minimumTouchTarget) ? minimumTouchTarget : 0);
  const icons = Math.max(0, secondaryCount) * (iconSlot + MOBILE_DETAIL_ACTION_ROW_GAP);
  return Math.max(0, Math.min(maxWidth, rowWidth - icons));
}

export type MobileMangaDetailActionPresentation = {
  /** Where the action row renders: pinned in the copy column, or below the cover. */
  placement: "copy" | "below";
  label: string;
  /** 1 = single line; undefined = wrap. The label never truncates. */
  lines: number | undefined;
};

/**
 * Presentation of the hero's primary action so its label is never cut off
 * ("Start r…" in a narrow split pane): the full label if it fits where the
 * row wants to be, else the short label there; only when neither fits does
 * the row move below the cover (the full hero width) — a small adjustment
 * rather than truncation. Label widths are the text's natural single-line
 * widths as rendered (font scale included); until measured, the width-budget
 * rule above decides and the row stays put.
 */
export function getMobileMangaDetailActionPresentation({
  label,
  compactLabel,
  labelWidth,
  compactLabelWidth,
  requestedPlacement,
  copyButtonWidth,
  belowButtonWidth,
  wrap,
  fontScale,
}: {
  label: string;
  compactLabel?: string;
  /** Measured natural width of `label` (0 / undefined = not yet measured). */
  labelWidth?: number;
  compactLabelWidth?: number;
  /** Placement the hero layout asks for (large text already forces "below"). */
  requestedPlacement: "copy" | "below";
  /** Pill width when the row sits in the copy column. */
  copyButtonWidth: number;
  /** Pill width when the row sits below the cover. */
  belowButtonWidth: number;
  /** Large text: the label wraps freely anyway. */
  wrap: boolean;
  fontScale: number;
}): MobileMangaDetailActionPresentation {
  const requestedWidth = requestedPlacement === "copy" ? copyButtonWidth : belowButtonWidth;
  const measured = (width: number | undefined) => typeof width === "number" && Number.isFinite(width) && width > 0;
  if (wrap) {
    return {
      placement: requestedPlacement,
      label: getMobileMangaDetailActionLabel({ label, compactLabel, buttonWidth: requestedWidth, fontScale }),
      lines: undefined,
    };
  }
  if (!measured(labelWidth) || (compactLabel && !measured(compactLabelWidth))) {
    return {
      placement: requestedPlacement,
      label: getMobileMangaDetailActionLabel({ label, compactLabel, buttonWidth: requestedWidth, fontScale }),
      lines: 1,
    };
  }
  const fits = (textWidth: number, buttonWidth: number) =>
    buttonWidth > 0 && textWidth + LABEL_FIT_SLACK <= getMobileMangaDetailActionTextBudget(buttonWidth);
  const placements: ("copy" | "below")[] = requestedPlacement === "copy" ? ["copy", "below"] : ["below"];
  for (const placement of placements) {
    const buttonWidth = placement === "copy" ? copyButtonWidth : belowButtonWidth;
    if (fits(labelWidth!, buttonWidth)) return { placement, label, lines: 1 };
    if (compactLabel && fits(compactLabelWidth!, buttonWidth)) return { placement, label: compactLabel, lines: 1 };
  }
  // Nothing fits on one line even below the cover (an extreme width): wrap.
  return { placement: "below", label: compactLabel ?? label, lines: undefined };
}
