export const MOBILE_MANGA_GRID_GAP = 12;

/**
 * Narrowest cover the grid packs down to. A portrait iPhone (375–440pt wide,
 * 16pt gutters) lands on three ~106–128pt covers; wider layouts add columns at
 * the same cover size instead of blowing three or four covers up to 200pt+,
 * so a landscape phone shows more titles per row, not bigger ones.
 */
const MOBILE_MANGA_GRID_MIN_ITEM_WIDTH = 104;
/** Keeps a 13" iPad in landscape at ~120pt covers rather than 11+ columns. */
const MOBILE_MANGA_GRID_MAX_COLUMNS = 10;

/**
 * Adaptive column count for a manga grid, derived from the available content
 * width. `horizontalPadding` is everything the content loses to its page
 * gutters — pass `useMobilePageGutters().horizontal` so a landscape iPhone's
 * safe-area insets are excluded. Clamped to [2, MOBILE_MANGA_GRID_MAX_COLUMNS].
 * Kept in sync with
 * {@link getMobileMangaGridItemWidth} — both use the same floor rule — so a
 * `FlatList numColumns={getMobileMangaGridColumns(...)}` layout matches the
 * legacy `flexWrap` grid's column count exactly.
 */
export function getMobileMangaGridColumns({
  windowWidth,
  horizontalPadding,
}: {
  windowWidth: number;
  horizontalPadding: number;
}): number {
  const contentWidth = Math.max(0, windowWidth - horizontalPadding);
  return Math.max(
    2,
    Math.min(
      MOBILE_MANGA_GRID_MAX_COLUMNS,
      Math.floor(
        (contentWidth + MOBILE_MANGA_GRID_GAP) /
          (MOBILE_MANGA_GRID_MIN_ITEM_WIDTH + MOBILE_MANGA_GRID_GAP),
      ),
    ),
  );
}

export function getMobileMangaGridItemWidth({
  windowWidth,
  horizontalPadding,
}: {
  windowWidth: number;
  horizontalPadding: number;
}): number {
  const contentWidth = Math.max(0, windowWidth - horizontalPadding);
  const columns = getMobileMangaGridColumns({ windowWidth, horizontalPadding });

  return Math.floor(
    (contentWidth - MOBILE_MANGA_GRID_GAP * (columns - 1)) / columns,
  );
}
/**
 * Geometry for a loading skeleton that stands in for an adaptive manga grid:
 * the same column count and card width as the loaded grid (so the hand-off
 * never reflows), and enough cards to fill `rows` full rows. Pass the page
 * scaffold's safe-area-aware gutters as `horizontalPadding`.
 */
export function getMobileMangaGridSkeletonGeometry({
  windowWidth,
  horizontalPadding,
  rows,
}: {
  windowWidth: number;
  horizontalPadding: number;
  rows: number;
}): { cardCount: number; cardWidth: number; columnCount: number } {
  const columnCount = getMobileMangaGridColumns({
    windowWidth,
    horizontalPadding,
  });
  return {
    cardCount: columnCount * Math.max(1, Math.floor(rows)),
    cardWidth: getMobileMangaGridItemWidth({ windowWidth, horizontalPadding }),
    columnCount,
  };
}

export type MobileMangaGridLayout = {
  columns: number;
  /** Fixed width of every cell, including a partly filled last row. */
  itemWidth: number;
};

/**
 * Column count plus the fixed cell width for a virtualized manga grid
 * (`FlatList numColumns`). Every grid (source browse, search, library) sizes
 * its cells with `itemWidth` instead of `flex: 1`: with flex, a last row
 * holding fewer items than `columns` stretched its cells across the whole row,
 * so a lone final cover rendered two or three times wider than the rest.
 */
export function getMobileMangaGridLayout({
  windowWidth,
  horizontalPadding,
}: {
  windowWidth: number;
  horizontalPadding: number;
}): MobileMangaGridLayout {
  return {
    columns: getMobileMangaGridColumns({ windowWidth, horizontalPadding }),
    itemWidth: getMobileMangaGridItemWidth({ windowWidth, horizontalPadding }),
  };
}

/**
 * Widths of the cells in each row of a `count`-item grid laid out with
 * {@link getMobileMangaGridLayout}. Pure mirror of how the cells render, used
 * to pin the "partial last row keeps the column width" contract in tests.
 */
export function getMobileMangaGridRowWidths(
  layout: MobileMangaGridLayout,
  count: number,
): number[][] {
  const rows: number[][] = [];
  for (let index = 0; index < count; index += layout.columns) {
    const cells = Math.min(layout.columns, count - index);
    rows.push(Array.from({ length: cells }, () => layout.itemWidth));
  }
  return rows;
}
