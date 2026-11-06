import { getMobileContinueCardGeometry, getMobileContinueCardVariant } from "./mobileContinueCardGeometry";

export const MOBILE_SOURCE_FEATURED_GAP = 12;

/** Keep the source and library carousels' alignment consistent as the window resizes. */
export function getMobileSourceFeaturedGeometry(input: {
  frameWidth: number;
  gutterLeft: number;
  gutterRight: number;
  windowWidth: number;
  windowHeight: number;
  /**
   * The part of the frame under the system's vertical bar. The row scrolls on
   * under it, but a card (whose height follows its width) is sized without it,
   * so running under the bar leaves the page's vertical layout alone.
   */
  barInset?: number;
}) {
  const { gutterLeft, gutterRight, windowWidth, windowHeight, barInset = 0 } = input;
  const frameWidth = input.frameWidth - barInset;
  const content = Math.max(0, frameWidth - gutterLeft - gutterRight);
  const variant = getMobileContinueCardVariant("tall", windowHeight, windowWidth);
  const library = getMobileContinueCardGeometry({ ...input, frameWidth, variant });
  const centred = variant === "tall" && library.columns === 1;
  const regular = content >= 680;
  const cardWidth = Math.max(0, Math.min(content, regular ? 420 : centred ? frameWidth - 56 : frameWidth - gutterLeft - 28, 560));
  const paddingLeft = centred ? gutterLeft + (content - cardWidth) / 2 : gutterLeft;
  // Enough trailing space for the last card to reach the same snap as every other card.
  const paddingRight = Math.max(gutterRight, input.frameWidth - paddingLeft - cardWidth);
  return { cardWidth, paddingLeft, paddingRight, interval: cardWidth + MOBILE_SOURCE_FEATURED_GAP, regular, centred };
}
