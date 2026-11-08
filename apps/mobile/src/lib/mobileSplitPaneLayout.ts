import {
  MOBILE_EXPANDED_WIDTH,
  type MobileContainerFoldSplit,
  type MobileWindowPosture,
} from "@/lib/mobileAdaptiveLayout";

/**
 * Two-level split (Mail: list + message, Notes: sidebar + note) for screens
 * that gain a second level of hierarchy on regular widths — manga detail
 * (info + chapters) and Settings (sections + section content).
 *
 * HIG (Designing for iPhone Duo):
 * - compact width keeps the single column; regular width shows the extra level;
 * - partially folded as a book, the panes line up with the halves and nothing
 *   sits on the fold (each pane pads its own edges);
 * - fully open windows use a narrower leading pane, like the Notes sidebar;
 *   an inactive fold does not reserve a gutter or force equal-width panes;
 * - notebook (horizontal fold) keeps a single column: side-by-side panes would
 *   each straddle the fold.
 *
 * `minFlatSplitWidth` gates the flat (unfolded) split. Manga detail only splits
 * flat on expanded widths: HIG arrangement views go side by side when wider
 * than tall, Material's list-detail shows one pane below 840dp, and the web
 * app keeps one column there too — so the Duo's inner portrait display (669pt)
 * and tablets in portrait keep the single list instead of two ~330pt panes.
 */
export type MobileSplitPaneRect = { x: number; width: number };

export type MobileSplitPaneLayout =
  | { mode: "single" }
  | {
      mode: "split";
      /** `fold`: panes are the fold halves; `flat`: proportional split with a hairline divider. */
      alignment: "fold" | "flat";
      leading: MobileSplitPaneRect;
      trailing: MobileSplitPaneRect;
      /** Empty band between the panes (the fold); 0 when flat. */
      gutter: number;
    };

export type MobileSplitPaneOptions = {
  /** Flat leading width: a share of the container, clamped to min/maxLeading. */
  leadingFraction?: number;
  /**
   * Flat leading width: the container minus this, clamped to min/maxLeading
   * (the detail keeps this much first). Takes precedence over `leadingFraction`.
   */
  trailingReserve?: number;
  minLeading: number;
  maxLeading: number;
  /** Below this the trailing pane is too cramped: stay single column. */
  minTrailing: number;
  /** Smallest fold half that still hosts a pane. */
  minFoldPane: number;
  /** Narrower containers keep one column while flat (the fold split ignores it). */
  minFlatSplitWidth?: number;
  /**
   * The flat split needs a container wider than tall, as UISplitViewController
   * decides it by default: on regular widths it shows the sidebar beside the
   * secondary column in landscape and the secondary column alone in portrait
   * (the Duo's inner display: 951 x 669 two columns, 669 x 951 one; iPad
   * portrait likewise). The fold split ignores it.
   */
  flatSplitNeedsLandscape?: boolean;
  /**
   * The flat rule measures the width between the side safe areas (a vertical
   * bar, the outer display's rail) and the leading inset is added back to the
   * leading pane, so a bar beside the sidebar does not eat into its rows.
   */
  measureInsideSideInsets?: boolean;
};

export const MOBILE_DETAIL_SPLIT_OPTIONS: MobileSplitPaneOptions = {
  leadingFraction: 0.4,
  minLeading: 320,
  maxLeading: 460,
  minTrailing: 320,
  minFoldPane: 280,
  minFlatSplitWidth: MOBILE_EXPANDED_WIDTH,
};

/**
 * The system Settings sidebar: 320pt wherever the detail still gets 419pt,
 * narrowing to 250pt below that. Two columns only where UISplitViewController
 * would show them (landscape-shaped regular widths): portrait, the Duo's inner
 * display included, keeps the one list and pushes each page.
 */
export const MOBILE_SETTINGS_SPLIT_OPTIONS: MobileSplitPaneOptions = {
  trailingReserve: 419,
  minLeading: 250,
  maxLeading: 320,
  minTrailing: 320,
  minFoldPane: 280,
  flatSplitNeedsLandscape: true,
  measureInsideSideInsets: true,
};

