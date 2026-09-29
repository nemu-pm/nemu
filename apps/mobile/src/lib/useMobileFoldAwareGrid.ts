import { useMemo } from "react";
import { useWindowDimensions, type ViewInstance } from "react-native";
import { useMobilePageGutters } from "@/design-system";
import {
  MOBILE_MANGA_GRID_GAP,
  MOBILE_MANGA_GRID_MAX_COLUMNS,
  MOBILE_MANGA_GRID_MIN_COLUMNS,
  MOBILE_MANGA_GRID_MIN_ITEM_WIDTH,
} from "@/lib/mobileAdaptiveGrid";
import { mobileGridPrefersEvenColumns } from "@/lib/mobileAdaptiveLayout";
import {
  mobileFoldAwareGridContentWidth,
  mobileFoldAwareGridLayout,
  type MobileFoldAwareGridLayout,
  type MobileFoldInterval,
} from "@/lib/mobileFoldAwareGrid";
import { useMobileContainerFold } from "@/lib/useMobileContainerFold";

type MeasurableNode = Parameters<typeof useMobileContainerFold>[0];

export type MobileFoldAwareGridOptions = {
  minItemWidth?: number;
  gap?: number;
  minColumns?: number;
  maxColumns?: number;
  /**
   * Leading/trailing padding between the measured container and the grid's
   * content box. Defaults to the page scaffold's safe-area-aware gutters (a
   * full-bleed list); pass 0 for a container that is already the content box.
   */
  insets?: { left: number; right: number };
  /** Host node for containers such as FlatList (see useMobileContainerFold). */
  getNode?: MeasurableNode;
};

export type MobileFoldAwareGrid = MobileFoldAwareGridLayout & {
  /** Attach to the container (or call from its onLayout). */
  onLayout: ReturnType<typeof useMobileContainerFold<ViewInstance>>["onLayout"];
  /** For a plain View container (unused when `getNode` is given). */
  ref: ReturnType<typeof useMobileContainerFold<ViewInstance>>["ref"];
  /** The fold in content-box coordinates while it crosses the grid. */
  fold: MobileFoldInterval | null;
};

/**
 * Grid for a browsing surface: columns from the container width (not the
 * device), an even count whenever the window has a fold region (folded or
 * flat), and the middle gutter on the active fold in book posture. Fully
 * opening the display restores uniform gaps across the available width.
 * Defaults are the manga cover grid's tuning.
 */
export function useMobileFoldAwareGrid({
  minItemWidth = MOBILE_MANGA_GRID_MIN_ITEM_WIDTH,
  gap = MOBILE_MANGA_GRID_GAP,
  minColumns = MOBILE_MANGA_GRID_MIN_COLUMNS,
  maxColumns = MOBILE_MANGA_GRID_MAX_COLUMNS,
  insets,
  getNode,
}: MobileFoldAwareGridOptions = {}): MobileFoldAwareGrid {
  const { width: windowWidth } = useWindowDimensions();
  const gutters = useMobilePageGutters();
  const container = useMobileContainerFold<ViewInstance>(getNode);
  const left = insets?.left ?? gutters.left;
  const right = insets?.right ?? gutters.right;
  const contentWidth = mobileFoldAwareGridContentWidth({
    containerWidth: container.width,
    windowWidth,
    insets: { left, right },
    pageGutters: gutters,
  });
  // An inactive fold is only a column-parity hint, not reserved space.
  const split = container.split;
  const foldStart = split?.axis === "horizontal" ? split.gutter.start - left : null;
  const foldEnd = split?.axis === "horizontal" ? split.gutter.end - left : null;
  const preferEven = mobileGridPrefersEvenColumns(container.adaptive);
  const layout = useMemo(() => {
    const fold = foldStart !== null && foldEnd !== null ? { start: foldStart, end: foldEnd } : null;
    return {
      fold,
      ...mobileFoldAwareGridLayout({
        contentWidth,
        minItemWidth,
        gap,
        minColumns,
        maxColumns,
        preferEven,
        fold,
      }),
    };
  }, [contentWidth, foldEnd, foldStart, gap, maxColumns, minColumns, minItemWidth, preferEven]);
  return { ...layout, onLayout: container.onLayout, ref: container.ref };
}
