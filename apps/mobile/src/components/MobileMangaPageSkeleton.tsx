import { useState, type ReactNode } from "react";
import { Platform, StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
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
  nemuMaxFontSizeMultiplier,
} from "@/design-system";
import { useMobileMangaDetailPane } from "@/components/MobileMangaDetailPaneContext";
import { MobileMangaDetailSplitLayout } from "@/components/MobileMangaDetailSplitLayout";
import { MobileMangaChapterSectionHeader } from "@/components/MobileMangaChapterSection";
import { MobileMangaDetailBooksHero } from "@/components/explore/MobileMangaDetailBooksHero";
import { useMobileLanguageSettings } from "@/data/mobileHooks";
import { mobileDesignExploreFlag } from "@/lib/mobileDesignExplore";
import { getMobileStrings } from "@/lib/mobileI18n";
import { getMobileMangaDetailHeroLayout } from "@/lib/mobileDynamicTypeLayout";
import { MOBILE_MANGA_DETAIL_PRIMARY_ACTION_MAX_WIDTH } from "@/lib/mobileMangaDetailPresentation";
import {
  getMobileChapterSectionRhythm,
  getMobileDetailPaneCoverWidth,
  MOBILE_DETAIL_PANE_METRICS,
} from "@/lib/mobileMangaDetailPaneLayout";
import {
  getMobileDetailBaseCoverWidth,
  getMobileDetailHeroCopyLayout,
  MOBILE_DETAIL_HERO_METRICS,
} from "@/lib/mobileMangaDetailTagLayout";

/** Pill widths of the single, height-capped tag row (design A). */
const SKELETON_TAG_WIDTHS = [64, 52, 76, 58] as const;
const SKELETON_CHAPTER_ROWS = [0, 1, 2] as const;
const SKELETON_CHAPTER_COLUMNS = [0, 1] as const;
/** The info pane's full description, sketched. */
const SKELETON_PANE_DESCRIPTION_LINES = 5;
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
  const { reduceMotion } = useNemuTheme();
  const skeletonOpacity = useSkeletonPulse(reduceMotion === true);
  const skeletonReady = useSkeletonDisplayDelay(150);

  if (mobileDesignExploreFlag) {
    return (
      <MobileMangaDetailSplitLayout
        nativeHeader={nativeHeader}
        data={NO_ROWS}
        renderItem={renderNothing}
        leading={
          <>
            {header}
            {skeletonReady ? <BooksHeroSkeleton accessibilityLabel={accessibilityLabel} /> : null}
          </>
        }
        chapterHeader={skeletonReady ? <ExploreChapterSectionSkeleton /> : null}
      />
    );
  }

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
          <ChapterSectionSkeleton opacity={skeletonOpacity} />
        ) : null
      }
    />
  );
}

/**
 * New design: the Books hero itself in its placeholder mode (its own cover
 * size, blocks and gaps), so the loaded hero lands on the same geometry.
 */
function BooksHeroSkeleton({ accessibilityLabel }: { accessibilityLabel: string }) {
  const strings = getMobileStrings(useMobileLanguageSettings().appLanguage);
  const pane = useMobileMangaDetailPane().role === "leading";
  return (
    <View accessible accessibilityLabel={accessibilityLabel} accessibilityRole="progressbar">
      <MobileMangaDetailBooksHero placeholder title="" badges={[]} pane={pane} strings={strings} />
    </View>
  );
}

/** The loaded page's chapters header (aligned to its menu pill's row) over flat placeholder rows. */
function ExploreChapterSectionSkeleton() {
  const strings = getMobileStrings(useMobileLanguageSettings().appLanguage);
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <MobileMangaChapterSectionHeader
        title={strings.mangaDetail.chapters}
        alignedControl
        hasChapters={false}
        loading
        emptyTitle=""
        loadingPlaceholder={<ExploreChapterRowsSkeleton rows={6} />}
      />
    </View>
  );
}

