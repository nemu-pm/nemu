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

/** Cover share of a one-card-per-position wide card (the multi-column card keeps 0.36). */
export const SINGLE_COVER_SHARE = 0.42;

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

/** A one-card-per-position wide card stays this narrow: taller than a flat banner, with the cover bigger (`SINGLE_COVER_SHARE`). */
const SINGLE_CARD_MAX_WIDTH = 420;

/** A single card never gets narrower than this (unless the window is). */
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
 * - Narrow (one card fits): a tall card (phone portrait) is centred between
 *   the gutters, its neighbours peeking on both sides. A wide card starts on
 *   the leading gutter and only the next card peeks; a lone card too.
 * - Wide (two or more fit): as many whole cards as fit side by side, an even
 *   number when the window has a fold region so folding barely moves them;
 *   a peek of the next card only when more cards follow; the row ends with
 *   the last card on the trailing gutter, the gaps all equal.
 * - Folded with a vertical fold: one card per pane, each centred in its pane
 *   with the fold edge keeping the pane's own outer margin, and the row snaps
 *   by one pane, so no card ever rests on or against the fold.
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
    // Each pane is a page of its own: the fold edge keeps the same margin as
    // the pane's outer edge, and the card sits centred between them. Both
    // cards share one width, the narrower pane's (the vertical bar's side).
    const leading = fold.start - 2 * left;
    const trailing = frameWidth - fold.end - 2 * right;
    const cardWidth = Math.min(maxWidth, leading, trailing);
    // A pane too narrow for a card: fall through to the flat rules.
    if (cardWidth >= minWidth * 0.75) {
      const first = left + (leading - cardWidth) / 2;
      const second = fold.end + right + (trailing - cardWidth) / 2;
      return {
        cardWidth,
        // One step moves a card from the trailing pane's place to the leading pane's.
        interval: second - first,
        paddingLeft: first,
        // The last card rests in the trailing pane's place, never further.
        paddingRight: frameWidth - second - cardWidth,
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
    // One card to a position (a short or narrow window: phone landscape, a
    // closed Duo): the leading card starts on the page gutter, as everywhere
    // else, and only the next card peeks, on the trailing side. Nothing sits
    // to its leading side to peek, so it is not centred.
    const roomed = content - gap - peek;
    const cardWidth = Math.min(maxWidth, SINGLE_CARD_MAX_WIDTH, content, count <= 1 ? content : Math.max(roomed, Math.min(content, NARROW_CARD_FLOOR)));
    return {
      ...NONE,
      cardWidth,
      interval: cardWidth + gap,
      paddingLeft: left,
      // The last card rests leading-aligned on the gutter, like the others.
      paddingRight: Math.max(right, frameWidth - left - cardWidth),
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
    // The row ends as it starts, mirrored: the last card on the trailing
    // gutter and the one before the last peeking on the leading side, never
    // an empty stretch where the peek was. That last step is shorter than an
    // interval (the scroll view clamps the snap to its end).
    paddingRight: right,
    columns,
  };
}

/**
 * Where the row rests with `index` leading (the snap point), clamped to the
 * row's end: a whole-cards row ends on the trailing gutter, short of a full
 * interval.
 */
export function getMobileContinueCardRestOffset(
  geometry: MobileContinueCardGeometry,
  { index, count, frameWidth }: { index: number; count: number; frameWidth: number },
): number {
  if (count <= 0 || geometry.cardWidth <= 0) return 0;
  const content = geometry.paddingLeft + (count - 1) * geometry.interval + geometry.cardWidth + geometry.paddingRight;
  return Math.max(0, Math.min(index * geometry.interval, content - frameWidth));
}
