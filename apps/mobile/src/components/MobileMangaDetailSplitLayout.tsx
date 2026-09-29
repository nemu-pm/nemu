import {
  Fragment,
  useMemo,
  type ComponentProps,
  type ReactNode,
} from "react";
import { Platform, StyleSheet, View } from "react-native";
import Animated, { LayoutAnimationConfig } from "react-native-reanimated";
import {
  PageListScaffold,
  spacing,
  useMobilePageGutters,
  useNemuTheme,
} from "@/design-system";
import {
  getMobileSplitPanePadding,
  MOBILE_DETAIL_SPLIT_OPTIONS,
} from "@/lib/mobileSplitPaneLayout";
import {
  MobileMangaDetailPaneContext,
  type MobileMangaDetailPane,
} from "@/components/MobileMangaDetailPaneContext";
import { MOBILE_DETAIL_PANE_METRICS } from "@/lib/mobileMangaDetailPaneLayout";
import { useMobileAdaptiveLayout } from "@/lib/MobileWindowLayoutContext";
import { useMobileSplitPaneLayout } from "@/lib/useMobileSplitPaneLayout";
import { useMobilePoseTransition } from "@/lib/MobilePoseTransitionContext";
import { useMobilePoseResnapFade } from "@/lib/useMobilePoseResnapFade";

type ChapterListProps<ItemT> = Omit<
  ComponentProps<typeof PageListScaffold<ItemT>>,
  "ListHeaderComponent" | "contentContainerStyle"
>;

const NO_ROWS: never[] = [];
const renderNothing = () => null;

/**
 * Manga detail on any width.
 *
 * Compact (phones, Duo outer display): one list — info, then chapters.
 * Regular (Duo inner display, tablets, foldables): HIG "show an additional
 * level of hierarchy" — the leading pane holds cover/info/tags/actions/
 * description and scrolls on its own; the trailing pane is the chapter list
 * with its section header on top. In book posture (folded) the pane boundary
 * is the fold and each pane pads its own edges. Fully open (flat) — the inner
 * display unfolded, an unfolded Android foldable, a tablet — uses the
 * ordinary layout whether or not the device reports an inactive fold: it
 * splits only on expanded widths (≥ 840pt) with a narrower leading pane
 * (~40%, min 320pt / max 460pt) like the Notes sidebar, so folding ⇄
 * unfolding re-flows the panes (owner rule; the settle cross-fade below
 * covers it). Portrait inner display and tablets in portrait keep one list,
 * like web. Notebook keeps one column.
 *
 * Each pane tells its content where it renders (`useMobileMangaDetailPane`):
 * the info pane drops the compact card and shows every tag and the whole
 * description, and the chapter header uses the regular-width rhythm — see
 * `mobileMangaDetailPaneLayout`. Compact content reads the default ("single",
 * compact) and stays design A.
 *
 * The chapter list keeps its element identity across the switch (same key,
 * same parent), so resizing or folding never remounts it: scroll position and
 * everything the screen holds (source, sort, filters) survive.
 *
 * Motion (pose changes): the panes' contents are laid out at their final
 * widths at once, so the panes take their new frames in the same step and
 * each pane's content settles with a short UI-thread cross-fade (the shared
 * re-snap dip) instead of gliding. Gliding the frames while the text already
 * had its final layout displaced it — the chapter header's trailing
 * "Descending" sat off-screen ("De…") until the trailing pane finished
 * moving, and the hero reflowed ahead of its pane. The leading pane still
 * fades in/out when the split appears/disappears. Nothing animates when the
 * screen mounts or unmounts (`LayoutAnimationConfig`) or when a pushed
 * screen's first measurement moves the split.
 */
