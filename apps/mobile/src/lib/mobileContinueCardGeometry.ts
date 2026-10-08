export type MobileContinueCardGeometry = {
  cardWidth: number;
  /** Snap interval: one card plus the space to the next. */
  interval: number;
  paddingLeft: number;
  paddingRight: number;
  /** Cards that rest fully on screen side by side. */
  columns: number;
  /** One card per page (phone): the cover-flow turn applies. */
  turns: boolean;
  /** One card per pane, the space between them on the fold. */
  foldAligned: boolean;
};

export const MOBILE_CONTINUE_CARD = {
  /** How much of the next card shows past the gap when more cards follow. */
  peek: 28,
  gap: 12,
  /** A card never grows wider than this: its text column stays a readable measure. */
  maxWidth: 460,
  /** Narrowest card that still fits the cover, two title lines and the footer. */
  minWidth: 300,
} as const;

/**
 * The tall, cover-led card: the cover across the card's top, the text and a
 * full-width Continue under it. One card to a phone, centred, its neighbours
 * peeking on both sides.
 */
export const MOBILE_CONTINUE_TALL_CARD = {
  gap: 12,
  /**
   * Share of the row a phone's card takes (the rest is the two peeks and
   * gaps). Kept modest: a cover is rarely sharp past this size (a 250 pt
   * window is 750 px on a 3× screen), and the section after the cards should
   * show at rest.
   */
  share: 0.76,
  maxWidth: 316,
  /** Narrowest tall card: the cover still reads and the title keeps a few words a line. */
  minWidth: 220,
  /** Height of the cover window over the card width (the cover is 2:3; its top shows). */
  artAspect: 0.66,
  /** Shortest window that takes a tall card: below it (phone landscape, a closed Duo) the wide card fits better. */
  minWindowHeight: 740,
  /**
   * A window this narrow shows one card at a time, and the wide card's cover
   * would squeeze its text: from this height the tall card (text under the
   * cover, full width) takes it instead, as on a phone.
   */
  narrowWindowWidth: 560,
  narrowMinWindowHeight: 620,
} as const;

export type MobileContinueCardVariant = "wide" | "tall";

/**
 * Which card a window gets: tall if the window is tall enough, otherwise wide.
 */
export function getMobileContinueCardVariant(
  preferred: MobileContinueCardVariant,
  windowHeight: number,
  windowWidth = Number.POSITIVE_INFINITY,
): MobileContinueCardVariant {
  const { minWindowHeight, narrowWindowWidth, narrowMinWindowHeight } = MOBILE_CONTINUE_TALL_CARD;
  const fits = windowHeight >= minWindowHeight || (windowWidth <= narrowWindowWidth && windowHeight >= narrowMinWindowHeight);
  return preferred === "tall" && fits ? "tall" : "wide";
}

/** How much of each neighbour shows beside a centred card. */
const SIDE_PEEK = 20;

/** A centred single card never gets narrower than this (unless the window is). */
const NARROW_CARD_FLOOR = 280;

const NONE: MobileContinueCardGeometry = {
  cardWidth: 0,
  interval: 1,
  paddingLeft: 0,
  paddingRight: 0,
  columns: 1,
  turns: false,
  foldAligned: false,
};

/**
 * Continue-reading card geometry, from the row's own frame — never the
 * device, the orientation or a cached screen size. `frameWidth` is the
 * measured width of the scrolling row; `gutterLeft` / `gutterRight` are where
 * the page's content starts inside it on each side (they differ when the
 * system's vertical bar holds one edge); `fold` is the active fold in the
 * row's own coordinates, or null.
 *
 * - Narrow (one card fits): the card is centred between the gutters and its
 *   neighbours peek on both sides; a lone card is centred too.
 * - Wide (two or more fit): as many whole cards as fit side by side, an even
 *   number when the window has a fold region so folding barely moves them;
 *   a peek of the next card only when more cards follow.
 * - Folded with a vertical fold: one card per pane. The leading card starts on
 *   the page gutter and ends before the fold, the next starts where the fold
 *   ends, and the row snaps by one pane, so no card ever rests on the fold.
 */
