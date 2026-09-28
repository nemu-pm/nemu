import { useState, type ReactNode } from "react";
import { Platform, StyleSheet, useWindowDimensions, View } from "react-native";
import Animated from "react-native-reanimated";
import {
  useSkeletonDisplayDelay,
  useSkeletonPulse,
} from "@/lib/useSkeletonPulse";
import {
  createNemuShadowStyle,
  getNemuButtonMinimumTargetSize,
  radius,
  useNemuTheme,
  GlassSurface,
} from "@/design-system";
import { MobileMangaDetailSplitLayout } from "@/components/MobileMangaDetailSplitLayout";
import { getMobileMangaDetailHeroLayout } from "@/lib/mobileDynamicTypeLayout";
import { MOBILE_MANGA_DETAIL_PRIMARY_ACTION_MAX_WIDTH } from "@/lib/mobileMangaDetailPresentation";
import {
  getMobileDetailBaseCoverWidth,
  getMobileDetailHeroCopyLayout,
  MOBILE_DETAIL_HERO_METRICS,
} from "@/lib/mobileMangaDetailTagLayout";

/** Pill widths of the single, height-capped tag row (design A). */
const SKELETON_TAG_WIDTHS = [64, 52, 76, 58] as const;
const SKELETON_CHAPTERS = [0, 1, 2, 3, 4, 5] as const;
const NO_ROWS: never[] = [];
const renderNothing = () => null;

type MobileMangaPageSkeletonActionsPlacement = "below" | "copy";

type MobileMangaPageSkeletonProps = {
  accessibilityLabel: string;
  actionsPlacement?: MobileMangaPageSkeletonActionsPlacement;
  nativeHeader?: boolean;
  /** Screen-drawn page header (when the native header is off); leads the info pane. */
  header?: ReactNode;
};

/**
 * Whole-page loading state for manga detail. It is laid out by the same
 * `MobileMangaDetailSplitLayout` as the loaded page — one list on compact
 * widths, info pane + chapter pane on regular widths and in book posture — and
 * its hero mirrors design A (MobileMangaDetailSurface): cover on the left, the
 * copy column pinned to the cover height with title, authors, ONE capped row of
 * tag pills, and the actions on the cover's bottom edge. So the page hands off
 * without its panes or the Read button moving.
 */
export function MobileMangaPageSkeleton({
  accessibilityLabel,
  actionsPlacement = "copy",
  nativeHeader = true,
  header,
}: MobileMangaPageSkeletonProps) {
  const { tokens, reduceMotion } = useNemuTheme();
  const skeletonOpacity = useSkeletonPulse(reduceMotion === true);
  const skeletonReady = useSkeletonDisplayDelay(150);
  const skeletonColor = tokens.muted;

  return (
    <MobileMangaDetailSplitLayout
      nativeHeader={nativeHeader}
      data={NO_ROWS}
      renderItem={renderNothing}
      leading={
        <>
          {header}
          {skeletonReady ? (
            <Animated.View
              accessibilityLabel={accessibilityLabel}
              accessibilityRole="progressbar"
              style={{ opacity: skeletonOpacity }}
            >
              <MangaHeroSkeleton actionsPlacement={actionsPlacement} />
            </Animated.View>
          ) : null}
        </>
      }
      chapterHeader={
        skeletonReady ? (
          // One progress element for the page; the chapter placeholders are decorative.
          <Animated.View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[styles.section, { opacity: skeletonOpacity }]}
          >
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
                <View key={item} style={styles.chapterSlot}>
                  <View
                    style={[
                      styles.chapterCell,
                      {
                        backgroundColor: skeletonColor,
                        borderColor: tokens.border,
                      },
                    ]}
                  />
                </View>
              ))}
            </View>
          </Animated.View>
        ) : null
      }
    />
  );
}

