// eslint-disable-next-line no-restricted-imports -- pure helper imported by `@/design/useMobilePageGutters` (and so by the design-system barrel); importing the barrel here would be a cycle and would break bun tests.
import { spacing } from "@/design/tokens";

export type MobilePageGutters = {
  /** Leading content inset: the page gutter, or the safe-area inset when wider. */
  left: number;
  /** Trailing content inset: the page gutter, or the safe-area inset when wider. */
  right: number;
  /** `left + right`, the width a page's content loses to its gutters. */
  horizontal: number;
};

function finiteInset(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, value)
    : 0;
}

/**
 * Horizontal content insets for a page, at least the native navigation
 * title's system minimum margin when available. Without native margins or
 * horizontal safe areas, use `spacing.pageX`; a landscape
 * iPhone reports ~60pt on both sides for the Dynamic Island / sensor housing
 * and rounded corners, and page content must start past it rather than 16pt
 * from the glass edge. The gutter is not added on top of the inset: the
 * safe-area inset already includes breathing room past the cutout.
 */
export function getMobilePageGutters(
  insets: { left?: number; right?: number },
  gutter: number = spacing.pageX,
  minimumLayoutMargins?: { left: number; right: number },
): MobilePageGutters {
  const safeGutter = finiteInset(gutter);
  const left = Math.max(safeGutter, finiteInset(insets.left), finiteInset(minimumLayoutMargins?.left));
  const right = Math.max(safeGutter, finiteInset(insets.right), finiteInset(minimumLayoutMargins?.right));
  return { left, right, horizontal: left + right };
}

export type MobilePageBleedStyles = {
  /** Pulls a row out past the page gutters to the screen edges. */
  frame: { marginLeft: number; marginRight: number };
  /** Pays the gutters back inside the row so its first item aligns with the page. */
  content: { paddingLeft: number; paddingRight: number };
};

/**
 * Styles for a horizontally scrolling row that bleeds to the screen edges
 * (chip rails, shelves) while its resting content lines up with the page
 * gutters. `overscan` extends the bleed a few points past the edge on rows
 * that were tuned that way, without moving their content.
 */
export function getMobilePageBleedStyles(
  gutters: Pick<MobilePageGutters, "left" | "right">,
  overscan = 0,
  /**
   * The side where the system draws its vertical bar column (iPhone Duo outer
   * display / inner landscape). Rows never bleed into that column — it holds
   * the status bar, Dynamic Island and toolbar — they stop at the safe edge.
   */
  verticalBarSide: "left" | "right" | null = null,
): MobilePageBleedStyles {
  const left = verticalBarSide === "left" ? 0 : gutters.left + overscan;
  const right = verticalBarSide === "right" ? 0 : gutters.right + overscan;
  return {
    frame: { marginLeft: -left, marginRight: -right },
    content: {
      paddingLeft: verticalBarSide === "left" ? spacing.pageX / 2 : left,
      paddingRight: verticalBarSide === "right" ? spacing.pageX / 2 : right,
    },
  };
}

/** A horizontal row's resting clearance from the system bar column (iPhone Duo rail). */
export const MOBILE_RAIL_ROW_CLEARANCE = spacing.pageX;

/**
 * Content insets for a horizontally scrolling row beside the system's
 * vertical bar column (the iPhone Duo rail): the row's frame stops at the
 * page gutter on that side (`getMobilePageBleedStyles`), and its content
 * inset there is whatever keeps the last chip (rail on the right) or the
 * first chip (rail on the left) `clearance` before the rail's content edge —
 * the edge the window's safe-area inset reports, measured from the real
 * inset, not a constant. Null when there is no rail; the side away from the
 * rail is not touched.
 */
export function getMobileRailRowContentInsets({
  gutters,
  safeAreaInsets,
  verticalBarSide,
  clearance = MOBILE_RAIL_ROW_CLEARANCE,
}: {
  /** The page gutters the row's frame sits in (`getMobilePageGutters`). */
  gutters: Pick<MobilePageGutters, "left" | "right">;
  /** The window's safe-area insets (they include the rail column). */
  safeAreaInsets: { left?: number; right?: number } | null | undefined;
  verticalBarSide: "left" | "right" | null;
  clearance?: number;
}): { paddingLeft: number } | { paddingRight: number } | null {
  if (verticalBarSide === null) return null;
  const gutter = finiteInset(verticalBarSide === "left" ? gutters.left : gutters.right);
  // No inset reported: the gutter is the rail's edge.
  const reported = verticalBarSide === "left" ? safeAreaInsets?.left : safeAreaInsets?.right;
  const railInset = typeof reported === "number" && Number.isFinite(reported) ? Math.max(0, reported) : gutter;
  // The frame already stops `gutter - railInset` short of the rail's content edge.
  const inset = Math.max(0, finiteInset(clearance) - Math.max(0, gutter - railInset));
  return verticalBarSide === "left" ? { paddingLeft: inset } : { paddingRight: inset };
}
