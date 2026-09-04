/**
 * Scroll restoration across a grid remount.
 *
 * `FlatList` throws when `numColumns` changes on a mounted list, so a rotation
 * (or any width change that moves the column count) has to remount the grid via
 * a new `key`. The remount resets the scroll offset to 0, which throws the
 * reader back to the top of a long listing page. Reading position is not
 * expressible in pixels across the remount — both the row count and the row
 * height change with the column count — so restore the *proportion* of the
 * scrollable range instead, which survives both.
 */

export type MobileGridScrollSnapshot = {
  offset: number;
  contentHeight: number;
  viewportHeight: number;
};

function scrollableRange({
  contentHeight,
  viewportHeight,
}: {
  contentHeight: number;
  viewportHeight: number;
}): number {
  return Math.max(0, contentHeight - viewportHeight);
}

/** The 0…1 position of a scroll offset inside its scrollable range. */
export function captureMobileGridScrollRatio(
  snapshot: MobileGridScrollSnapshot,
): number {
  const range = scrollableRange(snapshot);
  if (range <= 0) return 0;
  const ratio = snapshot.offset / range;
  if (!Number.isFinite(ratio)) return 0;
  return Math.min(1, Math.max(0, ratio));
}

/** The offset that puts a remounted grid back at `ratio` of its new range. */
export function resolveMobileGridScrollRestoreOffset({
  ratio,
  contentHeight,
  viewportHeight,
}: {
  ratio: number;
  contentHeight: number;
  viewportHeight: number;
}): number {
  if (!Number.isFinite(ratio) || ratio <= 0) return 0;
  const range = scrollableRange({ contentHeight, viewportHeight });
  if (range <= 0) return 0;
  return Math.min(1, Math.max(0, ratio)) * range;
}

/**
 * A restore is only worth performing once the remounted list has laid out
 * enough content to land somewhere meaningful; restoring against a one-screen
 * content height would just pin the grid to the top anyway.
 */
export function shouldRestoreMobileGridScroll({
  ratio,
  contentHeight,
  viewportHeight,
}: {
  ratio: number | null;
  contentHeight: number;
  viewportHeight: number;
}): boolean {
  if (ratio === null || ratio <= 0) return false;
  return scrollableRange({ contentHeight, viewportHeight }) > 0;
}
