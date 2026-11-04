import { MOBILE_EXPLORE_RADIUS as R } from "@/lib/mobileExploreRadius";
import { StyleSheet, View } from "react-native";
import { radius, useNemuTheme } from "@/design-system";
import { MOBILE_MANGA_GRID_GAP, mobileLibraryGridMinItemWidth } from "@/lib/mobileAdaptiveGrid";
import { useMobileAdaptiveLayout } from "@/lib/MobileWindowLayoutContext";
import { mobileFoldAwareGridCellStyle } from "@/lib/mobileFoldAwareGrid";
import { NO_INSETS, useMobileFoldAwareGrid } from "@/lib/useMobileFoldAwareGrid";
import { useSkeletonDisplayDelay } from "@/lib/useSkeletonPulse";
import { ExploreShimmerSweep } from "./ExploreShimmerSweep";
import { useExploreShimmerBackdrop } from "./useExploreShimmerBackdrop";

/** Rows of placeholder covers at the loaded grid's column count. */
const SKELETON_ROWS = 3;

/**
 * The Library's cold-start placeholder in the design-explore layout: the
 * grid's covers and their title lines.
 */
export function ExploreLibrarySkeleton({ accessibilityLabel }: { accessibilityLabel: string }) {
  const { tokens } = useNemuTheme();
  const shimmerBackdrop = useExploreShimmerBackdrop();
  const adaptive = useMobileAdaptiveLayout();
  const { ref: gridRef, onLayout: onGridLayout, ...grid } = useMobileFoldAwareGrid({
    insets: NO_INSETS,
    // Same covers as the Library it stands in for.
    minItemWidth: mobileLibraryGridMinItemWidth(adaptive),
  });
  const displayReady = useSkeletonDisplayDelay(150);
  if (!displayReady) return null;

  const block = { backgroundColor: tokens.muted };

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="progressbar"
      style={[styles.stack, shimmerBackdrop]}
    >
      <View ref={gridRef} onLayout={onGridLayout} collapsable={false} style={styles.grid}>
        {Array.from({ length: SKELETON_ROWS }, (_, row) => (
          <View key={row} style={styles.row}>
            {Array.from({ length: grid.columns }, (_, column) => (
              <View key={column} style={mobileFoldAwareGridCellStyle(grid, column)}>
                <View style={[styles.cover, block, { borderColor: tokens.coverBorder }]} />
                <View style={styles.textBlock}>
                  <View style={[styles.titleLine, block]} />
                  <View style={[styles.titleLine, styles.titleLineSecond, block]} />
                </View>
              </View>
            ))}
          </View>
        ))}
      </View>
      <ExploreShimmerSweep />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 16,
  },
  grid: {
    gap: MOBILE_MANGA_GRID_GAP,
  },
  row: {
    flexDirection: "row",
  },
  // MangaCard's cover and its reserved 60pt text block.
  cover: {
    aspectRatio: 2 / 3,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  textBlock: {
    minHeight: 60,
    marginTop: 8,
    paddingHorizontal: 2,
  },
  titleLine: {
    height: 13,
    width: "92%",
    borderRadius: R.hair,
  },
  titleLineSecond: {
    width: "60%",
    marginTop: 4,
  },
});
