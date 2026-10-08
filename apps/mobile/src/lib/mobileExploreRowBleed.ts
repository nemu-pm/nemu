import type { MobilePageBleedStyles } from "@/lib/mobilePageGutters";

export type MobileExploreRowBleed = MobilePageBleedStyles & {
  /**
   * The row must clip what scrolls past its frame: one of its sides is the
   * system's vertical bar column, and nothing may slide under the clock, the
   * toolbar or the tab bar there.
   */
  clips: boolean;
};

/** Clean air between a row's clipped edge and the vertical bar's column (the clock, the "+" and the tabs). */
export const MOBILE_EXPLORE_BAR_SIDE_GAP = 16;

/**
 * Edge-bleed for the design-explore rows (continue-reading cards, collection
 * folders) from the page's bleed styles. Away from a vertical bar it is the
 * page's own bleed: the row runs to the screen edge and its first item rests
 * on the page gutter. On the bar's side the bar keeps its own clean column:
 * the row's frame ends `MOBILE_EXPLORE_BAR_SIDE_GAP` short of it and clips
 * there, so a peeking card never crowds the controls in that column.
 */
export function getMobileExploreRowBleed(
  bleed: MobilePageBleedStyles,
  verticalBarSide: "left" | "right" | null,
): MobileExploreRowBleed {
  if (!verticalBarSide) return { ...bleed, clips: false };
  const gap = MOBILE_EXPLORE_BAR_SIDE_GAP;
  const left = verticalBarSide === "left";
  return {
    frame: {
      marginLeft: left ? gap : bleed.frame.marginLeft,
      marginRight: left ? bleed.frame.marginRight : gap,
    },
    content: {
      paddingLeft: left ? 0 : bleed.content.paddingLeft,
      paddingRight: left ? bleed.content.paddingRight : 0,
    },
    clips: true,
  };
}
