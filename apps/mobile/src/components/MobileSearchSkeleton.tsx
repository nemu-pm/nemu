import { StyleSheet, View } from "react-native";
import {
  createNemuShadowStyle,
  radius,
  useNemuTheme,
  GlassSurface,
} from "@/design-system";

const SKELETON_CHIPS = [0, 1, 2, 3] as const;
const SKELETON_SECTIONS = [0, 1] as const;
const SKELETON_RESULTS = [0, 1, 2] as const;

type MobileSearchSkeletonProps = {
  accessibilityLabel: string;
};

export function MobileSearchSkeleton({
  accessibilityLabel,
}: MobileSearchSkeletonProps) {
  const { tokens } = useNemuTheme();
  const skeletonColor = tokens.muted;
  const subtleSkeletonColor = tokens.sourceIconGlass;

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="progressbar"
      style={styles.stack}
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
        <View style={styles.chipRow}>
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

      <View style={styles.resultStack}>
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
              {SKELETON_RESULTS.map((item) => (
                <View key={item} style={styles.resultItem}>
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
                  <View
                    style={[styles.titleLine, { backgroundColor: skeletonColor }]}
                  />
                  <View
                    style={[
                      styles.subtitleLine,
                      { backgroundColor: subtleSkeletonColor },
                    ]}
                  />
                </View>
              ))}
            </View>
          </View>
        ))}
      </View>
    </View>
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
    opacity: 0.78,
  },
  searchLine: {
    flex: 1,
    height: 16,
    borderRadius: radius.sm,
    opacity: 0.78,
  },
  filterBlock: {
    gap: 10,
  },
  filterLabel: {
    alignSelf: "center",
    width: 118,
    height: 12,
    borderRadius: radius.sm,
    opacity: 0.78,
  },
  chipRow: {
    flexDirection: "row",
    gap: 8,
    marginHorizontal: -18,
    paddingHorizontal: 18,
  },
  chip: {
    width: 94,
    height: 34,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    opacity: 0.78,
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
    opacity: 0.82,
  },
  resultTitle: {
    flex: 1,
    height: 16,
    borderRadius: radius.sm,
    opacity: 0.78,
  },
  countBadge: {
    width: 32,
    height: 24,
    borderRadius: radius.md,
    opacity: 0.72,
  },
  resultsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  resultItem: {
    width: "31.5%",
  },
  cover: {
    aspectRatio: 2 / 3,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    opacity: 0.78,
  },
  titleLine: {
    height: 13,
    marginTop: 8,
    borderRadius: radius.sm,
    opacity: 0.78,
  },
  subtitleLine: {
    width: "72%",
    height: 11,
    marginTop: 5,
    borderRadius: radius.sm,
    opacity: 0.72,
  },
});