/** MobileExploreChapterRow's geometry (marker column, text column, rule), pulsing. */
function ExploreChapterRowsSkeleton({ rows }: { rows: number }) {
  const { reduceMotion, tokens } = useNemuTheme();
  const opacity = useSkeletonPulse(reduceMotion === true);
  const { wideChapterRows: wide } = useMobileMangaDetailPane();
  const fill = { backgroundColor: tokens.muted };
  return (
    <Animated.View style={{ opacity }}>
      {Array.from({ length: rows }, (_, row) => (
        <View key={row} style={[styles.exploreRow, wide ? styles.exploreRowWide : null]}>
          <View style={styles.exploreGlyph}>
            <View style={[styles.exploreDot, fill]} />
          </View>
          <View style={[styles.exploreText, { borderBottomColor: tokens.border }]}>
            <View style={[styles.exploreBody, wide ? styles.exploreBodyWide : null]}>
              <View style={[styles.exploreTitleLine, wide ? styles.exploreFlex : null]}>
                <View style={[styles.exploreBar, fill, { width: wide ? "40%" : "46%", height: 14 }]} />
              </View>
              {wide ? null : (
                <View style={styles.exploreSubtitleLine}>
                  <View style={[styles.exploreBar, fill, { width: "30%", height: 10 }]} />
                </View>
              )}
            </View>
            <View style={[styles.exploreTrail, wide ? styles.exploreTrailWide : null]} />
          </View>
        </View>
      ))}
    </Animated.View>
  );
}

/** MobileMangaChapterSection's header + 2-up grid, with the same rhythm. */
function ChapterSectionSkeleton({
  opacity,
}: {
  opacity: ReturnType<typeof useSkeletonPulse>;
}) {
  const { tokens } = useNemuTheme();
  const skeletonColor = tokens.muted;
  const { regularWidth } = useMobileMangaDetailPane();
  const rhythm = getMobileChapterSectionRhythm({
    regularWidth,
    minimumTouchTarget: getNemuButtonMinimumTargetSize(Platform.OS),
  });
  return (
    // One progress element for the page; the chapter placeholders are decorative.
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ gap: rhythm.firstRowGap, opacity }}
    >
      <View style={[styles.sectionHeaderRow, { minHeight: rhythm.headerRowHeight }]}>
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
      <ChapterCellsSkeleton rows={SKELETON_CHAPTER_ROWS.length} />
    </Animated.View>
  );
}

