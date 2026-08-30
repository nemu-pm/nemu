import { StyleSheet, useWindowDimensions, View } from "react-native";
import {
  createNemuShadowStyle,
  radius,
  useNemuTheme,
  GlassSurface,
} from "@/design-system";

const SKELETON_TAGS = [0, 1, 2, 3, 4] as const;
const SKELETON_CHAPTERS = [0, 1, 2, 3, 4, 5] as const;

type MobileMangaPageSkeletonActionsPlacement = "below" | "copy";

type MobileMangaPageSkeletonProps = {
  accessibilityLabel: string;
  actionsPlacement?: MobileMangaPageSkeletonActionsPlacement;
};

export function MobileMangaPageSkeleton({
  accessibilityLabel,
  actionsPlacement = "below",
}: MobileMangaPageSkeletonProps) {
  const { tokens } = useNemuTheme();
  const { width } = useWindowDimensions();
  const skeletonColor = tokens.muted;
  const subtleSkeletonColor = tokens.sourceIconGlass;
  const coverWidth = Math.max(92, Math.min(112, Math.floor((width - 72) * 0.32)));
  const coverHeight = coverWidth * (3 / 2);
  const actionSkeleton = (
    <View
      style={[
        styles.actionRow,
        actionsPlacement === "copy" ? styles.actionRowInCopy : null,
      ]}
    >
      <View
        style={[
          styles.primaryAction,
          { backgroundColor: skeletonColor, opacity: 0.78 },
        ]}
      />
      <View
        style={[
          styles.secondaryAction,
          { backgroundColor: skeletonColor, opacity: 0.72 },
        ]}
      />
    </View>
  );

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="progressbar"
      style={styles.stack}
    >
      <GlassSurface style={styles.heroShell} contentStyle={styles.hero}>
        <View style={styles.heroInfoRow}>
          <View style={[styles.coverFrame, { width: coverWidth }]}>
            <View
              style={[
                styles.cover,
                {
                  width: coverWidth,
                  backgroundColor: skeletonColor,
                  borderColor: tokens.coverBorder,
                  ...createNemuShadowStyle({
                    color: tokens.shadow,
                    offsetY: 6,
                    radius: 18,
                    elevation: 6,
                  }),
                },
              ]}
            />
          </View>
          <View style={styles.copy}>
            <View
              style={[
                styles.copyBody,
                actionsPlacement === "copy" ? { height: coverHeight } : null,
              ]}
            >
              <View style={styles.copyMain}>
                <View
                  style={[
                    styles.titleLine,
                    { backgroundColor: skeletonColor },
                  ]}
                />
                <View
                  style={[
                    styles.authorLine,
                    { backgroundColor: subtleSkeletonColor },
                  ]}
                />
              </View>
              {actionsPlacement === "copy" ? (
                <>
                  <View style={styles.copyBodySpacer} />
                  {actionSkeleton}
                </>
              ) : null}
            </View>
          </View>
        </View>

        {actionsPlacement === "below" ? actionSkeleton : null}

        <View style={styles.tagRow}>
          {SKELETON_TAGS.map((item) => (
            <View
              key={item}
              style={[styles.tag, { backgroundColor: skeletonColor }]}
            />
          ))}
        </View>

        <View style={styles.description}>
          <View
            style={[
              styles.descriptionLine,
              { backgroundColor: skeletonColor },
            ]}
          />
          <View
            style={[
              styles.descriptionLine,
              { backgroundColor: skeletonColor },
            ]}
          />
          <View
            style={[
              styles.descriptionLineShort,
              { backgroundColor: subtleSkeletonColor },
            ]}
          />
        </View>
      </GlassSurface>

      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <View
            style={[
              styles.sectionTitle,
              { backgroundColor: skeletonColor },
            ]}
          />
          <View
            style={[styles.statPill, { backgroundColor: skeletonColor }]}
          />
        </View>
        <View style={styles.chapterList}>
          {SKELETON_CHAPTERS.map((item) => (
            <View
              key={item}
              style={[
                styles.chapterRow,
                {
                  backgroundColor: skeletonColor,
                  borderColor: tokens.border,
                  opacity: 0.7,
                },
              ]}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 18,
  },
  heroShell: {
    borderRadius: radius.xl,
  },
  hero: {
    gap: 14,
    padding: 14,
  },
  heroInfoRow: {
    flexDirection: "row",
    gap: 14,
    alignItems: "flex-start",
  },
  coverFrame: {
    flexShrink: 0,
    alignItems: "center",
    paddingBottom: 14,
  },
  cover: {
    aspectRatio: 2 / 3,
    overflow: "hidden",
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  copy: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  copyBody: {
    gap: 8,
  },
  copyBodySpacer: {
    flex: 1,
    minHeight: 0,
  },
  copyMain: {
    gap: 8,
    flexShrink: 1,
  },
  titleLine: {
    width: "82%",
    height: 26,
    borderRadius: radius.sm,
    opacity: 0.78,
  },
  authorLine: {
    width: "48%",
    height: 16,
    borderRadius: radius.sm,
    opacity: 0.72,
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tag: {
    width: 64,
    height: 28,
    borderRadius: radius.md,
    opacity: 0.72,
  },
  description: {
    gap: 7,
  },
  descriptionLine: {
    width: "100%",
    height: 12,
    borderRadius: radius.sm,
    opacity: 0.72,
  },
  descriptionLineShort: {
    width: "62%",
    height: 12,
    borderRadius: radius.sm,
    opacity: 0.68,
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    alignItems: "center",
  },
  actionRowInCopy: {
    flexWrap: "nowrap",
    alignSelf: "stretch",
  },
  primaryAction: {
    minHeight: 36,
    flex: 1,
    minWidth: 0,
    borderRadius: 999,
  },
  secondaryAction: {
    width: 36,
    height: 36,
    borderRadius: 999,
  },
  section: {
    gap: 10,
  },
  sectionHeaderRow: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  sectionTitle: {
    width: 92,
    height: 16,
    borderRadius: radius.sm,
    opacity: 0.78,
  },
  statPill: {
    width: 72,
    height: 28,
    borderRadius: radius.md,
    opacity: 0.72,
  },
  chapterList: {
    gap: 9,
  },
  chapterRow: {
    minHeight: 62,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
