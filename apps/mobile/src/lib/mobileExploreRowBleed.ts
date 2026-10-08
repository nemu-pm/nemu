import type { MobilePageBleedStyles } from "@/lib/mobilePageGutters";

export type MobileExploreRowBleed = MobilePageBleedStyles & {
  /**
   * The row must clip what scrolls past its frame: one of its sides is the
   * system's vertical bar column, and nothing may slide under the clock, the
   * toolbar or the tab bar there.
   */
  clips: boolean;
};

/** How far a row reaches into the vertical bar's column: room for a card's shadow to fade out, short of the bar's controls. */
export const MOBILE_EXPLORE_BAR_SIDE_REACH = 12;

/**
 * Edge-bleed for the design-explore rows (continue-reading cards, collection
 * folders) from the page's bleed styles. Away from a vertical bar it is the
 * page's own bleed: the row runs to the screen edge and its first item rests
 * on the page gutter. On the bar's side the row's items rest exactly on the
 * page's content edge (so a card lines up with its section title and a folder
 * with the shelf column below it), the frame reaches a few points further for
 * their shadows, and the row clips there instead of running under the bar.
 */
export function getMobileExploreRowBleed(
  bleed: MobilePageBleedStyles,
  verticalBarSide: "left" | "right" | null,
): MobileExploreRowBleed {
  if (!verticalBarSide) return { ...bleed, clips: false };
  const reach = MOBILE_EXPLORE_BAR_SIDE_REACH;
  const left = verticalBarSide === "left";
  return {
    frame: {
      marginLeft: left ? -reach : bleed.frame.marginLeft,
      marginRight: left ? bleed.frame.marginRight : -reach,
    },
    content: {
      paddingLeft: left ? reach : bleed.content.paddingLeft,
      paddingRight: left ? bleed.content.paddingRight : reach,
    },
    clips: true,
  };
}
