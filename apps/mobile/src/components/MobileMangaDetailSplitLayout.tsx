import { Fragment, type ComponentProps, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
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
 * with its section header on top. In book posture the pane boundary is the
 * fold and each pane pads its own edges; flat, it splits only on expanded
 * widths (≥ 840pt, e.g. the inner display in landscape), with a narrower
 * leading pane (~40%, min 320pt) like the Notes sidebar — portrait inner
 * display and tablets in portrait keep one list, like web. Notebook keeps one
 * column.
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
  const gutters = useMobilePageGutters();
  const { containerRef, onContainerLayout, layout } = useMobileSplitPaneLayout(
    MOBILE_DETAIL_SPLIT_OPTIONS,
  );
  const split = splitEnabled && layout.mode === "split" ? layout : null;
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
                data={NO_ROWS}
                renderItem={renderNothing}
                onRefresh={listProps.onRefresh}
                refreshDisabled={listProps.refreshDisabled}
                refreshLabel={listProps.refreshLabel}
                refreshing={listProps.refreshing}
                contentContainerStyle={padding.leading}
                ListHeaderComponent={<View style={styles.stack}>{leading}</View>}
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
          <PageListScaffold
            {...listProps}
            contentContainerStyle={split ? padding.trailing : undefined}
            ListHeaderComponent={
              <View style={styles.stack}>
                {split ? null : <Fragment key="leading">{leading}</Fragment>}
                <Fragment key="chapter-header">{chapterHeader}</Fragment>
              </View>
            }
          />
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
});
