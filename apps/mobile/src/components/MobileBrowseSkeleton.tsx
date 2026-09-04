import { StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";
import {
  SKELETON_LINE_OPACITY,
  SKELETON_SUBTLE_LINE_OPACITY,
  SKELETON_SURFACE_OPACITY,
  useSkeletonDisplayDelay,
  useSkeletonPulse,
} from "@/lib/useSkeletonPulse";
import { radius, useNemuTheme } from "@/design-system";
import { resolveSourceCardVisuals } from "@/lib/mobileSourceCardVisuals";

const SKELETON_SECTIONS = [0, 1] as const;
const SKELETON_CARDS = [0, 1, 2] as const;

type MobileBrowseSkeletonProps = {
  accessibilityLabel: string;
};

export function MobileBrowseSkeleton({
  accessibilityLabel,
}: MobileBrowseSkeletonProps) {
  const { scheme, reduceMotion } = useNemuTheme();
  const skeletonOpacity = useSkeletonPulse(reduceMotion === true);
  const skeletonReady = useSkeletonDisplayDelay(150);
  const visuals = resolveSourceCardVisuals(scheme);
  const skeletonColor = visuals.skeletonBlock;

  if (!skeletonReady) return null;

  return (
    <Animated.View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="progressbar"
      style={[styles.stack, { opacity: skeletonOpacity }]}
    >
      {SKELETON_SECTIONS.map((section) => (
        <View key={section} style={styles.section}>
          <View
            style={[styles.sectionTitle, { backgroundColor: skeletonColor }]}
          />
          <View style={styles.list}>
            {SKELETON_CARDS.map((card) => (
              <View
                key={card}
                style={[
                  styles.card,
                  {
                    backgroundColor: visuals.cardBackground,
                    borderColor: visuals.cardBorder,
                  },
                  visuals.cardShadow,
                ]}
              >
                <View
                  style={[
                    styles.icon,
                    {
                      backgroundColor: visuals.iconBackground,
                      borderColor: visuals.iconBorder,
                    },
                  ]}
                />
                <View style={styles.copy}>
                  <View
                    style={[
                      styles.titleLine,
                      { backgroundColor: skeletonColor },
                    ]}
                  />
                  <View
                    style={[
                      styles.subtitleLine,
                      { backgroundColor: skeletonColor },
                    ]}
                  />
                </View>
              </View>
            ))}
          </View>
        </View>
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 26,
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    width: 108,
    height: 14,
    borderRadius: radius.sm,
    opacity: SKELETON_LINE_OPACITY,
  },
  list: {
    gap: 12,
  },
  card: {
    minHeight: 84,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
  },
  icon: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    opacity: SKELETON_SURFACE_OPACITY,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 8,
  },
  titleLine: {
    width: "64%",
    height: 16,
    borderRadius: radius.sm,
    opacity: SKELETON_LINE_OPACITY,
  },
  subtitleLine: {
    width: "42%",
    height: 12,
    borderRadius: radius.sm,
    opacity: SKELETON_SUBTLE_LINE_OPACITY,
  },
});
