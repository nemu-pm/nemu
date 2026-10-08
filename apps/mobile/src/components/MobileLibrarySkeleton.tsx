import { StyleSheet, View } from "react-native";
import { ExploreLibrarySkeleton } from "@/components/explore/ExploreLibrarySkeleton";
import { ExploreShimmerSweep } from "@/components/explore/ExploreShimmerSweep";
import { useExploreShimmerBackdrop } from "@/components/explore/useExploreShimmerBackdrop";
import { mobileDesignExploreFlag } from "@/lib/mobileDesignExplore";
import Animated from "react-native-reanimated";
import {
  createNemuShadowStyle,
  radius,
  useNemuTheme,
} from "@/design-system";
import { MOBILE_MANGA_GRID_GAP } from "@/lib/mobileAdaptiveGrid";
import { mobileFoldAwareGridCellStyle } from "@/lib/mobileFoldAwareGrid";
import { NO_INSETS, useMobileFoldAwareGrid } from "@/lib/useMobileFoldAwareGrid";
import {
  useSkeletonDisplayDelay,
  useSkeletonPulse,
} from "@/lib/useSkeletonPulse";

/** Three rows of placeholder covers at the loaded grid's column count. */
const SKELETON_ROWS = 3;

/**
 * Library loading skeleton sharing its geometry with MangaCard: 2/3 cover,
 * radius 10, 8pt gap, and a 60pt text block — so the real grid never shifts
 * or grows when data lands. Appears only after a 150ms hold, so fast loads
 * never flash a placeholder.
 */
export function MobileLibrarySkeleton({
  accessibilityLabel,
}: {
  accessibilityLabel: string;
}) {
  // Design-explore: the placeholder takes the explore Library's shape.
  if (mobileDesignExploreFlag) return <ExploreLibrarySkeleton accessibilityLabel={accessibilityLabel} />;
  return <ShippingLibrarySkeleton accessibilityLabel={accessibilityLabel} />;
}

function ShippingLibrarySkeleton({
  accessibilityLabel,
}: {
  accessibilityLabel: string;
}) {
  const { tokens, reduceMotion } = useNemuTheme();
  const shimmerBackdrop = useExploreShimmerBackdrop();
  // Same fold-aware grid as the library list (measured content box, even
  // columns on regular widths, the middle gutter on the fold in book posture),
  // so the skeleton hands off without a reflow and never straddles the fold.
  // It already sits inside the page gutters.
  // Refs stay out of the layout object read during render.
  const { ref: gridRef, onLayout: onGridLayout, ...grid } = useMobileFoldAwareGrid({ insets: NO_INSETS });
  const pulseOpacity = useSkeletonPulse(reduceMotion === true);
  // Design-explore: the blocks hold still and one shimmer sweep crosses them.
  const skeletonOpacity = mobileDesignExploreFlag ? 1 : pulseOpacity;
  const displayReady = useSkeletonDisplayDelay(150);
  const skeletonColor = tokens.muted;
  const subtleSkeletonColor = tokens.sourceIconGlass;

  if (!displayReady) return null;

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="progressbar"
      style={[styles.stack, shimmerBackdrop]}
    >
      <View
        ref={gridRef}
        onLayout={onGridLayout}
        collapsable={false}
        style={styles.grid}
      >
        {Array.from({ length: SKELETON_ROWS }, (_, row) => (
          <View key={row} style={styles.row}>
            {Array.from({ length: grid.columns }, (_, column) => (
              <View key={column} style={mobileFoldAwareGridCellStyle(grid, column)}>
                <Animated.View
                  style={[
                    styles.cover,
                    {
                      backgroundColor: skeletonColor,
                      borderColor: tokens.coverBorder,
                      opacity: skeletonOpacity,
                      ...createNemuShadowStyle({
                        color: tokens.shadow,
                        offsetY: 3,
                        radius: 14,
                        elevation: 4,
                      }),
                    },
                  ]}
                />
                <View style={styles.textBlock}>
                  <Animated.View
                    style={[
                      styles.titleLine,
                      { backgroundColor: skeletonColor, opacity: skeletonOpacity },
                    ]}
                  />
                  <Animated.View
                    style={[
                      styles.titleLine,
                      styles.titleLineSecond,
                      { backgroundColor: skeletonColor, opacity: skeletonOpacity },
                    ]}
                  />
                  <Animated.View
                    style={[
                      styles.subtitleLine,
                      {
                        backgroundColor: subtleSkeletonColor,
                        opacity: skeletonOpacity,
                      },
                    ]}
                  />
                </View>
              </View>
            ))}
          </View>
        ))}
      </View>
      {/* Design-explore: one shimmer sweep instead of the breathing pulse. */}
      {mobileDesignExploreFlag ? <ExploreShimmerSweep /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 16,
  },
  // Rows stack with the grid's row gap; columns are spaced by each cell's
  // marginLeft (mobileFoldAwareGridCellStyle), like the loaded grid.
  grid: {
    gap: MOBILE_MANGA_GRID_GAP,
  },
  row: {
    flexDirection: "row",
  },
  cover: {
    aspectRatio: 2 / 3,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  textBlock: {
    // Mirrors MangaCard: reserved 60pt block so the grid never reflows.
    minHeight: 60,
    marginTop: 8,
    paddingHorizontal: 2,
  },
  titleLine: {
    // MangaCard renders a 13/17 title over at most two lines; the skeleton
    // reserves the same two glyph heights so nothing shifts when data lands.
    height: 13,
    width: "92%",
    borderRadius: radius.sm,
  },
  titleLineSecond: {
    width: "60%",
    marginTop: 4,
  },
  subtitleLine: {
    height: 12,
    width: "45%",
    marginTop: 6,
    borderRadius: radius.sm,
  },
});
