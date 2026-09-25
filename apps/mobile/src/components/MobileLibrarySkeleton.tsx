import { StyleSheet, View, useWindowDimensions } from "react-native";
import Animated from "react-native-reanimated";
import {
  createNemuShadowStyle,
  radius,
  useMobilePageGutters,
  useNemuTheme,
} from "@/design-system";
import {
  getMobileMangaGridSkeletonGeometry,
  MOBILE_MANGA_GRID_GAP,
} from "@/lib/mobileAdaptiveGrid";
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
  const { tokens, reduceMotion } = useNemuTheme();
  const { width: windowWidth } = useWindowDimensions();
  const pageGutters = useMobilePageGutters();
  // Same inset-aware adaptive columns as the library grid, so the skeleton
  // hands off without a reflow (3 on a portrait phone, 6 in landscape).
  const { cardCount, cardWidth } = getMobileMangaGridSkeletonGeometry({
    windowWidth,
    horizontalPadding: pageGutters.horizontal,
    rows: SKELETON_ROWS,
  });
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
        {Array.from({ length: cardCount }, (_, item) => (
          <View key={item} style={{ width: cardWidth }}>
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
    gap: MOBILE_MANGA_GRID_GAP,
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
