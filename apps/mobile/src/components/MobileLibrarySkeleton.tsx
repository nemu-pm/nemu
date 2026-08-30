import { StyleSheet, View } from "react-native";
import { createNemuShadowStyle, radius, useNemuTheme } from "@/design-system";

const SKELETON_CHIPS = [0, 1, 2] as const;
const SKELETON_ITEMS = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const;

type MobileLibrarySkeletonProps = {
  accessibilityLabel: string;
};

export function MobileLibrarySkeleton({
  accessibilityLabel,
}: MobileLibrarySkeletonProps) {
  const { tokens } = useNemuTheme();
  const skeletonColor = tokens.muted;
  const subtleSkeletonColor = tokens.sourceIconGlass;

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="progressbar"
      style={styles.stack}
    >
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

      <View style={styles.grid}>
        {SKELETON_ITEMS.map((item) => (
          <View key={item} style={styles.gridItem}>
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
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 16,
  },
  chipRow: {
    flexDirection: "row",
    gap: 8,
    marginHorizontal: -18,
    paddingHorizontal: 18,
  },
  chip: {
    width: 112,
    height: 36,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    opacity: 0.78,
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