/** The 2-up chapter grid's cells (MobileChapterCell geometry), unanimated. */
function ChapterCellsSkeleton({ rows }: { rows: number }) {
  const { tokens } = useNemuTheme();
  const { regularWidth } = useMobileMangaDetailPane();
  const rhythm = getMobileChapterSectionRhythm({
    regularWidth,
    minimumTouchTarget: getNemuButtonMinimumTargetSize(Platform.OS),
  });
  return (
    <View style={{ gap: rhythm.rowGap }}>
      {Array.from({ length: rows }, (_, row) => (
        <View key={row} style={styles.chapterRow}>
          {SKELETON_CHAPTER_COLUMNS.map((column) => (
            <View key={column} style={styles.chapterSlot}>
              <View
                style={[
                  styles.chapterCell,
                  {
                    backgroundColor: tokens.muted,
                    borderColor: tokens.border,
                  },
                ]}
              />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

/**
 * Chapter rows still on their way (a first-ever open, nothing cached): the
 * loaded grid's cells in place, so the real rows replace them without the
 * list moving. Shown inside the chapter section header, whose section gap
 * equals the gap before the first real row.
 */
export function MobileChapterGridSkeleton({
  accessibilityLabel,
  caption,
  rows = 6,
}: {
  accessibilityLabel: string;
  /** Optional line over the cells (e.g. the source is slow). */
  caption?: string | null;
  rows?: number;
}) {
  const { reduceMotion, tokens } = useNemuTheme();
  const opacity = useSkeletonPulse(reduceMotion === true);
  // Most loads finish before a skeleton would even register; showing it for
  // a few frames only flickers.
  const ready = useSkeletonDisplayDelay(150);
  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="progressbar"
      style={styles.gridSkeleton}
    >
      {caption ? (
        // Above the cells, so it is on screen however tall the grid is.
        <Animated.Text
          entering={reduceMotion ? undefined : FadeIn.duration(220)}
          maxFontSizeMultiplier={nemuMaxFontSizeMultiplier}
          style={[styles.gridSkeletonCaption, { color: tokens.mutedForeground }]}
        >
          {caption}
        </Animated.Text>
      ) : null}
      {mobileDesignExploreFlag ? (
        // The new design's chapter list is flat rows, not the 2-up grid.
        ready ? <ExploreChapterRowsSkeleton rows={rows} /> : null
      ) : (
        <Animated.View style={{ opacity: ready ? opacity : 0 }}>
          <ChapterCellsSkeleton rows={rows} />
        </Animated.View>
      )}
    </View>
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
  // The regular-width info pane's hero (no card, larger cover, tags and the
  // description below the hero row), like the loaded surface.
  const paneMode = useMobileMangaDetailPane().role === "leading";
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
    hasTagRow: !paneMode,
    hasActions: actionsInCopy,
    // The pane's taller cover leaves room for a fourth title line.
    maxTitleLines: paneMode
      ? Math.max(MOBILE_DETAIL_PANE_METRICS.maxTitleLines, heroLayout.titleLines ?? 0)
      : heroLayout.titleLines ?? 3,
    minimumTouchTarget,
    baseCoverWidth: paneMode ? getMobileDetailPaneCoverWidth(surfaceWidth) : undefined,
  });
  const coverWidth = stacked
    ? paneMode
      ? getMobileDetailPaneCoverWidth(surfaceWidth)
      : getMobileDetailBaseCoverWidth(surfaceWidth)
    : copyLayout.coverWidth;
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
    <View
      style={[
        styles.tagRow,
        stacked || paneMode ? styles.tagRowWrapping : styles.tagRowSingleLine,
      ]}
    >
      {SKELETON_TAG_WIDTHS.map((width, index) => (
        <View
          key={index}
          style={[styles.tag, { width, backgroundColor: skeletonColor }]}
        />
      ))}
    </View>
  );

  const content = (
    <>
      <View
        onLayout={(event) => setRowWidth(event.nativeEvent.layout.width)}
        style={[
          styles.heroInfoRow,
          compact ? styles.heroInfoRowCompact : null,
          paneMode ? styles.heroInfoRowPane : null,
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
            paneMode && !stacked ? styles.copyPane : null,
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
          {paneMode ? null : stacked ? tagRow : <View style={styles.copyMiddle}>{tagRow}</View>}
          {actionsInCopy ? actionSkeleton : null}
        </View>
      </View>

      {actionsInCopy ? null : actionSkeleton}

      {paneMode ? tagRow : null}

      <View style={styles.description}>
        {Array.from(
          { length: paneMode ? SKELETON_PANE_DESCRIPTION_LINES - 1 : 2 },
          (_, index) => (
            <View
              key={index}
              style={[styles.descriptionLine, { backgroundColor: skeletonColor }]}
            />
          ),
        )}
        <View
          style={[
            styles.descriptionLineShort,
            { backgroundColor: subtleSkeletonColor },
          ]}
        />
      </View>
    </>
  );

  return paneMode ? (
    <View style={styles.paneHero}>{content}</View>
  ) : (
    <GlassSurface style={styles.heroShell} contentStyle={styles.hero}>
      {content}
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  // MobileExploreChapterRow geometry.
  exploreRow: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "stretch",
  },
  exploreRowWide: {
    minHeight: 44,
  },
  exploreGlyph: {
    width: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  exploreDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  exploreText: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 9,
    paddingRight: 10,
    marginLeft: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  exploreBody: {
    flex: 1,
    minWidth: 0,
  },
  exploreBodyWide: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
  },
  exploreFlex: {
    flex: 1,
  },
  exploreTitleLine: {
    height: 21,
    justifyContent: "center",
  },
  exploreSubtitleLine: {
    marginTop: 1,
    height: 17,
    justifyContent: "center",
  },
  exploreBar: {
    borderRadius: radius.sm,
  },
  exploreTrail: {
    width: 32,
    height: 40,
  },
  exploreTrailWide: {
    height: 26,
  },
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
  heroInfoRowPane: {
    gap: MOBILE_DETAIL_PANE_METRICS.heroRowGap,
  },
  paneHero: {
    gap: MOBILE_DETAIL_PANE_METRICS.blockGap,
  },
  copyPane: {
    justifyContent: "space-between",
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
  sectionHeaderRow: {
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
  // MobileChapterGrid: two equal columns with an 8pt gap, filling the row.
  chapterRow: {
    flexDirection: "row",
    gap: 8,
  },
  chapterSlot: {
    flex: 1,
    minWidth: 0,
  },
  chapterCell: {
    // MobileChapterCell geometry.
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  gridSkeleton: {
    gap: 12,
  },
  gridSkeletonCaption: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
});
