import {
  Fragment,
  useCallback,
  useMemo,
  type ComponentProps,
  type ReactNode,
} from "react";
import {
  Platform,
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { mobileDesignExploreFlag } from "@/lib/mobileDesignExplore";
import { useMobileExploreRestingFrame } from "@/components/explore/useMobileExploreResting";
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
 * Manga detail on any width: one list on compact widths; on expanded widths a
 * leading pane (cover, info, actions) beside the chapter list. Panes lay out at
 * their final widths and settle with a cross-fade, never gliding.
 */
export function MobileMangaDetailSplitLayout<ItemT>({
  leading,
  chapterHeader,
  splitEnabled = true,
  leadingTestID,
  onLeadingScroll,
  ...listProps
}: ChapterListProps<ItemT> & {
  /** Info stack: hero, banners. Leads the list on compact widths. */
  leading: ReactNode;
  /** "Chapters" section header (source selector, sort, filters, notices). */
  chapterHeader: ReactNode;
  /** False for states without chapters (not found, loading shells). */
  splitEnabled?: boolean;
  leadingTestID?: string;
  /**
   * The info pane's scroll, as the offset from the hero's own top (the pane's
   * padding taken off): the hero's title has left the page once it passes the
   * title's bottom.
   */
  onLeadingScroll?: (offsetFromHeroTop: number) => void;
}) {
  const { tokens } = useNemuTheme();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const resting = useMobileExploreRestingFrame();
  // UIKit's compact-height safe area omits the floating tab bar band.
  // Add only the omitted part to the normal scroll-end margin.
  const exploreBottom = Platform.OS === "ios" && mobileDesignExploreFlag
    ? { paddingBottom: 24 + Math.max(0, height - resting.edge - insets.bottom) }
    : null;
  // The two panes sit a normal distance under the bar: UIKit's inset already
  // clears it, so the page's own top padding would only widen the gap (most
  // on iPad, where the bar carries the tab strip).
  const { verticalBarSide } = useMobileAdaptiveLayout();
  // Bars on the side (the Duo's rail): the bar is not above the page, so the
  // page starts at the top safe area instead of under an empty bar band.
  const barOnSide = Platform.OS === "ios" && mobileDesignExploreFlag && verticalBarSide !== null;
  const exploreTop =
    Platform.OS === "ios" && mobileDesignExploreFlag
      ? { paddingTop: barOnSide ? insets.top + 12 : 4 }
      : null;
  // The detail screens use a transparent soft-edge navigation bar. Both
  // scroll views must start below it, while still scrolling underneath it.
  const contentInsetAdjustmentBehavior = barOnSide
    ? "never"
    : listProps.contentInsetAdjustmentBehavior
    ?? (Platform.OS === "ios" && listProps.nativeHeader ? "automatic" : "never");
  const gutters = useMobilePageGutters();
  const { containerRef, onContainerLayout, layout } = useMobileSplitPaneLayout(
    MOBILE_DETAIL_SPLIT_OPTIONS,
  );
  const split = splitEnabled && layout.mode === "split" ? layout : null;
  // On iPad the system reserves the bar twice (tab strip row and title row)
  // above the content, though both draw on one line: the two panes pull up by
  // the unused row so they start a normal distance under what is drawn.
  const pull = split && Platform.OS === "ios" && mobileDesignExploreFlag && !barOnSide ? IPAD_BAR_ROW_PULL : 0;
  const { regularWidth: adaptiveRegularWidth } = useMobileAdaptiveLayout();
  const regularWidth = adaptiveRegularWidth || Boolean(split);
  const leadingPane = useMemo<MobileMangaDetailPane>(
    () => ({ role: "leading", regularWidth: true }),
    [],
  );
  const leadingTop = (exploreTop?.paddingTop ?? 0) + (pull || 0) + PANE_HERO_TOP;
  const onLeadingListScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentInset } = event.nativeEvent;
      onLeadingScroll?.(contentOffset.y + (contentInset?.top ?? 0) - leadingTop);
    },
    [leadingTop, onLeadingScroll],
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
                onScroll={onLeadingScroll ? onLeadingListScroll : undefined}
                onScrollEndDrag={onLeadingScroll ? onLeadingListScroll : undefined}
                onMomentumScrollEnd={onLeadingScroll ? onLeadingListScroll : undefined}
                scrollEventThrottle={onLeadingScroll ? 64 : undefined}
                onRefresh={listProps.onRefresh}
                refreshDisabled={listProps.refreshDisabled}
                refreshLabel={listProps.refreshLabel}
                refreshing={listProps.refreshing}
                contentContainerStyle={[padding.leading, exploreTop, exploreBottom]}
                ListHeaderComponent={
                  <MobileMangaDetailPaneContext.Provider value={leadingPane}>
                    <View style={[styles.leadingStack, pull ? { marginTop: pull } : null]}>{leading}</View>
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
              contentContainerStyle={[split ? padding.trailing : null, split || barOnSide ? exploreTop : null, exploreBottom]}
              ListHeaderComponent={
                <View style={[styles.stack, pull ? { marginTop: pull } : null]}>
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

/** The info pane hero's own top padding (pt). */
const PANE_HERO_TOP = 22;

/** The empty bar row the system still reserves on iPad (pt). */
const IPAD_BAR_ROW_PULL = -44;

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
