import { useMemo } from "react";
import type { LayoutChangeEvent, ViewInstance } from "react-native";
import { mobileFoldSplitForContainer } from "@/lib/mobileAdaptiveLayout";
import {
  getMobileSplitPaneLayout,
  type MobileSplitPaneLayout,
  type MobileSplitPaneOptions,
} from "@/lib/mobileSplitPaneLayout";
import { useMobileContainerFold } from "@/lib/useMobileContainerFold";

/**
 * Measures a split container in window coordinates and derives its panes from
 * the app-wide adaptive layout. Lays out from the container's bounds, never the
 * screen (HIG "build to resize").
 *
 * Book panes follow the active fold. Unfolding restores the proportional
 * sidebar layout without reserving space for an inactive fold.
 *
 * Measurement goes through `useMobileContainerFold`, which re-measures when the
 * fold changes (folding into book pose changes the reserved regions without
 * resizing the container) and ignores the off-window frame a push transition
 * reports, measuring again once it settles — otherwise a detail screen pushed
 * while folded would keep a stale origin and miss the fold-aligned split.
 */
export function useMobileSplitPaneLayout(options: MobileSplitPaneOptions): {
  containerRef: ReturnType<typeof useMobileContainerFold<ViewInstance>>["ref"];
  onContainerLayout: (event: LayoutChangeEvent) => void;
  layout: MobileSplitPaneLayout;
} {
  const container = useMobileContainerFold<ViewInstance>();
  const { rect } = container;
  const adaptive = container.adaptive;
  const containerWidth = container.width ?? adaptive.width;
  // Until a trusted window measurement lands (it is asynchronous, and skipped
  // mid-transition), assume the container starts at the window's leading edge
  // — true for these full-screen splits — so a folded device gets the
  // fold-aligned panes on the first frame instead of the flat split.
  const foldSplit = useMemo(
    () =>
      rect
        ? container.split
        : mobileFoldSplitForContainer(adaptive, {
            x: 0,
            y: 0,
            width: containerWidth,
            height: adaptive.height,
          }),
    [adaptive, container.split, containerWidth, rect],
  );

  const layout = useMemo(
    () =>
      getMobileSplitPaneLayout({
        containerWidth,
        regularWidth: adaptive.regularWidth,
        posture: adaptive.posture,
        foldSplit,
        options,
      }),
    [adaptive.posture, adaptive.regularWidth, containerWidth, foldSplit, options],
  );

  return { containerRef: container.ref, onContainerLayout: container.onLayout, layout };
}
