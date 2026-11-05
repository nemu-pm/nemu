import type { MobileMeasuredRow } from "@/lib/mobileMeasuredRowLayout";

/** The row at the top of a list's visible area, and how far into it the top is (pt). */
export type MobileListRowAnchor = { index: number; delta: number };

/**
 * The row a list keeps at its top through a change of its geometry (a
 * rotation, a fold, the hero moving between the list and its own column).
 * `visibleTop` is the content y at the top of the visible area (the offset
 * plus the bar's inset). None while the list's header still shows above the
 * first row: a page at (or near) its top stays at its top.
 */
export function mobileListRowAnchor(
  rows: readonly MobileMeasuredRow[],
  visibleTop: number,
): MobileListRowAnchor | null {
  if (!Number.isFinite(visibleTop) || rows.length === 0) return null;
  const sorted = [...rows].sort((left, right) => left.index - right.index);
  const first = sorted[0]!;
  if (first.index === 0 && visibleTop < first.y) return null;
  for (const row of sorted) {
    if (row.y + row.height > visibleTop) {
      return { index: row.index, delta: Math.max(0, visibleTop - row.y) };
    }
  }
  return null;
}

/**
 * The content offset that puts `anchor` back at the top of the visible area,
 * given the anchor row's new frame and the list's top inset.
 */
export function mobileListRowAnchorOffset(
  anchor: MobileListRowAnchor,
  row: Pick<MobileMeasuredRow, "y" | "height">,
  insetTop: number,
): number {
  const delta = Math.min(anchor.delta, Math.max(0, row.height - 1));
  return row.y + delta - (Number.isFinite(insetTop) ? insetTop : 0);
}
