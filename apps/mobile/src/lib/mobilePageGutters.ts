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
 * Horizontal content insets for a page. Portrait phones have no horizontal
 * safe area, so this is the plain `spacing.pageX` gutter there; a landscape
 * iPhone reports ~60pt on both sides for the Dynamic Island / sensor housing
 * and rounded corners, and page content must start past it rather than 16pt
 * from the glass edge. The gutter is not added on top of the inset: the
 * safe-area inset already includes breathing room past the cutout.
 */
export function getMobilePageGutters(
  insets: { left?: number; right?: number },
  gutter: number = spacing.pageX,
): MobilePageGutters {
  const safeGutter = finiteInset(gutter);
  const left = Math.max(safeGutter, finiteInset(insets.left));
  const right = Math.max(safeGutter, finiteInset(insets.right));
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
