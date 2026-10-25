import { getMobileContinueCardGeometry, getMobileContinueCardVariant } from "./mobileContinueCardGeometry";
import { mobileFoldIntervalWithGutter, mobileFoldPagerLayout, type MobileFoldInterval } from "./mobileFoldAwareGrid";

export const MOBILE_SOURCE_FEATURED_GAP = 12;
/** Widest featured card on the Duo inner display (one per pane, or centred in portrait). */
export const MOBILE_SOURCE_FEATURED_FOLD_MAX_WIDTH = 380;
/** Narrowest pane card worth splitting for; below it the rail stays one wide card. */
const FOLD_MIN_CARD_WIDTH = 240;

/** Cover of a featured card: 150×225 on the wide card, 112×168 on the Duo's pane-sized card. */
export function getMobileSourceFeaturedCover(cardWidth: number, compact: boolean, pad = 12) {
  const coverWidth = compact
    ? Math.min(112, Math.round((cardWidth - pad * 2) * 0.34))
    : Math.min(150, Math.round((cardWidth - pad * 2) * 0.38));
  return { coverWidth, coverHeight: Math.round(coverWidth * 1.5) };
}

/**
 * Keep the source and library carousels' alignment consistent as the window resizes.
 *
 * Across a vertical fold (`fold`, frame-local; the Duo inner display in
 * landscape, book or fully open alike) one card rests in each pane, centred
 * in that pane's content (page gutter to fold edge), at most 380pt wide; the
 * pager steps one pane at a time (`interval` = distance between the panes'
 * centres), and the last two cards end one a pane. A window with a fold
 * region but no vertical fold (the inner display in portrait) centres one
 * 380pt card with its neighbours peeking. Everything else is unchanged.
 */
export function getMobileSourceFeaturedGeometry(input: {
  frameWidth: number;
  gutterLeft: number;
  gutterRight: number;
  windowWidth: number;
  windowHeight: number;
  /** The vertical fold band across the frame, frame-local (`useMobileRestingVerticalFold`). */
  fold?: MobileFoldInterval | null;
  /** The window has a fold region at all (`MobileAdaptiveLayout.hasFoldRegion`). */
  foldRegion?: boolean;
  /** Cards in the rail (the last two then rest one a pane). */
  count?: number;
}) {
  const { frameWidth, gutterLeft, gutterRight, windowWidth, windowHeight, fold = null, foldRegion = false, count = 0 } = input;
  const content = Math.max(0, frameWidth - gutterLeft - gutterRight);
  const pager = mobileFoldPagerLayout({ containerWidth: frameWidth, fold, minCardWidth: FOLD_MIN_CARD_WIDTH });
  const gutter = pager.foldAligned ? mobileFoldIntervalWithGutter(fold) : null;
  if (gutter) {
    const leading = { start: gutterLeft, end: gutter.start };
    const trailing = { start: gutter.end, end: frameWidth - gutterRight };
    const cardWidth = Math.max(
      0,
      Math.floor(
        Math.min(
          MOBILE_SOURCE_FEATURED_FOLD_MAX_WIDTH,
          leading.end - leading.start,
          trailing.end - trailing.start,
        ),
      ),
    );
    if (cardWidth >= FOLD_MIN_CARD_WIDTH) {
      const leadingCentre = (leading.start + leading.end) / 2;
      const trailingCentre = (trailing.start + trailing.end) / 2;
      const interval = trailingCentre - leadingCentre;
      const paddingLeft = leadingCentre - cardWidth / 2;
      const paddingRight = Math.max(0, frameWidth - paddingLeft - cardWidth - (count >= 2 ? interval : 0));
      return {
        cardWidth,
        paddingLeft,
        paddingRight,
        interval,
        gap: interval - cardWidth,
        regular: true,
        centred: true,
        foldAligned: true,
        compact: true,
      };
    }
  }
  if (foldRegion) {
    const cardWidth = Math.max(0, Math.min(content, MOBILE_SOURCE_FEATURED_FOLD_MAX_WIDTH));
    const paddingLeft = gutterLeft + (content - cardWidth) / 2;
    return {
      cardWidth,
      paddingLeft,
      paddingRight: Math.max(gutterRight, frameWidth - paddingLeft - cardWidth),
      interval: cardWidth + MOBILE_SOURCE_FEATURED_GAP,
      gap: MOBILE_SOURCE_FEATURED_GAP,
      regular: false,
      centred: true,
      foldAligned: false,
      compact: true,
    };
  }
  const variant = getMobileContinueCardVariant("tall", windowHeight, windowWidth);
  const library = getMobileContinueCardGeometry({ ...input, variant });
  const centred = variant === "tall" && library.columns === 1;
  const regular = content >= 680;
  const cardWidth = Math.max(0, Math.min(content, regular ? 420 : centred ? frameWidth - 56 : frameWidth - gutterLeft - 28, 560));
  const paddingLeft = centred ? gutterLeft + (content - cardWidth) / 2 : gutterLeft;
  // Enough trailing space for the last card to reach the same snap as every other card.
  const paddingRight = Math.max(gutterRight, frameWidth - paddingLeft - cardWidth);
  return {
    cardWidth,
    paddingLeft,
    paddingRight,
    interval: cardWidth + MOBILE_SOURCE_FEATURED_GAP,
    gap: MOBILE_SOURCE_FEATURED_GAP,
    regular,
    centred,
    foldAligned: false,
    compact: false,
  };
}
