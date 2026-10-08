import { MOBILE_CONTINUE_TALL_CARD, type MobileContinueCardVariant } from "./mobileContinueCardGeometry";

/**
 * The tall Continue card's text, footer and button under its cover window at
 * rest (measured on the Air: a 252 pt card is 466 pt tall, its window 232).
 */
export const MOBILE_EXPLORE_SKELETON_TALL_TEXT = 234;
/** A wide card (landscape, a closed Duo) is about half as tall as it is wide. */
export const MOBILE_EXPLORE_SKELETON_WIDE_ASPECT = 0.5;

/** The Library skeleton's card height for a card `cardWidth` wide, so the real card lands where it stood. */
export function getMobileExploreSkeletonCardHeight(cardWidth: number, variant: MobileContinueCardVariant): number {
  if (!(cardWidth > 0)) return 0;
  return variant === "tall"
    ? Math.round(cardWidth * MOBILE_CONTINUE_TALL_CARD.artAspect) + MOBILE_EXPLORE_SKELETON_TALL_TEXT
    : Math.round(cardWidth * MOBILE_EXPLORE_SKELETON_WIDE_ASPECT);
}
