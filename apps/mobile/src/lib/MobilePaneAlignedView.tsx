import { useCallback, useMemo, useState, type ReactNode } from "react";
import { View, type LayoutChangeEvent, type ViewInstance } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  MOBILE_PANE_CONTENT_MAX_WIDTH,
  mobileNudgeOffFold,
  mobilePaneContentRegion,
} from "@/lib/mobileFoldAwareGrid";
import { useMobileContainerFold } from "@/lib/useMobileContainerFold";
import { MobilePoseLayoutView } from "@/components/MobilePoseLayoutView";

/**
 * Hosts a page-level placeholder (empty, loading or error state): centered
 * with a readable max width on wide windows, inside one pane when the device
 * is partially folded, so it never rests on the folding region (HIG: keep
 * important content and tap targets clear of the fold).
 *
 * `children` may be a function receiving `minHeight` — the pane height the
 * placeholder should vertically center itself in (notebook posture), or
 * undefined to keep its own sizing. Content that keeps its own size is
 * nudged just past the fold instead when its frame would rest on it.
 *
 * Folding / unfolding moves the placeholder to (or from) its pane with the
 * shared pose settle spring rather than a jump.
 */
export function MobilePaneAlignedView({
  children,
}: {
  children: ReactNode | ((pane: { minHeight: number | undefined }) => ReactNode);
}) {
  const insets = useSafeAreaInsets();
  const { ref, onLayout, rect, adaptive } = useMobileContainerFold<ViewInstance>();
  const [contentHeight, setContentHeight] = useState(0);
  const onContentLayout = useCallback((event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.height;
    setContentHeight((previous) => (Math.abs(previous - next) < 0.5 ? previous : next));
  }, []);
  const region = useMemo(
    () =>
      rect
        ? mobilePaneContentRegion({
            container: rect,
            posture: adaptive.posture,
            fold: adaptive.fold,
            windowHeight: adaptive.height,
            bottomInset: insets.bottom,
          })
        : null,
    [adaptive.fold, adaptive.height, adaptive.posture, insets.bottom, rect],
  );
  const fillsPane = typeof children === "function" && !!region && region.height > 0;
  const minHeight = fillsPane && region ? region.height : undefined;
  // Window-coordinate frame of the content; only moves toward the end (the
  // placeholder sits in the page flow, nothing may be covered above it).
  const nudge =
    !fillsPane && region && rect && adaptive.posture === "notebook" && adaptive.fold && contentHeight > 0
      ? mobileNudgeOffFold(
          { start: rect.y + region.y, size: contentHeight },
          { start: adaptive.fold.y, end: adaptive.fold.y + adaptive.fold.height },
          { min: rect.y },
        )
      : 0;
  return (
    <View ref={ref} onLayout={onLayout} collapsable={false}>
      <MobilePoseLayoutView
        onLayout={onContentLayout}
        style={
          region
            ? {
                width: region.contentWidth,
                marginLeft: region.x + (region.width - region.contentWidth) / 2,
                marginTop: region.y + nudge,
              }
            : { alignSelf: "center", width: "100%", maxWidth: MOBILE_PANE_CONTENT_MAX_WIDTH }
        }
      >
        {typeof children === "function" ? children({ minHeight }) : children}
      </MobilePoseLayoutView>
    </View>
  );
}
