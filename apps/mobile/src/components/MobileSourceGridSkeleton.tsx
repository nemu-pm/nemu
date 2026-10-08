import { StyleSheet, View } from "react-native";
import { ExploreShimmerSweep } from "@/components/explore/ExploreShimmerSweep";
import { useExploreShimmerBackdrop } from "@/components/explore/useExploreShimmerBackdrop";
import { mobileDesignExploreFlag } from "@/lib/mobileDesignExplore";
import Animated from "react-native-reanimated";
import {
  useSkeletonDisplayDelay,
  useSkeletonPulse,
} from "@/lib/useSkeletonPulse";
import { MOBILE_SOURCE_GRID_SKELETON_ROWS } from "@/lib/mobileSourceGridSkeletonLayout";
import { MOBILE_MANGA_GRID_GAP } from "@/lib/mobileAdaptiveGrid";
import { mobileFoldAwareGridCellStyle } from "@/lib/mobileFoldAwareGrid";
import { useMobileFoldAwareGrid } from "@/lib/useMobileFoldAwareGrid";
import { radius, useNemuTheme } from "@/design-system";

const NO_INSETS = { left: 0, right: 0 };

type MobileSourceGridSkeletonProps = {
  accessibilityLabel: string;
};

/**
 * The source browse first-page placeholder: a grid of cover cards and text
 * blocks breathing on the shared skeleton pulse. Mirrors the browse grid's
 * geometry (the same fold-aware grid — measured content box, even columns on
 * regular widths, the middle gutter on the fold in book posture — 2/3 covers,
 * 60pt copy block) so the skeleton hands off to the real cards without a
 * layout jump and never straddles the fold.
 * Replaces the lone centered spinner on initial loads; subsequent pages keep
 * the footer's loading state.
 */
export function MobileSourceGridSkeleton({
  accessibilityLabel,
}: MobileSourceGridSkeletonProps) {
  const { tokens, reduceMotion } = useNemuTheme();
  const shimmerBackdrop = useExploreShimmerBackdrop();
  // It sits inside the page gutters, so the measured view is the content box.
  // Refs stay out of the layout object read during render.
  const { ref: gridRef, onLayout: onGridLayout, ...grid } = useMobileFoldAwareGrid({ insets: NO_INSETS });
  const pulseOpacity = useSkeletonPulse(reduceMotion === true);
  // Design-explore: the blocks hold still and one shimmer sweep crosses them.
  const skeletonOpacity = mobileDesignExploreFlag ? 1 : pulseOpacity;
  const skeletonReady = useSkeletonDisplayDelay(150);
  const skeletonColor = tokens.muted;

  if (!skeletonReady) return null;

  return (
    <Animated.View
      ref={gridRef}
      onLayout={onGridLayout}
      collapsable={false}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="progressbar"
      style={[styles.grid, { opacity: skeletonOpacity }, shimmerBackdrop]}
    >
      {Array.from({ length: MOBILE_SOURCE_GRID_SKELETON_ROWS }, (_, row) => (
        <View key={row} style={styles.row}>
          {Array.from({ length: grid.columns }, (_, card) => (
            <View key={card} style={mobileFoldAwareGridCellStyle(grid, card)}>
              <View
                style={[
                  styles.cover,
                  {
                    backgroundColor: skeletonColor,
                    borderColor: tokens.coverBorder,
                  },
                ]}
              />
              <View style={styles.copy}>
                <View
                  style={[styles.titleLine, { backgroundColor: skeletonColor }]}
                />
                <View
                  style={[
                    styles.subtitleLine,
                    { backgroundColor: tokens.sourceIconGlass },
                  ]}
                />
              </View>
            </View>
          ))}
        </View>
      ))}
      {/* Design-explore: one shimmer sweep instead of the breathing pulse. */}
      {mobileDesignExploreFlag ? <ExploreShimmerSweep /> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Rows use the browse grid's `gridRow` gap; columns are spaced by each
  // cell's marginLeft (mobileFoldAwareGridCellStyle), like the loaded grid.
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
  copy: {
    // Mirrors the browse card's reserved 60pt copy block.
    minHeight: 60,
    marginTop: 8,
    paddingHorizontal: 2,
  },
  titleLine: {
    // `liveTitle` line box.
    height: 17,
    width: "92%",
    borderRadius: radius.sm,
  },
  subtitleLine: {
    // `liveSubtitle` line box.
    width: "45%",
    height: 15,
    marginTop: 2,
    borderRadius: radius.sm,
  },
});
