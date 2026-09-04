import { StyleSheet, View, useWindowDimensions } from "react-native";
import Animated from "react-native-reanimated";
import {
  useSkeletonDisplayDelay,
  useSkeletonPulse,
} from "@/lib/useSkeletonPulse";
import {
  getMobileSourceGridSkeletonGeometry,
  MOBILE_SOURCE_GRID_SKELETON_ROWS,
} from "@/lib/mobileSourceGridSkeletonLayout";
import { MOBILE_MANGA_GRID_GAP } from "@/lib/mobileAdaptiveGrid";
import { radius, useNemuTheme } from "@/design-system";

type MobileSourceGridSkeletonProps = {
  accessibilityLabel: string;
};

/**
 * The source browse first-page placeholder: a grid of cover cards and text
 * blocks breathing on the shared skeleton pulse. Mirrors the browse grid's
 * geometry (shared adaptive column count and gutters, 2/3 covers, 60pt copy
 * block) so the skeleton hands off to the real cards without a layout jump.
 * Replaces the lone centered spinner on initial loads; subsequent pages keep
 * the footer's loading state.
 */
export function MobileSourceGridSkeleton({
  accessibilityLabel,
}: MobileSourceGridSkeletonProps) {
  const { tokens, reduceMotion } = useNemuTheme();
  const { width: windowWidth } = useWindowDimensions();
  const skeletonOpacity = useSkeletonPulse(reduceMotion === true);
  const skeletonReady = useSkeletonDisplayDelay(150);
  const skeletonColor = tokens.muted;
  const { cardWidth, columnCount } = getMobileSourceGridSkeletonGeometry({
    windowWidth,
  });

  if (!skeletonReady) return null;

  return (
    <Animated.View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="progressbar"
      style={[styles.grid, { opacity: skeletonOpacity }]}
    >
      {Array.from(
        { length: MOBILE_SOURCE_GRID_SKELETON_ROWS * columnCount },
        (_, card) => (
          <View key={card} style={{ width: cardWidth }}>
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
        ),
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    // Shared with the browse grid's `gridRow` gutters.
    gap: MOBILE_MANGA_GRID_GAP,
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
