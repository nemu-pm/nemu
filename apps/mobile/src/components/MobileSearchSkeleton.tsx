import { StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";
import {
  useSkeletonDisplayDelay,
  useSkeletonPulse,
} from "@/lib/useSkeletonPulse";
import {
  createNemuShadowStyle,
  radius,
  useMobilePageBleedStyles,
  useNemuTheme,
  GlassSurface,
} from "@/design-system";
import { mobileFoldAwareGridCellStyle } from "@/lib/mobileFoldAwareGrid";
import { useMobileFoldAwareGrid } from "@/lib/useMobileFoldAwareGrid";

const SKELETON_CHIPS = [0, 1, 2, 3] as const;
const SKELETON_SECTIONS = [0, 1] as const;
const NO_INSETS = { left: 0, right: 0 };

type MobileSearchSkeletonProps = {
  accessibilityLabel: string;
};

export function MobileSearchSkeleton({
  accessibilityLabel,
}: MobileSearchSkeletonProps) {
  const { tokens, reduceMotion } = useNemuTheme();
  // Mirrors the Search tab's source chip row bleed (2pt overscan).
  const bleed = useMobilePageBleedStyles(2);
  // Same fold-aware grid as the Search results (one row of covers per source
  // section): even columns on regular widths and, in book posture, the middle
  // gutter on the fold. The skeleton already sits inside the page gutters.
  // Refs stay out of the layout object read during render.
  const { ref: gridRef, onLayout: onGridLayout, ...resultGrid } = useMobileFoldAwareGrid({ insets: NO_INSETS });
  const skeletonOpacity = useSkeletonPulse(reduceMotion === true);
  const skeletonReady = useSkeletonDisplayDelay(150);
  const skeletonColor = tokens.muted;
  const subtleSkeletonColor = tokens.sourceIconGlass;

  if (!skeletonReady) return null;

  return (
    <Animated.View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="progressbar"
      style={[styles.stack, { opacity: skeletonOpacity }]}
    >
      <GlassSurface style={styles.searchShell} contentStyle={styles.searchContent}>
        <View
          style={[styles.searchIcon, { backgroundColor: subtleSkeletonColor }]}
        />
        <View
          style={[styles.searchLine, { backgroundColor: skeletonColor }]}
        />
      </GlassSurface>

      <View style={styles.filterBlock}>
        <View
          style={[styles.filterLabel, { backgroundColor: skeletonColor }]}
        />
        <View style={[styles.chipRow, bleed.frame, bleed.content]}>
          {SKELETON_CHIPS.map((chip) => (
            <View
              key={chip}
              style={[
                styles.chip,
                {
                  backgroundColor: chip === 0 ? skeletonColor : subtleSkeletonColor,
                  borderColor: tokens.border,
                },
              ]}
            />
          ))}
        </View>
      </View>

      <View
        ref={gridRef}
        onLayout={onGridLayout}
        collapsable={false}
        style={styles.resultStack}
      >
        {SKELETON_SECTIONS.map((section) => (
          <View key={section} style={styles.resultSection}>
            <View style={styles.resultHeader}>
              <View
                style={[
                  styles.sourceIcon,
                  {
                    backgroundColor: subtleSkeletonColor,
                    borderColor: tokens.border,
                  },
                ]}
              />
              <View
                style={[styles.resultTitle, { backgroundColor: skeletonColor }]}
              />
              <View
                style={[styles.countBadge, { backgroundColor: skeletonColor }]}
              />
            </View>
            <View style={styles.resultsGrid}>
              {Array.from({ length: resultGrid.columns }, (_, item) => (
                <View key={item} style={mobileFoldAwareGridCellStyle(resultGrid, item)}>
                  <View
                    style={[
                      styles.cover,
                      {
                        backgroundColor: skeletonColor,
                        borderColor: tokens.coverBorder,
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
                    <View
                      style={[
                        styles.titleLine,
                        { backgroundColor: skeletonColor },
                      ]}
                    />
                    <View
                      style={[
                        styles.titleLine,
                        styles.titleLineSecond,
                        { backgroundColor: skeletonColor },
                      ]}
                    />
                    <View
                      style={[
                        styles.subtitleLine,
                        { backgroundColor: subtleSkeletonColor },
                      ]}
                    />
                  </View>
                </View>
              ))}
            </View>
          </View>
        ))}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 14,
  },
  searchShell: {
    minHeight: 52,
    borderRadius: radius.xl,
  },
  searchContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
  },
  searchIcon: {
    width: 20,
    height: 20,
    borderRadius: radius.sm,
  },
  searchLine: {
    flex: 1,
    height: 16,
    borderRadius: radius.sm,
  },
  filterBlock: {
    gap: 10,
  },
  filterLabel: {
    alignSelf: "center",
    width: 118,
    height: 12,
    borderRadius: radius.sm,
  },
  chipRow: {
    flexDirection: "row",
    gap: 8,
  },
  chip: {
    width: 94,
    // Search filter chips are 30pt pills; the skeleton matches that shape.
    height: 30,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  resultStack: {
    gap: 18,
  },
  resultSection: {
    gap: 10,
  },
  resultHeader: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  sourceIcon: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
  },
  resultTitle: {
    flex: 1,
    height: 16,
    borderRadius: radius.sm,
  },
  countBadge: {
    width: 32,
    height: 24,
    borderRadius: radius.md,
  },
  // Column spacing is each cell's marginLeft (mobileFoldAwareGridCellStyle).
  resultsGrid: {
    flexDirection: "row",
  },
  cover: {
    aspectRatio: 2 / 3,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  textBlock: {
    // Mirrors MangaCard's reserved 60pt copy block.
    minHeight: 60,
    marginTop: 8,
    paddingHorizontal: 2,
  },
  titleLine: {
    height: 13,
    width: "92%",
    borderRadius: radius.sm,
  },
  titleLineSecond: {
    width: "60%",
    marginTop: 4,
  },
  subtitleLine: {
    width: "45%",
    height: 12,
    marginTop: 6,
    borderRadius: radius.sm,
  },
});
