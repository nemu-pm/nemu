import {
  Fragment,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type MutableRefObject,
  type ReactNode,
  type Ref,
} from "react";
import {
  Platform,
  StyleSheet,
  View,
  findNodeHandle,
  useWindowDimensions,
  type FlatList,
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
import {
  MobileMangaDetailTopHeaderContext,
  MobileMangaDetailWashContext,
  type MobileMangaDetailWash,
} from "@/components/MobileMangaDetailPaneContext";
import { MobileMangaDetailColumnsWash } from "@/components/explore/MobileMangaDetailColumnsWash";
import { buildMobileCoverTintPalette } from "@/lib/mobileCoverTint";
import { getMobileDetailBarRowPull, getMobileDetailColumnsLayout } from "@/lib/mobileMangaDetailColumns";
import { useMobileAdaptiveLayout } from "@/lib/MobileWindowLayoutContext";
import { useMobileSplitPaneLayout } from "@/lib/useMobileSplitPaneLayout";
import { useMobilePoseTransition } from "@/lib/MobilePoseTransitionContext";
import { useMobilePoseResnapFade } from "@/lib/useMobilePoseResnapFade";
import { useMobileStaleColumnsGuard } from "@/lib/useMobileStaleColumnsGuard";
import {
  MobileMeasuredRowReportProvider,
  useMobileMeasuredRowLayout,
} from "@/lib/useMobileMeasuredRowLayout";
import type { MobileMeasuredRow } from "@/lib/mobileMeasuredRowLayout";
import { useMobileListRowAnchor } from "@/lib/useMobileListRowAnchor";
import { ScrollEdgeElement, scrollToAdjustedTop } from "../../modules/nemu-window-layout";

type ChapterListProps<ItemT> = Omit<
  ComponentProps<typeof PageListScaffold<ItemT>>,
  "ListHeaderComponent" | "contentContainerStyle"
>;

const NO_ROWS: never[] = [];
const renderNothing = () => null;

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === "function") ref(value);
  else if (ref) (ref as MutableRefObject<T | null>).current = value;
}

/**
 * Manga detail on any width: one list on compact widths; on expanded widths a
 * leading pane (cover, info, actions) beside the chapter list. Panes lay out at
 * their final widths and settle with a cross-fade, never gliding.
 */
