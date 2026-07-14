export const MOBILE_MANGA_GRID_GAP = 12;

const MOBILE_MANGA_GRID_MIN_ITEM_WIDTH = 104;
const MOBILE_MANGA_GRID_MAX_COLUMNS = 4;

/**
 * Adaptive column count for a manga grid, derived from the available content
 * width. Clamped to [2, MOBILE_MANGA_GRID_MAX_COLUMNS]. Kept in sync with
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