export function MobileMangaDetailSplitLayout<ItemT>({
  leading,
  chapterHeader,
  splitEnabled = true,
  leadingTestID,
  ...listProps
}: ChapterListProps<ItemT> & {
  /** Info stack: hero, banners. Leads the list on compact widths. */
  leading: ReactNode;
  /** "Chapters" section header (source selector, sort, filters, notices). */
  chapterHeader: ReactNode;
  /** False for states without chapters (not found, loading shells). */
  splitEnabled?: boolean;
  leadingTestID?: string;
}) {
  const { tokens } = useNemuTheme();
  // The detail screens use a transparent soft-edge navigation bar. Both
  // scroll views must start below it, while still scrolling underneath it.
  const contentInsetAdjustmentBehavior = listProps.contentInsetAdjustmentBehavior
    ?? (Platform.OS === "ios" && listProps.nativeHeader ? "automatic" : "never");
  const gutters = useMobilePageGutters();
  const { containerRef, onContainerLayout, layout } = useMobileSplitPaneLayout(
    MOBILE_DETAIL_SPLIT_OPTIONS,
  );
  const split = splitEnabled && layout.mode === "split" ? layout : null;
  const { regularWidth: adaptiveRegularWidth } = useMobileAdaptiveLayout();
  const regularWidth = adaptiveRegularWidth || Boolean(split);
  const leadingPane = useMemo<MobileMangaDetailPane>(
    () => ({ role: "leading", regularWidth: true }),
    [],
  );
  const trailingPane = useMemo<MobileMangaDetailPane>(
    () => ({ role: split ? "trailing" : "single", regularWidth }),
    [regularWidth, split],
  );
  const padding = getMobileSplitPanePadding({
    pageGutters: gutters,
    innerGutter: spacing.pageX,
  });
  const pose = useMobilePoseTransition();
  // One key per pane geometry: a fold / unfold / resize that moves a pane's
  // edges settles that pane's content.
  const leadingSettle = useMobilePoseResnapFade(
    split ? `${split.alignment}:${Math.round(split.leading.width)}` : "none",
    { poseChangesOnly: true },
  );
  const trailingSettle = useMobilePoseResnapFade(
    split ? `${split.alignment}:${Math.round(split.trailing.x)}:${Math.round(split.trailing.width)}` : "single",
    { poseChangesOnly: true },
  );

  return (
    <LayoutAnimationConfig skipEntering skipExiting>
      <View
        ref={containerRef}
        onLayout={onContainerLayout}
        style={[
          styles.root,
          { backgroundColor: tokens.background },
          split ? styles.row : null,
        ]}
      >
        {split ? (
          <Animated.View
            key="leading"
            entering={pose.entering}
            exiting={pose.exiting}
            testID={leadingTestID}
            style={[
              styles.pane,
              { width: split.leading.width },
              split.alignment === "flat"
                ? { borderEndWidth: StyleSheet.hairlineWidth, borderEndColor: tokens.border }
                : null,
            ]}
          >
            <Animated.View style={[styles.fill, leadingSettle]}>
              <PageListScaffold
                nativeHeader={listProps.nativeHeader}
                contentInsetAdjustmentBehavior={contentInsetAdjustmentBehavior}
                data={NO_ROWS}
                renderItem={renderNothing}
                onRefresh={listProps.onRefresh}
                refreshDisabled={listProps.refreshDisabled}
                refreshLabel={listProps.refreshLabel}
                refreshing={listProps.refreshing}
                contentContainerStyle={padding.leading}
                ListHeaderComponent={
                  <MobileMangaDetailPaneContext.Provider value={leadingPane}>
                    <View style={styles.leadingStack}>{leading}</View>
                  </MobileMangaDetailPaneContext.Provider>
                }
              />
            </Animated.View>
          </Animated.View>
        ) : null}
        {split && split.gutter > 0 ? (
          // The fold band: nothing is drawn or tappable on it.
          <View key="fold" style={{ width: split.gutter }} />
        ) : null}
        <Animated.View
          key="chapters"
          style={[split ? [styles.pane, { width: split.trailing.width }] : styles.fill, trailingSettle]}
        >
          <MobileMangaDetailPaneContext.Provider value={trailingPane}>
            <PageListScaffold
              {...listProps}
              contentInsetAdjustmentBehavior={contentInsetAdjustmentBehavior}
              contentContainerStyle={split ? padding.trailing : undefined}
              ListHeaderComponent={
                <View style={styles.stack}>
                  {split ? null : <Fragment key="leading">{leading}</Fragment>}
                  <Fragment key="chapter-header">{chapterHeader}</Fragment>
                </View>
              }
            />
          </MobileMangaDetailPaneContext.Provider>
        </Animated.View>
      </View>
    </LayoutAnimationConfig>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  row: {
    flexDirection: "row",
  },
  pane: {
    height: "100%",
  },
  fill: {
    flex: 1,
  },
  stack: {
    gap: 18,
  },
  leadingStack: {
    gap: MOBILE_DETAIL_PANE_METRICS.blockGap,
  },
});