export function MobileMangaDetailSplitLayout<ItemT>({
  leading,
  chapterHeader,
  splitEnabled = true,
  tabStrip = true,
  leadingTestID,
  onLeadingScroll,
  rowLayoutKind,
  ...listProps
}: ChapterListProps<ItemT> & {
  /** Info stack: hero, banners. Leads the list on compact widths. */
  leading: ReactNode;
  /** "Chapters" section header (source selector, sort, filters, notices). */
  chapterHeader: ReactNode;
  /** False for states without chapters (not found, loading shells). */
  splitEnabled?: boolean;
  /** False for a page pushed over the tabs (root stack): no tab strip above it. */
  tabStrip?: boolean;
  leadingTestID?: string;
  /**
   * The info pane's scroll, as the offset from the hero's own top (the pane's
   * padding taken off): the hero's title has left the page once it passes the
   * title's bottom.
   */
  onLeadingScroll?: (offsetFromHeroTop: number) => void;
  /**
   * The chapter rows come in a few fixed heights: names a row's height class.
   * At the standard text size the list then gets an exact, measured
   * `getItemLayout` (useMobileMeasuredRowLayout), so a jump to a chapter far
   * down lands at once.
   */
  rowLayoutKind?: (item: ItemT) => string;
}) {
  const { tokens, scheme } = useNemuTheme();
  const { height, fontScale } = useWindowDimensions();
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
  const { verticalBarSide, hasFoldRegion, regularWidth: windowRegularWidth, compactHeight } = useMobileAdaptiveLayout();
  // Bars on the side (the Duo's rail): the bar is not above the page, so the
  // page starts at the top safe area instead of under an empty bar band.
  const barOnSide = Platform.OS === "ios" && mobileDesignExploreFlag && verticalBarSide !== null;
  const exploreTop =
    Platform.OS === "ios" && mobileDesignExploreFlag
      ? { paddingTop: barOnSide ? insets.top + RAIL_PANE_TOP : 4 }
      : null;
  // The detail screens use a transparent soft-edge navigation bar. Both
  // scroll views must start below it, while still scrolling underneath it.
  const contentInsetAdjustmentBehavior = barOnSide
    ? "never"
    : listProps.contentInsetAdjustmentBehavior
    ?? (Platform.OS === "ios" && listProps.nativeHeader ? "automatic" : "never");
  const gutters = useMobilePageGutters();
  const { containerRef, onContainerLayout, layout, containerWidth, foldSplit, adaptive } = useMobileSplitPaneLayout(
    MOBILE_DETAIL_SPLIT_OPTIONS,
  );
  const explore = Platform.OS === "ios" && mobileDesignExploreFlag;
  // The explore design on a wide window (Duo inner landscape, tablets): the
  // hero holds still in a column beside the chapters, the cover's colour
  // behind both (`mobileMangaDetailColumns`). Every decision below reads the
  // container's width from one snapshot, so a fold or resize changes the
  // layout once rather than first by the window and then by the container.
  const columnsLayout = useMemo(
    () =>
      explore && splitEnabled
        ? getMobileDetailColumnsLayout({
            containerWidth,
            compactHeight: adaptive.compactHeight,
            gutters,
            posture: adaptive.posture,
            foldSplit,
          })
        : null,
    [adaptive.compactHeight, adaptive.posture, containerWidth, explore, foldSplit, gutters, splitEnabled],
  );
  const columns = columnsLayout?.mode === "split" ? columnsLayout : null;
  // Narrower, with the explore design on: one wide header over one chapter
  // list wherever the window is wide enough for the cover beside the text.
  // The info pane beside the chapters stays for the design off and non-iOS.
  const top =
    explore &&
    splitEnabled &&
    !columns &&
    containerWidth - gutters.left - gutters.right >= 560;
  const [topFooter, setTopFooter] = useState<ReactNode>(null);
  const topContext = useMemo(() => ({ setFooter: setTopFooter }), []);
  const split = columns ?? (!top && splitEnabled && layout.mode === "split" ? layout : null);
  const [wash, setWash] = useState<MobileMangaDetailWash | null>(null);
  // On iPad a tab's page has the bar reserved twice (tab strip and title)
  // though both draw on one line: the panes pull up by the unused row.
  const pull = Platform.OS === "ios" && mobileDesignExploreFlag
    ? getMobileDetailBarRowPull({
        tabStrip,
        barOnSide,
        infoPaneSplit: Boolean(split && !columns),
        columnsOrWideHeader: Boolean(top || columns),
        regularWidth: windowRegularWidth,
        hasFoldRegion,
        compactHeight,
      })
    : 0;
  const regularWidth = windowRegularWidth || Boolean(split) || top;
  const padding = getMobileSplitPanePadding({
    pageGutters: gutters,
    innerGutter: spacing.pageX,
  });
  // The hero column's content width (the column less its padding), for the
  // hero's first commit before it measures itself.
  const columnContentWidth = columns
    ? Math.max(0, columns.leading.width - padding.leading.paddingLeft - padding.leading.paddingRight)
    : undefined;
  // Where the hero column's content starts in the window. Beside a vertical
  // bar: its own top padding. Under a bar: the bar's inset, the page's top
  // padding and the iPad pull.
  const columnTop = barOnSide
    ? (exploreTop?.paddingTop ?? insets.top)
    : insets.top + COLUMN_BAR_INSET + (exploreTop?.paddingTop ?? 0) + pull;
  const leadingPane = useMemo<MobileMangaDetailPane>(
    () => ({ role: "leading", regularWidth: true, columns: Boolean(columns), columnContentWidth, columnTop }),
    [columns, columnContentWidth, columnTop],
  );
  // The column hero starts at the column's top; the info pane's panel adds its own padding.
  const leadingTop = (exploreTop?.paddingTop ?? 0) + (pull || 0) + (columns ? 0 : PANE_HERO_TOP);
  const onLeadingListScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentInset } = event.nativeEvent;
      onLeadingScroll?.(contentOffset.y + (contentInset?.top ?? 0) - leadingTop);
    },
    [leadingTop, onLeadingScroll],
  );
  const chapterPalette = useMemo(
    () => (columns ? buildMobileCoverTintPalette(wash?.tint ?? null, scheme) : undefined),
    [columns, wash?.tint, scheme],
  );
  const trailingPane = useMemo<MobileMangaDetailPane>(
    () => ({
      role: split ? "trailing" : "single",
      regularWidth,
      columns: Boolean(columns),
      chapterPalette,
    }),
    [regularWidth, split, columns, chapterPalette],
  );
  // Beside the vertical bar a pane's content rests in the bar's row, under the
  // reach of its top edge effect: each pane shows it once it has scrolled.
  const paneEdgeReveal = barOnSide && ScrollEdgeElement ? (
    <ScrollEdgeElement edge="top" revealPastRest pointerEvents="none" style={styles.edgeReveal} />
  ) : null;
  const pose = useMobilePoseTransition();
  // One key per pane geometry: a fold / unfold / resize that moves a pane's
  // edges settles that pane's content.
  // The columns are not settled here: the stale-columns guard below already
  // hides them until they are laid out for their window, and a dip on top of
  // it blinked columns that were already right (Duo outer → inner, book →
  // flat: each passing width dipped them again).
  const leadingSettle = useMobilePoseResnapFade(
    columns ? "columns" : split ? `${split.alignment}:${Math.round(split.leading.width)}` : "none",
    { poseChangesOnly: true },
  );
  const trailingSettle = useMobilePoseResnapFade(
    columns ? "columns" : split ? `${split.alignment}:${Math.round(split.trailing.x)}:${Math.round(split.trailing.width)}` : "single",
    { poseChangesOnly: true },
  );
  const chapterLayoutKey = `${split?.trailing.width ?? 0}:${containerWidth}:${trailingPane.role}`;
  // A rotation or fold mid-list keeps the chapter at the top in place (the
  // hero moving into or out of the list shifted it by rows).
  const chapterListRef = useRef<FlatList<ItemT> | null>(null);
  const { listRef: callerListRef, onScroll: callerOnScroll, onScrollBeginDrag: callerOnScrollBeginDrag } = listProps;
  const setChapterListRef = useCallback(
    (value: FlatList<ItemT> | null) => {
      chapterListRef.current = value;
      assignRef(callerListRef, value);
    },
    [callerListRef],
  );
  const measuredRowsRef = useRef<() => MobileMeasuredRow[]>(() => []);
  const measuredRows = useCallback(() => measuredRowsRef.current(), []);
  // Beside a rail the list's inset behaviour is `never` (its padding clears the
  // status bar); under a bar it is `automatic`. Across that flip UIKit leaves
  // the offset alone, so a page at its top ended 82pt up with its title under
  // the bar.
  const restChapterListAtTop = useCallback(() => {
    const list = chapterListRef.current;
    const tag = list ? findNodeHandle(list.getNativeScrollRef?.() as never) : null;
    if (tag != null) scrollToAdjustedTop(tag);
  }, []);
  const chapterAnchor = useMobileListRowAnchor({
    listRef: chapterListRef,
    geometryKey: chapterLayoutKey,
    rows: measuredRows,
    enabled: rowLayoutKind !== undefined,
    restAtTop: Platform.OS === "ios" ? restChapterListAtTop : undefined,
  });
  const rowLayout = useMobileMeasuredRowLayout({
    data: listProps.data as readonly ItemT[] | null | undefined,
    kindOf: rowLayoutKind,
    layoutKey: chapterLayoutKey,
    enabled: fontScale === 1,
    onRowLayout: chapterAnchor.onRowLayout,
  });
  const measuredRowsSource = rowLayout.rows;
  useLayoutEffect(() => {
    measuredRowsRef.current = measuredRowsSource;
  }, [measuredRowsSource]);
  const anchorOnScroll = chapterAnchor.onScroll;
  const onChapterListScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      anchorOnScroll(event);
      callerOnScroll?.(event);
    },
    [anchorOnScroll, callerOnScroll],
  );
  const anchorOnScrollBeginDrag = chapterAnchor.onScrollBeginDrag;
  const onChapterListScrollBeginDrag = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      anchorOnScrollBeginDrag();
      callerOnScrollBeginDrag?.(event);
    },
    [anchorOnScrollBeginDrag, callerOnScrollBeginDrag],
  );
  // A resize shows the columns at their old widths in the new window for a
  // few frames before the layout for it commits: they are hidden meanwhile.
  const { ref: staleGuardRef, style: staleGuardStyle } = useMobileStaleColumnsGuard(columns ? containerWidth : null);

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
        <Animated.View key="guard" ref={staleGuardRef} pointerEvents="none" style={StyleSheet.absoluteFill} />
        {columns ? (
          // Behind both columns and a vertical system bar: the cover's colour.
          <MobileMangaDetailColumnsWash key="wash" wash={wash} heroWidth={columns.leading.width} />
        ) : null}
        {split ? (
          <Animated.View
            key="leading"
            // No layout animation where a fold or resize re-parents the hero
            // between the list and this column (the explore design): the
            // pose veil and the settle fade cover the change.
            entering={explore ? undefined : pose.entering}
            exiting={explore ? undefined : pose.exiting}
            testID={leadingTestID}
            style={[
              styles.pane,
              { width: split.leading.width },
              split.alignment === "flat" && !columns
                ? { borderEndWidth: StyleSheet.hairlineWidth, borderEndColor: tokens.border }
                : null,
              staleGuardStyle,
            ]}
          >
            <Animated.View style={[styles.fill, leadingSettle]}>
              <PageListScaffold
                nativeHeader={listProps.nativeHeader}
                // A hero column that fits does not scroll, and UIKit's automatic
                // adjustment skips the bar inset of a scroll view that cannot
                // scroll: it would start under the bar.
                contentInsetAdjustmentBehavior={
                  columns && contentInsetAdjustmentBehavior === "automatic" ? "always" : contentInsetAdjustmentBehavior
                }
                data={NO_ROWS}
                renderItem={renderNothing}
                style={columns ? styles.clearList : undefined}
                // The hero column holds still unless it is taller than the
                // window; the chapters beside it own pull to refresh.
                alwaysBounceVertical={columns ? false : undefined}
                onScroll={onLeadingScroll ? onLeadingListScroll : undefined}
                onScrollEndDrag={onLeadingScroll ? onLeadingListScroll : undefined}
                onMomentumScrollEnd={onLeadingScroll ? onLeadingListScroll : undefined}
                scrollEventThrottle={onLeadingScroll ? 64 : undefined}
                onRefresh={columns ? undefined : listProps.onRefresh}
                refreshDisabled={listProps.refreshDisabled}
                refreshLabel={listProps.refreshLabel}
                refreshing={columns ? false : listProps.refreshing}
                contentContainerStyle={[padding.leading, exploreTop, exploreBottom]}
                ListHeaderComponent={
                  <MobileMangaDetailPaneContext.Provider value={leadingPane}>
                    <MobileMangaDetailWashContext.Provider value={columns ? setWash : null}>
                      <View style={[styles.leadingStack, pull ? { marginTop: pull } : null]}>{leading}</View>
                    </MobileMangaDetailWashContext.Provider>
                  </MobileMangaDetailPaneContext.Provider>
                }
              />
              {paneEdgeReveal}
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
            <Animated.View style={[styles.fill, staleGuardStyle]}>
            <MobileMeasuredRowReportProvider value={rowLayout.report}>
            <PageListScaffold
              {...listProps}
              listRef={setChapterListRef}
              onScroll={rowLayoutKind || callerOnScroll ? onChapterListScroll : undefined}
              onScrollBeginDrag={rowLayoutKind || callerOnScrollBeginDrag ? onChapterListScrollBeginDrag : undefined}
              scrollEventThrottle={rowLayoutKind ? (listProps.scrollEventThrottle ?? 64) : listProps.scrollEventThrottle}
              getItemLayout={rowLayout.getItemLayout}
              CellRendererComponent={rowLayout.CellRendererComponent}
              style={columns ? styles.clearList : listProps.style}
              contentInsetAdjustmentBehavior={contentInsetAdjustmentBehavior}
              ListFooterComponent={
                top && topFooter ? (
                  <View style={styles.topFooter}>
                    {topFooter}
                  </View>
                ) : (
                  listProps.ListFooterComponent
                )
              }
              contentContainerStyle={[split ? padding.trailing : null, split || barOnSide ? exploreTop : null, exploreBottom]}
              ListHeaderComponent={
                <View style={[styles.stack, pull ? { marginTop: pull } : null]}>
                  {split ? null : (
                    <Fragment key="leading">
                      {top ? (
                        <MobileMangaDetailTopHeaderContext.Provider value={topContext}>{leading}</MobileMangaDetailTopHeaderContext.Provider>
                      ) : (
                        leading
                      )}
                    </Fragment>
                  )}
                  <Fragment key="chapter-header">{chapterHeader}</Fragment>
                </View>
              }
            />
            </MobileMeasuredRowReportProvider>
            {paneEdgeReveal}
            </Animated.View>
          </MobileMangaDetailPaneContext.Provider>
        </Animated.View>
      </View>
    </LayoutAnimationConfig>
  );
}

/** Beside a vertical bar, each pane's top padding below the safe area (pt). */
const RAIL_PANE_TOP = 24;

/** The info pane hero's own top padding (pt). */
const PANE_HERO_TOP = 22;

/**
 * The inset a regular-width window's bar (with the tab strip) adds under the
 * status bar (pt; measured on the iPad, iOS 27: the hero column's content
 * starts at 24 + 62 + 4 - 44 = 46).
 */
const COLUMN_BAR_INSET = 62;

const styles = StyleSheet.create({
  edgeReveal: {
    position: "absolute",
    width: 0,
    height: 0,
  },
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
  topFooter: {
    paddingTop: 28,
    paddingBottom: 8,
  },
  leadingStack: {
    gap: MOBILE_DETAIL_PANE_METRICS.blockGap,
  },
  // The columns' lists let the wash behind them show through.
  clearList: {
    flex: 1,
    backgroundColor: "transparent",
  },
});
