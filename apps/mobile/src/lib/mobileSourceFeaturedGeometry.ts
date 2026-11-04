import { getMobileContinueCardGeometry, getMobileContinueCardVariant } from "./mobileContinueCardGeometry";

export const MOBILE_SOURCE_FEATURED_GAP = 12;

/** Keep the source and library carousels' alignment consistent as the window resizes. */
export function getMobileSourceFeaturedGeometry(input: {
  frameWidth: number;
  gutterLeft: number;
  gutterRight: number;
  windowWidth: number;
  windowHeight: number;
}) {
  const { frameWidth, gutterLeft, gutterRight, windowWidth, windowHeight } = input;
  const content = Math.max(0, frameWidth - gutterLeft - gutterRight);
  const variant = getMobileContinueCardVariant("tall", windowHeight, windowWidth);
  const library = getMobileContinueCardGeometry({ ...input, variant });
  const centred = variant === "tall" && library.columns === 1;
  const regular = content >= 680;
  const cardWidth = Math.max(0, Math.min(content, regular ? 420 : centred ? frameWidth - 56 : frameWidth - gutterLeft - 28, 560));
  const paddingLeft = centred ? gutterLeft + (content - cardWidth) / 2 : gutterLeft;
  // Enough trailing space for the last card to reach the same snap as every other card.
  const paddingRight = Math.max(gutterRight, frameWidth - paddingLeft - cardWidth);
  return { cardWidth, paddingLeft, paddingRight, interval: cardWidth + MOBILE_SOURCE_FEATURED_GAP, regular, centred };
}
