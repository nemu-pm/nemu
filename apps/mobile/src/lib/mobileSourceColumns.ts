import { mobileFoldIntervalWithGutter, type MobileFoldInterval } from "./mobileFoldAwareGrid";

/**
 * Sources tab (design-explore) on wide and folding windows. Only half open
 * (book posture: an active vertical fold across the list, the Duo's inner
 * display in landscape) do the language groups flow into two columns, one a
 * pane (content edge to the fold), each group whole in one column. Fully
 * open the display is one whole screen (designer rule, landscape or
 * portrait): a window with a fold region keeps one column capped at a
 * readable width (560pt), centred on the whole screen — nothing splits at
 * the hinge. Everything else is one full-width column, as before.
 */

/** Readable width of the single column on the Duo inner display fully open (and any fold-region window). */
export const MOBILE_SOURCE_COLUMN_MAX_WIDTH = 560;
/** Narrowest pane column worth splitting for. */
export const MOBILE_SOURCE_COLUMN_MIN_WIDTH = 280;
/** Vertical gap between groups in a column (`availableList` gap). */
export const MOBILE_SOURCE_GROUP_GAP = 18;

export type MobileSourceColumn = {
  /** Container-local leading edge. */
  x: number;
  width: number;
  /** Margin from the previous column's trailing edge (column 0: from the container's edge). */
  marginLeft: number;
};

export function getMobileSourceColumns({
  contentWidth,
  fold,
  band,
  foldRegion,
  maxSingleWidth = MOBILE_SOURCE_COLUMN_MAX_WIDTH,
  minColumnWidth = MOBILE_SOURCE_COLUMN_MIN_WIDTH,
}: {
  /** The list container's width (inside the page gutters). */
  contentWidth: number;
  /** The active vertical fold across the container (half open), container-local. */
  fold: MobileFoldInterval | null | undefined;
  /**
   * The vertical fold band across the container (`useMobileRestingVerticalFold`):
   * the window has a vertical hinge at all. Required for the half-open split;
   * on its own (fully open) it splits nothing.
   */
  band: MobileFoldInterval | null | undefined;
  /** The window has a fold region at all (caps the single column). */
  foldRegion: boolean;
  maxSingleWidth?: number;
  minColumnWidth?: number;
}): MobileSourceColumn[] {
  const width = Math.max(0, contentWidth);
  const gutter = band ? mobileFoldIntervalWithGutter(fold) : null;
  if (gutter) {
    const leading = Math.floor(gutter.start);
    const trailingStart = Math.ceil(gutter.end);
    const trailing = width - trailingStart;
    if (leading >= minColumnWidth && trailing >= minColumnWidth) {
      return [
        { x: 0, width: leading, marginLeft: 0 },
        { x: trailingStart, width: trailing, marginLeft: trailingStart - leading },
      ];
    }
  }
  const single = foldRegion ? Math.min(width, maxSingleWidth) : width;
  const x = (width - single) / 2;
  return [{ x, width: single, marginLeft: x }];
}

/**
 * Height of a language group for balancing the columns: its header and its
 * rows. An estimate from the row count (the compact row's 60pt minimum, an
 * unsupported source's 84pt card), never a measurement, so a group's column
 * cannot change because it was measured in another one.
 */
export function estimateMobileSourceGroupHeight({
  rows,
  unsupportedRows = 0,
  headerHeight = 14 + 8,
  rowHeight = 60,
  unsupportedRowHeight = 84,
}: {
  rows: number;
  unsupportedRows?: number;
  headerHeight?: number;
  rowHeight?: number;
  unsupportedRowHeight?: number;
}): number {
  const supported = Math.max(0, rows - unsupportedRows);
  return headerHeight + supported * rowHeight + Math.max(0, unsupportedRows) * unsupportedRowHeight;
}

/**
 * Column index of every group, in order: each next group goes into the
 * shorter column (ties to the leading one), so the first group (the
 * library's or the user's servers) always opens the leading column.
 */
export function partitionMobileSourceGroups(
  heights: readonly number[],
  columns: number,
  gap = MOBILE_SOURCE_GROUP_GAP,
): number[] {
  const count = Math.max(1, Math.floor(columns));
  const filled = Array.from({ length: count }, () => 0);
  const used = Array.from({ length: count }, () => false);
  return heights.map((height) => {
    let target = 0;
    for (let column = 1; column < count; column += 1) {
      if (filled[column] < filled[target] - 0.5) target = column;
    }
    filled[target] += (used[target] ? gap : 0) + Math.max(0, height);
    used[target] = true;
    return target;
  });
}
