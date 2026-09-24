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
