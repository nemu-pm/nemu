import { mobileFoldIntervalWithGutter, type MobileFoldInterval } from "./mobileFoldAwareGrid";

/**
 * Sources tab (design-explore) on wide and folding windows: across the Duo's
 * vertical hinge (the inner display in landscape) language groups flow into
 * two columns, each group whole in one column. Half open each column is
 * aligned to its pane (content edge to the fold); fully open they are the
 * content's two halves with the ordinary 12pt gap — the hinge reserves
 * nothing flat. The same two columns hold the same groups in both postures,
 * so folding only slides them. A window with a fold region but no vertical
 * fold (the inner display in portrait) keeps one column capped at a readable
 * width, centred. Everything else is one full-width column, as before.
 */

/** Readable width of the single column on the Duo inner display in portrait. */
export const MOBILE_SOURCE_COLUMN_MAX_WIDTH = 560;
/** Narrowest pane column worth splitting for. */
export const MOBILE_SOURCE_COLUMN_MIN_WIDTH = 280;
/** Vertical gap between groups in a column (`availableList` gap). */
export const MOBILE_SOURCE_GROUP_GAP = 18;
/** Gap between the two columns fully open. */
export const MOBILE_SOURCE_COLUMN_GAP = 12;

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
  gap = MOBILE_SOURCE_COLUMN_GAP,
  maxSingleWidth = MOBILE_SOURCE_COLUMN_MAX_WIDTH,
  minColumnWidth = MOBILE_SOURCE_COLUMN_MIN_WIDTH,
}: {
  /** The list container's width (inside the page gutters). */
  contentWidth: number;
  /** The active vertical fold across the container (half open), container-local. */
  fold: MobileFoldInterval | null | undefined;
  /**
   * The vertical fold band across the container, folded or fully open
   * (`useMobileRestingVerticalFold`): the window splits into panes at all.
   */
  band: MobileFoldInterval | null | undefined;
  /** The window has a fold region at all (caps the single column). */
  foldRegion: boolean;
  gap?: number;
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
  if (band && Number.isFinite(band.start) && Number.isFinite(band.end)) {
    const half = (width - gap) / 2;
    if (half >= minColumnWidth) {
      return [
        { x: 0, width: half, marginLeft: 0 },
        { x: half + gap, width: half, marginLeft: gap },
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
