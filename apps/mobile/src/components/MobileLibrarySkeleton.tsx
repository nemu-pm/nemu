import { StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";
import {
  createNemuShadowStyle,
  radius,
  useNemuTheme,
} from "@/design-system";
import {
  useSkeletonDisplayDelay,
  useSkeletonPulse,
} from "@/lib/useSkeletonPulse";

const SKELETON_ITEMS = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const;

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
  const { tokens, reduceMotion } = useNemuTheme();
  const skeletonOpacity = useSkeletonPulse(reduceMotion === true);
  const displayReady = useSkeletonDisplayDelay(150);
  const skeletonColor = tokens.muted;
  const subtleSkeletonColor = tokens.sourceIconGlass;

  if (!displayReady) return null;

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="progressbar"
      style={styles.stack}
    >
      <View style={styles.grid}>
        {SKELETON_ITEMS.map((item) => (
          <View key={item} style={styles.gridItem}>
            <Animated.View
              style={[
                styles.cover,
                styles.pulsing,
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
                  styles.pulsing,
                  { backgroundColor: skeletonColor, opacity: skeletonOpacity },
                ]}
              />
              <Animated.View
                style={[
                  styles.subtitleLine,
                  styles.pulsing,
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
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 16,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  gridItem: {
    width: "31.5%",
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
    height: 17,
    width: "88%",
    borderRadius: radius.sm,
  },
  subtitleLine: {
    height: 15,
    width: "62%",
    marginTop: 6,
    borderRadius: radius.sm,
  },
  pulsing: {
    opacity: 0.78,
  },
});