/**
 * Settings content sits 20pt from the pane boundary on either side, as in the
 * system Settings (40pt from the crease in book posture, where the 40pt fold
 * band lies between the panes).
 */
export const MOBILE_SETTINGS_SPLIT_INNER_GUTTER = 20;

function flatLeadingWidth(containerWidth: number, options: MobileSplitPaneOptions): number {
  const preferred =
    options.trailingReserve !== undefined
      ? containerWidth - options.trailingReserve
      : containerWidth * (options.leadingFraction ?? 0);
  return Math.round(Math.min(options.maxLeading, Math.max(options.minLeading, preferred)));
}

export function getMobileSplitPaneLayout({
  containerWidth,
  containerHeight,
  regularWidth,
  posture,
  foldSplit,
  options,
  sideInsets,
}: {
  containerWidth: number;
  /** For `flatSplitNeedsLandscape`; unknown (omitted) counts as landscape. */
  containerHeight?: number;
  regularWidth: boolean;
  posture: MobileWindowPosture;
  /** `mobileFoldSplitForContainer` for the measured container, or null. */
  foldSplit: MobileContainerFoldSplit | null;
  options: MobileSplitPaneOptions;
  /** The window's left/right safe-area insets (`measureInsideSideInsets`). */
  sideInsets?: { left: number; right: number } | null;
}): MobileSplitPaneLayout {
  if (!regularWidth) return { mode: "single" };
  if (posture === "notebook") return { mode: "single" };
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) return { mode: "single" };

  if (posture === "book" && foldSplit?.axis === "horizontal") {
    const leadingWidth = foldSplit.gutter.start;
    const trailingWidth = containerWidth - foldSplit.gutter.end;
    if (leadingWidth >= options.minFoldPane && trailingWidth >= options.minFoldPane) {
      return {
        mode: "split",
        alignment: "fold",
        leading: { x: 0, width: leadingWidth },
        trailing: { x: foldSplit.gutter.end, width: trailingWidth },
        gutter: foldSplit.gutter.end - foldSplit.gutter.start,
      };
    }
    // The fold leaves no usable half (e.g. the container sits on one side of
    // it): fall through to the flat rule, which keeps working on its own pane.
  }

  if (containerWidth < (options.minFlatSplitWidth ?? 0)) return { mode: "single" };
  if (
    options.flatSplitNeedsLandscape &&
    containerHeight !== undefined &&
    Number.isFinite(containerHeight) &&
    containerWidth <= containerHeight
  ) {
    return { mode: "single" };
  }
  const inset = options.measureInsideSideInsets
    ? { left: Math.max(0, sideInsets?.left ?? 0), right: Math.max(0, sideInsets?.right ?? 0) }
    : { left: 0, right: 0 };
  const leadingWidth =
    inset.left + flatLeadingWidth(containerWidth - inset.left - inset.right, options);
  const trailingWidth = containerWidth - leadingWidth;
  if (trailingWidth - inset.right < options.minTrailing) return { mode: "single" };
  return {
    mode: "split",
    alignment: "flat",
    leading: { x: 0, width: leadingWidth },
    trailing: { x: leadingWidth, width: trailingWidth },
    gutter: 0,
  };
}

/**
 * Horizontal content padding per pane. The outer edges keep the page gutters
 * (which already include the landscape safe area); the inner edges only need
 * the plain gutter because the fold band itself is outside both panes.
 */
export function getMobileSplitPanePadding({
  pageGutters,
  innerGutter,
}: {
  pageGutters: { left: number; right: number };
  innerGutter: number;
}): {
  leading: { paddingLeft: number; paddingRight: number };
  trailing: { paddingLeft: number; paddingRight: number };
} {
  return {
    leading: { paddingLeft: pageGutters.left, paddingRight: innerGutter },
    trailing: { paddingLeft: innerGutter, paddingRight: pageGutters.right },
  };
}

