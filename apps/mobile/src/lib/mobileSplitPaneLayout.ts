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
 * - flat, the leading pane is narrower, like the Notes sidebar. This is
 *   deliberate even when the device still reports its inactive fold
 *   (`mobileRestingFoldSplitForContainer`): the empty-state hero splits on
 *   that line so folding moves nothing, but a list + detail split follows
 *   Notes, and the fold ⇄ flat change glides (pose layout transition /
 *   settle fade in the consumers) instead of jumping;
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
  /** Leading share of the container when flat. */
  leadingFraction: number;
  minLeading: number;
  maxLeading: number;
  /** Below this the trailing pane is too cramped: stay single column. */
  minTrailing: number;
  /** Smallest fold half that still hosts a pane. */
  minFoldPane: number;
  /** Narrower containers keep one column while flat (the fold split ignores it). */
  minFlatSplitWidth?: number;
};

export const MOBILE_DETAIL_SPLIT_OPTIONS: MobileSplitPaneOptions = {
  leadingFraction: 0.4,
  minLeading: 320,
  maxLeading: 460,
  minTrailing: 320,
  minFoldPane: 280,
  minFlatSplitWidth: MOBILE_EXPANDED_WIDTH,
};

export const MOBILE_SETTINGS_SPLIT_OPTIONS: MobileSplitPaneOptions = {
  leadingFraction: 0.36,
  minLeading: 300,
  maxLeading: 380,
  minTrailing: 320,
  minFoldPane: 280,
};

export function getMobileSplitPaneLayout({
  containerWidth,
  regularWidth,
  posture,
  foldSplit,
  options,
}: {
  containerWidth: number;
  regularWidth: boolean;
  posture: MobileWindowPosture;
  /** `mobileFoldSplitForContainer` for the measured container, or null. */
  foldSplit: MobileContainerFoldSplit | null;
  options: MobileSplitPaneOptions;
}): MobileSplitPaneLayout {
  if (!regularWidth || posture === "notebook") return { mode: "single" };
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
  const leadingWidth = Math.round(
    Math.min(
      options.maxLeading,
      Math.max(options.minLeading, containerWidth * options.leadingFraction),
    ),
  );
  const trailingWidth = containerWidth - leadingWidth;
  if (trailingWidth < options.minTrailing) return { mode: "single" };
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
