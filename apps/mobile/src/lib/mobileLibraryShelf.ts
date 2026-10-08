/**
 * Bookshelf layout math: floating wall shelves. Every row of the fold-aware
 * grid stands on one thin plank; a fold gutter breaks the plank so each pane
 * gets its own. The list stays a virtualised FlatList, so the first cell of a
 * row draws that row's plank(s).
 */
type MobileShelfGridLayout = {
  columns: number;
  itemWidth: number;
  /** Leading margin of every column (the gap before it; fold gutter included). */
  columnMargins: readonly number[];
};

export type MobileShelfRow = {
  /** Left edge of the row's shelf in the first cell's coordinates. */
  left: number;
  width: number;
  /** Fold gutters inside the row (x relative to `left`): the plank breaks there. */
  dividers: Array<{ x: number; width: number }>;
};

/**
 * The shelf under one row, drawn by the row's first cell. Every row spans all
 * columns (an unfilled last row stays empty shelf). A column margin wider than
 * `gap` is a fold gutter; `overhang` is how far the plank runs past the outer
 * covers.
 */
export function getMobileShelfRow(
  layout: MobileShelfGridLayout,
  gap: number,
  overhang: number,
): MobileShelfRow {
  const columns = Math.max(1, layout.columns);
  let x = overhang;
  const dividers: MobileShelfRow["dividers"] = [];
  for (let column = 0; column < columns; column += 1) {
    const margin = column === 0 ? 0 : (layout.columnMargins[column] ?? 0);
    if (margin > gap + 0.5) dividers.push({ x, width: margin });
    x += margin + layout.itemWidth;
  }
  return { left: overhang ? -overhang : 0, width: x + overhang, dividers };
}

/** Plank segments of a row (row coordinates): one per pane. */
export function getMobileShelfPlankSegments(
  slice: Pick<MobileShelfRow, "width" | "dividers">,
): Array<{ x: number; width: number }> {
  const segments: Array<{ x: number; width: number }> = [];
  let start = 0;
  for (const divider of slice.dividers) {
    segments.push({ x: start, width: divider.x - start });
    start = divider.x + divider.width;
  }
  segments.push({ x: start, width: slice.width - start });
  return segments.filter((segment) => segment.width > 0);
}

/** Small stable per-title value in [-1, 1] (a cover's natural lean). */
/** Shelf geometry (points). */
export const MOBILE_SHELF = {
  /** Air above the covers (room for the new-chapters tag). */
  headroom: 16,
  /** Plank: lighter top face + darker front face. */
  plankTop: 2,
  plankFront: 4,
  /** How far a plank runs past the outer covers (it stops short of the screen edge). */
  overhang: 8,
  /** Most of a leaning book's side that shows beside its cover. */
  coverEdge: 1.5,
  /** Air between a plank and the headroom of the shelf below. */
  rowGap: 28,
} as const;