/**
 * Two columns inside a content box that the active book fold crosses, laid
 * out by the same fold split as a two-level screen (`getMobileSplitPaneLayout`,
 * Search's sidebar | results): each column is its fold half, `innerGutter`
 * in from the fold region's edges, so nothing rests on the fold or beside it.
 * `fold` is the active fold in the content box's coordinates. Null when there
 * is none or it leaves no usable half: the caller keeps its flat columns
 * (an inactive fold reserves nothing, as in Search when the device is flat).
 */
export function getMobileFoldSplitColumns({
  contentWidth,
  fold,
  options,
  innerGutter,
}: {
  contentWidth: number;
  fold: { start: number; end: number } | null | undefined;
  options: MobileSplitPaneOptions;
  innerGutter: number;
}): { leading: MobileSplitPaneRect; trailing: MobileSplitPaneRect } | null {
  if (!fold || !Number.isFinite(fold.start) || !Number.isFinite(fold.end) || fold.end < fold.start) return null;
  const layout = getMobileSplitPaneLayout({
    containerWidth: contentWidth,
    regularWidth: true,
    posture: "book",
    foldSplit: {
      axis: "horizontal",
      first: { x: 0, y: 0, width: fold.start, height: 0 },
      second: { x: fold.end, y: 0, width: contentWidth - fold.end, height: 0 },
      gutter: { start: fold.start, end: fold.end },
    },
    options,
  });
  if (layout.mode !== "split" || layout.alignment !== "fold") return null;
  // The content box already sits inside the page gutters: only the inner
  // (fold-side) gutter applies.
  const padding = getMobileSplitPanePadding({ pageGutters: { left: 0, right: 0 }, innerGutter });
  const pane = (rect: MobileSplitPaneRect, pad: { paddingLeft: number; paddingRight: number }) => ({
    x: rect.x + pad.paddingLeft,
    width: Math.max(0, rect.width - pad.paddingLeft - pad.paddingRight),
  });
  return { leading: pane(layout.leading, padding.leading), trailing: pane(layout.trailing, padding.trailing) };
}

/** One column's box in a row of list columns; every key is always set. */
export type MobileListColumnStyle = {
  width: number | "auto";
  flexBasis: number;
  flexGrow: number;
  flexShrink: number;
  minWidth: number;
  marginLeft: number;
};

/**
 * The columns of a home list row, fold split (`getMobileFoldSplitColumns`,
 * book) or even (flat), as complete styles: each column sets the same keys in
 * both modes, so folding or unfolding on the page overwrites every value the
 * other mode set. Dropping a key instead (the fold's fixed width when the flat
 * column only says `flex: 1`) left the book widths on the native views after
 * an unfold (r19: X20–467 / X484–866, the book's 419 / 354 plus half the free
 * space each, instead of 414 / 414). `mode` doubles as the row's identity, so
 * a posture change also lays the columns out from fresh views.
 */
export function getMobileListColumnStyles({
  contentWidth,
  fold,
  columns,
  gap,
  options,
  innerGutter,
}: {
  contentWidth: number | undefined;
  fold: { start: number; end: number } | null | undefined;
  columns: number;
  gap: number;
  options: MobileSplitPaneOptions;
  innerGutter: number;
}): { mode: "fold" | "flat"; columns: MobileListColumnStyle[] } {
  const foldColumns = columns >= 2 && fold && contentWidth
    ? getMobileFoldSplitColumns({ contentWidth, fold, options, innerGutter })
    : null;
  if (foldColumns) {
    const { leading, trailing } = foldColumns;
    const fixed = (width: number, marginLeft: number): MobileListColumnStyle => ({
      width,
      flexBasis: width,
      flexGrow: 0,
      flexShrink: 0,
      minWidth: 0,
      marginLeft,
    });
    return {
      mode: "fold",
      columns: [fixed(leading.width, leading.x), fixed(trailing.width, trailing.x - leading.x - leading.width)],
    };
  }
  const count = Math.max(1, columns);
  return {
    mode: "flat",
    columns: Array.from({ length: count }, (_, column) => ({
      width: "auto",
      flexBasis: 0,
      flexGrow: 1,
      flexShrink: 1,
      minWidth: 0,
      marginLeft: column === 0 ? 0 : gap,
    })),
  };
}
