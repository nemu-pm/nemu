import type { MobileContainerFoldSplit, MobileWindowPosture } from "@/lib/mobileAdaptiveLayout";
import { isMobileCompactHeight } from "@/lib/mobileExploreRestingFit";
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
  windowHeight,
  gutters,
}: {
  containerWidth: number;
  windowHeight: number;
  gutters: { left: number; right: number };
}): boolean {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) return false;
  if (isMobileCompactHeight(windowHeight)) return false;
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
  windowHeight,
  gutters,
  posture,
  foldSplit,
}: {
  containerWidth: number;
  windowHeight: number;
  gutters: { left: number; right: number };
  posture: MobileWindowPosture;
  /** `mobileFoldSplitForContainer` for the measured container, or null. */
  foldSplit: MobileContainerFoldSplit | null;
}): MobileSplitPaneLayout {
  if (posture === "notebook") return { mode: "single" };
  if (!mobileDetailUsesColumns({ containerWidth, windowHeight, gutters })) return { mode: "single" };
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