export function getMobileContinueCardGeometry({
  frameWidth,
  gutterLeft,
  gutterRight = gutterLeft,
  count = 2,
  fold = null,
  preferEven = false,
  variant = "wide",
}: {
  frameWidth: number;
  gutterLeft: number;
  gutterRight?: number;
  /** Number of cards; a lone card needs no room for a neighbour. */
  count?: number;
  fold?: { start: number; end: number } | null;
  /** The window has a fold region, active or not. */
  preferEven?: boolean;
  variant?: MobileContinueCardVariant;
}): MobileContinueCardGeometry {
  const tall = variant === "tall";
  const { peek, gap } = MOBILE_CONTINUE_CARD;
  const { maxWidth, minWidth } = tall ? MOBILE_CONTINUE_TALL_CARD : MOBILE_CONTINUE_CARD;
  if (!(frameWidth > 0)) return NONE;
  const left = Math.max(0, gutterLeft);
  const right = Math.max(0, gutterRight);

  if (fold && fold.end > fold.start) {
    const leading = fold.start - left;
    const trailing = frameWidth - right - fold.end;
    const cardWidth = Math.min(maxWidth, leading, trailing);
    // A pane too narrow for a card: fall through to the flat rules.
    if (cardWidth >= minWidth * 0.75) {
      const interval = fold.end - left;
      return {
        cardWidth,
        interval,
        paddingLeft: left,
        // The last card can rest in the trailing pane, never further.
        paddingRight: Math.max(right, frameWidth - fold.end - cardWidth),
        columns: 2,
        turns: false,
        foldAligned: true,
      };
    }
  }

  const content = frameWidth - left - right;
  const fit = Math.max(1, Math.floor((content + gap) / (minWidth + gap)));
  const columns = preferEven && fit > 2 && fit % 2 === 1 ? fit - 1 : fit;

  if (columns === 1 && tall) {
    // Centred on the content, so a neighbour peeks on each side.
    const cardWidth = Math.min(
      maxWidth,
      Math.round(frameWidth * MOBILE_CONTINUE_TALL_CARD.share),
      Math.max(minWidth, content - 2 * (gap + SIDE_PEEK)),
      content,
    );
    const paddingLeft = left + (content - cardWidth) / 2;
    return {
      ...NONE,
      cardWidth,
      interval: cardWidth + gap,
      paddingLeft,
      paddingRight: frameWidth - paddingLeft - cardWidth,
      turns: count > 1,
    };
  }

  if (columns === 1) {
    // One card to a position: centred between the gutters, so a neighbour
    // peeks on each side (the first and last card too, their missing
    // neighbour leaving the same room).
    const roomed = content - 2 * (gap + SIDE_PEEK);
    const cardWidth = Math.min(maxWidth, content, count <= 1 ? content : Math.max(roomed, Math.min(content, NARROW_CARD_FLOOR)));
    const paddingLeft = left + (content - cardWidth) / 2;
    return {
      ...NONE,
      cardWidth,
      interval: cardWidth + gap,
      paddingLeft,
      paddingRight: frameWidth - paddingLeft - cardWidth,
      turns: count > 1,
    };
  }

  // Everything fits: the cards share the content width, gutter to gutter.
  const overflows = count > columns;
  const available = overflows ? frameWidth - left - peek - gap : content;
  const cardWidth = Math.min(maxWidth, (available - gap * (columns - 1)) / columns);
  return {
    ...NONE,
    cardWidth,
    interval: cardWidth + gap,
    paddingLeft: left,
    // The last `columns` cards rest with the first of them on the gutter.
    paddingRight: overflows
      ? Math.max(right, frameWidth - left - columns * cardWidth - (columns - 1) * gap)
      : right,
    columns,
  };
}