/** Design A hero with the loaded surface's geometry rules (same helpers). */
function MangaHeroSkeleton({
  actionsPlacement,
}: {
  actionsPlacement: MobileMangaPageSkeletonActionsPlacement;
}) {
  const { tokens } = useNemuTheme();
  const { fontScale, width: windowWidth } = useWindowDimensions();
  const minimumTouchTarget = getNemuButtonMinimumTargetSize(Platform.OS);
  // Lay out from the hero's own width (a split pane is narrower than the window).
  const [rowWidth, setRowWidth] = useState(0);
  const surfaceWidth = rowWidth > 0 ? rowWidth : Math.max(0, windowWidth - 60);
  const compact = surfaceWidth < MOBILE_DETAIL_HERO_METRICS.compactRowWidth;
  const heroLayout = getMobileMangaDetailHeroLayout({
    fontScale,
    compact,
    requestedActionsPlacement: actionsPlacement,
  });
  const stacked = heroLayout.stacked;
  const actionsInCopy = !stacked && heroLayout.actionsPlacement === "copy";
  const copyLayout = getMobileDetailHeroCopyLayout({
    surfaceWidth,
    fontScale,
    compact,
    hasAuthors: true,
    hasTagRow: true,
    hasActions: actionsInCopy,
    maxTitleLines: heroLayout.titleLines ?? 3,
    minimumTouchTarget,
  });
  const coverWidth = stacked ? getMobileDetailBaseCoverWidth(surfaceWidth) : copyLayout.coverWidth;
  const coverHeight = stacked ? coverWidth * 1.5 : copyLayout.coverHeight;
  const skeletonColor = tokens.muted;
  const subtleSkeletonColor = tokens.sourceIconGlass;

  const actionSkeleton = (
    <View style={[styles.actionRow, actionsInCopy ? styles.actionRowInCopy : null]}>
      <View
        style={[
          styles.primaryAction,
          stacked ? styles.primaryActionFull : null,
          { backgroundColor: skeletonColor },
        ]}
      />
      <View
        style={[
          styles.secondaryAction,
          { backgroundColor: subtleSkeletonColor },
        ]}
      />
    </View>
  );
  const tagRow = (
    <View style={[styles.tagRow, stacked ? styles.tagRowWrapping : styles.tagRowSingleLine]}>
      {SKELETON_TAG_WIDTHS.map((width, index) => (
        <View
          key={index}
          style={[styles.tag, { width, backgroundColor: skeletonColor }]}
        />
      ))}
    </View>
  );

  return (
    <GlassSurface style={styles.heroShell} contentStyle={styles.hero}>
      <View
        onLayout={(event) => setRowWidth(event.nativeEvent.layout.width)}
        style={[
          styles.heroInfoRow,
          compact ? styles.heroInfoRowCompact : null,
          stacked ? styles.heroInfoRowStacked : null,
        ]}
      >
        <View
          style={[
            styles.coverFrame,
            { width: coverWidth },
            stacked ? styles.coverFrameStacked : null,
          ]}
        >
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
        <View
          style={[
            styles.copy,
            { gap: copyLayout.gap },
            stacked ? styles.copyStacked : { minHeight: coverHeight },
          ]}
        >
          <View style={[styles.copyTop, { gap: copyLayout.gap }]}>
            <View
              style={[
                styles.titleLine,
                compact ? styles.titleLineCompact : null,
                { backgroundColor: skeletonColor },
              ]}
            />
            <View
              style={[styles.authorLine, { backgroundColor: subtleSkeletonColor }]}
            />
          </View>
          {stacked ? tagRow : <View style={styles.copyMiddle}>{tagRow}</View>}
          {actionsInCopy ? actionSkeleton : null}
        </View>
      </View>

      {actionsInCopy ? null : actionSkeleton}

      <View style={styles.description}>
        <View
          style={[styles.descriptionLine, { backgroundColor: skeletonColor }]}
        />
        <View
          style={[styles.descriptionLine, { backgroundColor: skeletonColor }]}
        />
        <View
          style={[
            styles.descriptionLineShort,
            { backgroundColor: subtleSkeletonColor },
          ]}
        />
      </View>
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  // MobileMangaDetailSurface geometry.
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
  heroInfoRowCompact: {
    gap: 12,
  },
  heroInfoRowStacked: {
    flexDirection: "column",
    alignItems: "stretch",
  },
  coverFrame: {
    flexShrink: 0,
    alignItems: "center",
    paddingBottom: 14,
  },
  coverFrameStacked: {
    alignSelf: "center",
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
  copyStacked: {
    flex: 0,
    flexGrow: 0,
    flexBasis: "auto",
  },
  copyTop: {
    flexShrink: 1,
  },
  // Whatever the title leaves is the tag row's; the actions stay pinned to
  // the cover's bottom edge.
  copyMiddle: {
    flexGrow: 1,
    justifyContent: "center",
    minHeight: MOBILE_DETAIL_HERO_METRICS.chipHeight,
  },
  titleLine: {
    width: "82%",
    height: MOBILE_DETAIL_HERO_METRICS.titleLineHeight - 4,
    borderRadius: radius.sm,
  },
  titleLineCompact: {
    height: MOBILE_DETAIL_HERO_METRICS.compactTitleLineHeight - 4,
  },
  authorLine: {
    width: "48%",
    height: MOBILE_DETAIL_HERO_METRICS.authorLineHeight - 2,
    borderRadius: radius.sm,
  },
  tagRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  // One height-capped line, like the loaded row (its "+N" chip takes the rest).
  tagRowSingleLine: {
    flexWrap: "nowrap",
    height: MOBILE_DETAIL_HERO_METRICS.chipHeight,
    overflow: "hidden",
  },
  tagRowWrapping: {
    flexWrap: "wrap",
  },
  // The loaded row's 30pt static tag pills.
  tag: {
    flexShrink: 0,
    height: MOBILE_DETAIL_HERO_METRICS.chipHeight,
    borderRadius: radius.pill,
  },
  description: {
    gap: 7,
  },
  descriptionLine: {
    width: "100%",
    height: 12,
    borderRadius: radius.sm,
  },
  descriptionLineShort: {
    width: "62%",
    height: 12,
    borderRadius: radius.sm,
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    alignItems: "center",
  },
  // The loaded pill (not its touch frame) meets the cover's bottom edge.
  actionRowInCopy: {
    flexWrap: "nowrap",
    alignSelf: "stretch",
  },
  primaryAction: {
    height: MOBILE_DETAIL_HERO_METRICS.actionHeight,
    flex: 1,
    minWidth: 0,
    maxWidth: MOBILE_MANGA_DETAIL_PRIMARY_ACTION_MAX_WIDTH,
    borderRadius: radius.pill,
  },
  primaryActionFull: {
    flexBasis: "100%",
  },
  secondaryAction: {
    width: MOBILE_DETAIL_HERO_METRICS.actionHeight,
    height: MOBILE_DETAIL_HERO_METRICS.actionHeight,
    borderRadius: radius.pill,
  },
  section: {
    // Matches MobileMangaChapterSection's 16pt section rhythm.
    gap: 16,
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
  },
  statPill: {
    width: 72,
    height: 28,
    borderRadius: radius.md,
  },
  chapterList: {
    // MobileChapterGrid lays chapters out 2-up with an 8pt gap.
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chapterSlot: {
    flexGrow: 1,
    flexBasis: "48%",
    maxWidth: "48%",
  },
  chapterCell: {
    // MobileChapterCell geometry.
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
