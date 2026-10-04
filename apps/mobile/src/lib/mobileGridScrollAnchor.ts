/**
 * Scroll anchoring for virtualized grids across a window-size / fold change.
 *
 * A width change moves the column count (FlatList must remount for a new
 * `numColumns`) or the cell size (every row height changes), so a pixel
 * offset — or the proportion of the scroll range (`mobileGridScrollRestore`)
 * — lands on a different part of the list. The reader's eye was on the first
 * visible cover: keep *that item* at the top of the viewport instead.
 *
 * FlatList reports multi-column viewability per item (`index` is the item
 * index in `data`), while `scrollToIndex` addresses rows.
 */

export type MobileGridViewToken = { index?: number | null; isViewable: boolean };

/** First (lowest-index) viewable item, or null when nothing is reported. */
export function mobileGridFirstVisibleIndex(tokens: readonly MobileGridViewToken[]): number | null {
  let first: number | null = null;
  for (const token of tokens) {
    if (!token.isViewable || typeof token.index !== "number" || !Number.isFinite(token.index) || token.index < 0) continue;
    if (first === null || token.index < first) first = token.index;
  }
  return first;
}

/**
 * The row to bring to the top of the viewport after a layout change, or null
 * when no restore is needed (the anchor is in the first row: the list simply
 * stays at its top, including the header).
 */
export function mobileGridAnchorRestoreRow({
  anchorIndex,
  columns,
  itemCount,
}: {
  anchorIndex: number | null;
  columns: number;
  itemCount: number;
}): number | null {
  if (anchorIndex === null || !Number.isFinite(anchorIndex) || itemCount <= 0) return null;
  const cols = Math.max(1, Math.floor(columns));
  const index = Math.min(Math.max(0, Math.floor(anchorIndex)), itemCount - 1);
  const row = Math.floor(index / cols);
  return row > 0 ? row : null;
}

/** Layout identity of a grid: anything that moves rows when it changes. */
export function mobileGridAnchorLayoutKey({
  columns,
  itemWidth,
}: {
  columns: number;
  itemWidth: number;
}): string {
  return `${Math.max(1, Math.floor(columns))}:${Math.round(itemWidth)}`;
}

/**
 * Offset for the fallback when `scrollToIndex` cannot reach an unrendered row:
 * the list's average row length × row, then a precise retry once rendered.
 * `insetTop` is the scroll view's adjusted top content inset (iOS large title /
 * translucent bar), so the row lands below the bar rather than under it.
 */
export function mobileGridAnchorFallbackOffset({
  row,
  averageRowLength,
  insetTop = 0,
}: {
  row: number;
  averageRowLength: number;
  insetTop?: number;
}): number {
  if (!Number.isFinite(averageRowLength) || averageRowLength <= 0 || row <= 0) return -insetTop;
  return row * averageRowLength - insetTop;
}
