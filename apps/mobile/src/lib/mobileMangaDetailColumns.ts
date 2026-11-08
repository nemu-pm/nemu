import type { MobileContainerFoldSplit, MobileWindowPosture } from "@/lib/mobileAdaptiveLayout";
import {
  getMobileSplitPaneLayout,
  type MobileSplitPaneLayout,
  type MobileSplitPaneOptions,
} from "@/lib/mobileSplitPaneLayout";

/**
 * Manga detail in two columns on wide windows (new design): the hero (cover,
 * title, facts, actions, synopsis, genres) holds still in a leading column
 * while the chapters scroll beside it, the cover's colour behind both.
 *
 * The rule is the room the page has, never the device: the window's content
 * width (less the page gutters, which carry a vertical system bar and the
 * landscape safe areas) and a regular height. So the Duo's inner display in
 * landscape and tablets in either orientation get the columns, and the Duo's
 * inner portrait, a tablet in a narrow Split View or Slide Over, the Duo's
 * outer display and phones (portrait or landscape) keep the one-list page.
 * Partially folded as a book, the columns are the two halves; folded like a
 * laptop (a horizontal fold) the page keeps one list, as two columns would
 * each straddle the fold.
 */
export const MOBILE_DETAIL_COLUMNS_MIN_CONTENT_WIDTH = 760;

/** The hero column: its share of the content width, clamped. */
export const MOBILE_DETAIL_COLUMNS = {
  leadingFraction: 0.44,
  minLeading: 340,
  maxLeading: 480,
  /** Below this the chapter column is too cramped for its header row. */
  minTrailing: 360,
} as const;

/** Book posture: the fold halves, each wide enough for its column. */
const FOLD_OPTIONS: MobileSplitPaneOptions = {
  leadingFraction: MOBILE_DETAIL_COLUMNS.leadingFraction,
  minLeading: MOBILE_DETAIL_COLUMNS.minLeading,
  maxLeading: MOBILE_DETAIL_COLUMNS.maxLeading,
  minTrailing: MOBILE_DETAIL_COLUMNS.minTrailing,
  minFoldPane: 300,
};

/** Whether a window this size lays the detail page out in two columns. */
export function mobileDetailUsesColumns({
  containerWidth,
  compactHeight,
  gutters,
}: {
  containerWidth: number;
  /** The window's compact height (`MobileAdaptiveLayout.compactHeight`). */
  compactHeight: boolean;
  gutters: { left: number; right: number };
}): boolean {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) return false;
  if (compactHeight) return false;
  return containerWidth - gutters.left - gutters.right >= MOBILE_DETAIL_COLUMNS_MIN_CONTENT_WIDTH;
}

/**
 * The two columns' frames in the container, or `single`. Flat, the hero
 * column takes its share of the content width plus the leading gutter (so a
 * vertical bar on the leading edge does not eat into it); the chapter column
 * takes the rest, its trailing gutter included.
 */
export function getMobileDetailColumnsLayout({
  containerWidth,
  compactHeight,
  gutters,
  posture,
  foldSplit,
}: {
  containerWidth: number;
  compactHeight: boolean;
  gutters: { left: number; right: number };
  posture: MobileWindowPosture;
  /** `mobileFoldSplitForContainer` for the measured container, or null. */
  foldSplit: MobileContainerFoldSplit | null;
}): MobileSplitPaneLayout {
  if (posture === "notebook") return { mode: "single" };
  if (!mobileDetailUsesColumns({ containerWidth, compactHeight, gutters })) return { mode: "single" };
  if (posture === "book" && foldSplit?.axis === "horizontal") {
    const halves = getMobileSplitPaneLayout({
      containerWidth,
      regularWidth: true,
      posture,
      foldSplit,
      options: FOLD_OPTIONS,
    });
    if (halves.mode === "split" && halves.alignment === "fold") return halves;
  }
  const c = MOBILE_DETAIL_COLUMNS;
  const contentWidth = containerWidth - gutters.left - gutters.right;
  const leadingContent = Math.round(Math.min(c.maxLeading, Math.max(c.minLeading, contentWidth * c.leadingFraction)));
  const leadingWidth = gutters.left + leadingContent;
  const trailingWidth = containerWidth - leadingWidth;
  if (trailingWidth - gutters.right < c.minTrailing) return { mode: "single" };
  return {
    mode: "split",
    alignment: "flat",
    leading: { x: 0, width: leadingWidth },
    trailing: { x: leadingWidth, width: trailingWidth },
    gutter: 0,
  };
}

/** The bar row iPad reserves for the tab strip above a pushed page but draws on the title's line. */
export const MOBILE_DETAIL_IPAD_BAR_ROW_PULL = -44;

/**
 * How far the detail panes pull up under an iPad's bar. On a tab's own stack
 * the system reserves the tab strip and the title as two rows though both draw
 * on one line, so the panes take back the unused row. A page pushed over the
 * tabs (the source title page, on the root stack) has no tab strip: its single
 * row is all drawn, and pulling would lift the chapters' header into the bar
 * beside its buttons. The info-pane split pulls wherever it shows; the
 * columns and the wide header only where the two rows are laid out (regular
 * width and height with no fold region: bars on top, not at the side).
 */
export function getMobileDetailBarRowPull({
  tabStrip,
  barOnSide,
  infoPaneSplit,
  columnsOrWideHeader,
  regularWidth,
  hasFoldRegion,
  compactHeight,
}: {
  /** The page sits under the tab strip (a tab's stack, not the root stack). */
  tabStrip: boolean;
  /** The system's bars are vertical (the Duo's rail): nothing above the page. */
  barOnSide: boolean;
  /** The old design's info pane beside the chapters. */
  infoPaneSplit: boolean;
  /** The explore design's two columns or its one wide header. */
  columnsOrWideHeader: boolean;
  regularWidth: boolean;
  hasFoldRegion: boolean;
  compactHeight: boolean;
}): number {
  if (!tabStrip || barOnSide) return 0;
  const doubleBarRow = regularWidth && !hasFoldRegion && !compactHeight;
  return infoPaneSplit || (columnsOrWideHeader && doubleBarRow) ? MOBILE_DETAIL_IPAD_BAR_ROW_PULL : 0;
}
