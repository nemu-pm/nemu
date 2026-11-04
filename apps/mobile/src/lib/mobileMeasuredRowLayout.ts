/**
 * `getItemLayout` for a list whose rows come in a few fixed heights (a
 * chapter row, a row under a volume header), built from rows the list has
 * actually laid out. It exists only while it is exact: every kind of row in
 * the data has a measured height, and every row on screen sits exactly where
 * it predicts. Anything else (a kind not measured yet, a row taller than its
 * kind, the header above the rows changing height) gives null, and the list
 * measures as usual.
 */

/** A row the list has laid out: its frame in the list's content. */
export type MobileMeasuredRow = { index: number; y: number; height: number };

export type MobileMeasuredRowLayout = {
  /** Where each row starts in the list's content (the header above included). */
  offsets: readonly number[];
  lengths: readonly number[];
};

/** Layout rounding: rows snap to the pixel grid, never more than a pixel off. */
const MEASURED_ROW_TOLERANCE = 0.5;

export function resolveMobileMeasuredRowLayout(
  kinds: readonly string[],
  rows: readonly MobileMeasuredRow[],
  kindHeights: ReadonlyMap<string, number>,
): MobileMeasuredRowLayout | null {
  if (!kinds.length || !rows.length) return null;
  const lengths: number[] = [];
  const starts: number[] = [];
  let start = 0;
  for (const kind of kinds) {
    const height = kindHeights.get(kind);
    if (height === undefined) return null;
    starts.push(start);
    lengths.push(height);
    start += height;
  }
  // The rows start below the list's header: wherever the first laid-out row
  // says they do.
  const anchor = rows[0];
  if (anchor.index >= kinds.length) return null;
  const top = anchor.y - starts[anchor.index];
  for (const row of rows) {
    if (row.index >= kinds.length) return null;
    if (Math.abs(row.y - (top + starts[row.index])) > MEASURED_ROW_TOLERANCE) return null;
    if (Math.abs(row.height - lengths[row.index]) > MEASURED_ROW_TOLERANCE) return null;
  }
  return { offsets: starts.map((value) => top + value), lengths };
}
