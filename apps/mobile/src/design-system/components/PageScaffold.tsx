import type { ScrollViewInstance } from "react-native";
import {
  cloneElement,
  createElement,
  Fragment,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type MutableRefObject,
  type ReactElement,
  type ReactNode,
  type Ref,
} from "react";
import { usePathname } from "expo-router";
import { HeaderHeightContext } from "expo-router/react-navigation";
import {
  FlatList,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  type FlatListProps,
  type LayoutChangeEvent,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNemuTheme } from "@/design/useNemuTheme";
import { spacing } from "@/design/tokens";
import { useMobilePageGutters } from "@/design/useMobilePageGutters";
import { getMobilePageContentBottomPadding } from "@/lib/mobileFloatingTabBarClearance";
import {
  resolveMobilePullToRefreshEnabled,
  resolveMobilePullToRefreshIndicatorVisible,
} from "@/lib/mobilePullToRefresh";
import { subscribeMobileRootTabReselect } from "@/lib/mobileRootTabReselect";
import { exactMobileRootTabHrefForPathname } from "@/lib/mobileRootTabs";
import { getMobileFontScaleLayoutKey } from "@/lib/mobileDynamicTypeLayout";
import {
  getMobilePageTopPadding,
  resolveMobilePageContentInsetAdjustment,
  resolveMobilePageViewportHeight,
} from "@/lib/mobilePageLayout";
import { isMobileBottomTabBarRoute, shouldShowMobileFloatingTabBar } from "@/lib/mobileRootTabs";
import { useMobileBottomTabBarInset } from "@/lib/mobileBottomTabBarInset";
import { useMobileAdaptiveLayout } from "@/lib/MobileWindowLayoutContext";
import { MOBILE_IOS_TAB_BAR_FALLBACK_HEIGHT } from "@/lib/mobileToastPlacement";
import { WindowLayoutObserver, type MobileWindowLayout } from "../../../modules/nemu-window-layout";
import { NemuScrollEdgeSurface, useNemuScrollEdgeTracking } from "./NemuScrollEdgeSurface";

/**
 * A live Dynamic Type change leaves already-mounted text with stale layout
 * (see mobileDynamicTypeLayout.ts). Keying the page body on the font scale
 * remounts it so every text node is measured at the new size.
 */
function useMobileFontScaleLayoutKey(): string {
  const { fontScale } = useWindowDimensions();
  return getMobileFontScaleLayoutKey(fontScale);
}

type PageScaffoldProps = {
  children: ReactNode;
  onRefresh?: () => void;
  refreshDisabled?: boolean;
  refreshLabel?: string;
  refreshing?: boolean;
  nativeHeader?: boolean;
  contentInsetAdjustmentBehavior?: ScrollViewProps["contentInsetAdjustmentBehavior"];
  /** Height of a screen-drawn title bar (below the safe area) when the native header is hidden. */
  headerBarHeight?: number;
  /**
   * The native header shows a search field (`Stack.SearchBar`). On iOS its
   * measured height then includes the field, so the page keeps its own top
   * padding instead of deriving it from the bar.
   */
  headerSearchBar?: boolean;
  /**
   * The native bar's row shows something (a title, a search field): the soft
   * edge then covers it whole where the system draws none (`useNemuScrollEdge`).
   * False for a title page before its compact title fades in.
   */
  barContentVisible?: boolean;
  scrollRef?: Ref<ScrollViewInstance>;
  /**
   * The content fills exactly the visible viewport (an empty page): it
   * centres in it and only rubber-bands, never rests part-way scrolled.
   */
  fillViewport?: boolean;
  /** The page's scroll events (JS), e.g. for a scroll anchor across a re-layout. */
  onScroll?: ScrollViewProps["onScroll"];
  scrollEventThrottle?: number;
};

type PageListScaffoldProps<ItemT> = Omit<
  FlatListProps<ItemT>,
  | "automaticallyAdjustContentInsets"
  | "automaticallyAdjustsScrollIndicatorInsets"
  | "contentInsetAdjustmentBehavior"
  | "refreshControl"
  | "showsVerticalScrollIndicator"
  | "ListEmptyComponent"
  | "ListFooterComponent"
> & {
  ListEmptyComponent?: FlatListProps<ItemT>["ListEmptyComponent"] | null;
  ListFooterComponent?: FlatListProps<ItemT>["ListFooterComponent"] | null;
  nativeHeader?: boolean;
  onRefresh?: () => void;
  refreshDisabled?: boolean;
  refreshLabel?: string;
  refreshing?: boolean;
  contentInsetAdjustmentBehavior?: ScrollViewProps["contentInsetAdjustmentBehavior"];
  /** Height of a screen-drawn title bar (below the safe area) when the native header is hidden. */
  headerBarHeight?: number;
  /**
   * The native header shows a search field (`Stack.SearchBar`). On iOS its
   * measured height then includes the field, so the page keeps its own top
   * padding instead of deriving it from the bar.
   */
  headerSearchBar?: boolean;
  /**
   * The native bar's row shows something (a title, a search field): the soft
   * edge then covers it whole where the system draws none (`useNemuScrollEdge`).
   * False for a title page before its compact title fades in.
   */
  barContentVisible?: boolean;
  /**
   * A column of a multi-pane page that scrolls on its own: the soft edge held
   * strong over its top padding whatever the bar shows.
   */
  scrollEdgePane?: { topPadding: number };
  listRef?: Ref<FlatList<ItemT>>;
  /**
   * The content (an empty list's `ListEmptyComponent` at `flex: 1`) fills
   * exactly the visible viewport: it centres in it and only rubber-bands,
   * never rests part-way scrolled.
   */
  fillViewport?: boolean;
};

type ScrollableWebNode = {
  scrollTo?: (options: { behavior?: "auto" | "smooth"; left?: number; top?: number }) => void;
  scrollTop?: number;
};

type ScrollViewWithWebNode = {
  getScrollableNode?: () => ScrollableWebNode | null;
};

function assignScrollRef(ref: Ref<ScrollViewInstance> | undefined, value: ScrollViewInstance | null) {
  if (!ref) return;
  if (typeof ref === "function") {
    ref(value);
    return;
  }
  (ref as MutableRefObject<ScrollViewInstance | null>).current = value;
}

function assignFlatListRef<ItemT>(
  ref: Ref<FlatList<ItemT>> | undefined,
  value: FlatList<ItemT> | null,
) {
  if (!ref) return;
  if (typeof ref === "function") {
    ref(value);
    return;
  }
  (ref as MutableRefObject<FlatList<ItemT> | null>).current = value;
}

function scrollPageScaffoldToTop(scrollView: ScrollViewInstance | null) {
  scrollView?.scrollTo({ y: 0, animated: true });
  const scrollableNode = (scrollView as unknown as ScrollViewWithWebNode | null)?.getScrollableNode?.();
  scrollableNode?.scrollTo?.({ top: 0, left: 0, behavior: "smooth" });
  if (scrollableNode && typeof scrollableNode.scrollTop === "number") {
    scrollableNode.scrollTop = 0;
  }
}

function scrollPageListScaffoldToTop<ItemT>(list: FlatList<ItemT> | null) {
  list?.scrollToOffset({ offset: 0, animated: true });
}

/** FlatList's own key fallback (`item.key`, then `item.id`, then the index). */
function defaultListItemKey(item: unknown, index: number): string {
  if (item && typeof item === "object") {
    const { key, id } = item as { key?: unknown; id?: unknown };
    if (key != null) return String(key);
    if (id != null) return String(id);
  }
  return String(index);
}

type FontScaleKeyedListSlotProps = {
  slot: ComponentType<object> | ReactElement;
  layoutKey: string;
  /** Injected by VirtualizedList into an empty-list element (see below). */
  onLayout?: (event: LayoutChangeEvent) => void;
  style?: StyleProp<ViewStyle>;
};

type FontScaleKeyedListSlotElementProps = {
  onLayout?: (event: LayoutChangeEvent) => void;
  style?: StyleProp<ViewStyle>;
};

/**
 * Renders a list header/footer/empty slot under a key on the font scale, so a
 * text-size change remounts what it renders. VirtualizedList clones its empty
 * element with `onLayout` and a composed `style`; those land on this wrapper
 * and are passed on to the slot's element exactly as VirtualizedList would
 * have applied them (a fragment is left untouched, as it does).
 */
function FontScaleKeyedListSlot({ slot, layoutKey, onLayout, style }: FontScaleKeyedListSlotProps) {
  let element = (isValidElement(slot) ? slot : createElement(slot)) as ReactElement<FontScaleKeyedListSlotElementProps>;
  if ((onLayout || style !== undefined) && element.type !== Fragment) {
    const own = element.props;
    element = cloneElement<FontScaleKeyedListSlotElementProps>(element, {
      onLayout: (event: LayoutChangeEvent) => {
        onLayout?.(event);
        own.onLayout?.(event);
      },
      style: StyleSheet.compose(style, own.style),
    });
  }
  return <Fragment key={layoutKey}>{element}</Fragment>;
}

function fontScaleKeyedListSlot(
  slot: ComponentType<object> | ReactElement | null | undefined,
  fontScaleLayoutKey: string,
): ReactElement | undefined {
  if (slot == null) return undefined;
  return <FontScaleKeyedListSlot slot={slot} layoutKey={fontScaleLayoutKey} />;
}

function usePageContentStyle({
  nativeHeader,
  headerBarHeight,
  headerSearchBar,
  contentInsetAdjustmentBehavior,
}: {
  nativeHeader: boolean;
  headerBarHeight?: number;
  headerSearchBar?: boolean;
  contentInsetAdjustmentBehavior: NonNullable<ScrollViewProps["contentInsetAdjustmentBehavior"]>;
}) {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  // iOS: UIKit's adjusted inset clears the tab bar / home indicator. Android:
  // the floating tab bar overlays every page but the reader.
  const systemAdjustsBottomInset =
    Platform.OS === "ios" && contentInsetAdjustmentBehavior !== "never";
  const floatingTabBar =
    Platform.OS !== "ios" && shouldShowMobileFloatingTabBar(pathname);
  const gutters = useMobilePageGutters();
  // The native stack's measured header (0 when hidden). Title-to-content
  // spacing is derived from the bar actually on screen — Material's 64dp bar,
  // Duo layouts with trailing system bars — not from a window-size guess.
  const headerHeight = useContext(HeaderHeightContext);
  const insetAdjusted = Platform.OS === "ios" && Boolean(headerSearchBar);
  return useMemo(
    () => ({
      // Horizontal padding clears the landscape safe area (Dynamic Island,
      // rounded corners, Duo's vertical system bars on the trailing edge) as
      // well as the page gutter; the scroll view itself stays full-bleed so
      // backgrounds still run under the insets.
      paddingLeft: gutters.left,
      paddingRight: gutters.right,
      paddingTop: getMobilePageTopPadding({
        platform: Platform.OS,
        nativeHeader,
        safeAreaTop: insets.top,
        pageTop: spacing.pageTop,
        headerHeight,
        headerBarHeight,
        insetAdjusted,
      }),
      paddingBottom: getMobilePageContentBottomPadding({
        safeAreaBottom: insets.bottom,
        systemAdjustsBottomInset,
        floatingTabBar,
        tabBottom: spacing.tabBottom,
      }),
    }),
    [
      floatingTabBar,
      gutters.left,
      gutters.right,
      headerBarHeight,
      headerHeight,
      insetAdjusted,
      insets.bottom,
      insets.top,
      nativeHeader,
      systemAdjustsBottomInset,
    ],
  );
}

function usePageRefreshControl({
  nativeHeader,
  onRefresh,
  refreshDisabled,
  refreshLabel,
  refreshing,
}: {
  nativeHeader: boolean;
  onRefresh?: () => void;
  refreshDisabled?: boolean;
  refreshLabel?: string;
  refreshing: boolean;
}) {
  const { tokens } = useNemuTheme();
  const insets = useSafeAreaInsets();
  // iOS shows the spinner only for a refresh the person pulled (see
  // `resolveMobilePullToRefreshIndicatorVisible`): a background `refreshing`
  // must not push the page down under the see-through header.
  const [pulledByUser, setPulledByUser] = useState(false);
  const [previousRefreshing, setPreviousRefreshing] = useState(refreshing);
  if (previousRefreshing !== refreshing) {
    setPreviousRefreshing(refreshing);
    if (!refreshing) setPulledByUser(false);
  }
  const refreshingRef = useRef(refreshing);
  useLayoutEffect(() => {
    refreshingRef.current = refreshing;
  }, [refreshing]);
  const handleRefresh = useCallback(() => {
    if (!onRefresh) return;
    setPulledByUser(true);
    onRefresh();
    // A pull that started no refresh (a guard returned early) must not leave
    // the flag set for the next background refresh.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!refreshingRef.current) setPulledByUser(false);
      });
    });
  }, [onRefresh]);
  return onRefresh ? (
    <RefreshControl
      // iOS keeps the system spinner: default tint, no title text. Android has
      // no system default for the Material indicator, so it stays on brand.
      {...(Platform.OS === "ios"
        ? {}
        : { colors: [tokens.primary], progressBackgroundColor: tokens.card })}
      accessibilityLabel={refreshLabel}
      enabled={resolveMobilePullToRefreshEnabled({
        disabled: refreshDisabled,
        hasRefreshAction: true,
        refreshing,
      })}
      onRefresh={handleRefresh}
      progressViewOffset={nativeHeader ? spacing.pageTop : insets.top + spacing.pageTop}
      refreshing={resolveMobilePullToRefreshIndicatorVisible({
        platform: Platform.OS,
        refreshing,
        pulledByUser,
      })}
      titleColor={tokens.mutedForeground}
    />
  ) : undefined;
}


/**
 * Content-container style that makes a page's content exactly as tall as its
 * visible viewport (`resolveMobilePageViewportHeight`): `flexGrow: 1` so the
 * content can centre in the room, capped at the frame minus UIKit's adjusted
 * insets so it never becomes scrollable. iOS measures the scroll view's own
 * safe area with an observer sharing its frame.
 */
function usePageViewportFill({
  enabled,
  contentInsetAdjustmentBehavior,
}: {
  enabled: boolean;
  contentInsetAdjustmentBehavior: NonNullable<ScrollViewProps["contentInsetAdjustmentBehavior"]>;
}) {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const headerHeight = useContext(HeaderHeightContext);
  const { verticalBarSide } = useMobileAdaptiveLayout();
  const measuredTabBarInset = useMobileBottomTabBarInset();
  const [frameHeight, setFrameHeight] = useState<number | null>(null);
  const [observed, setObserved] = useState<{ top: number; bottom: number; height: number } | null>(null);
  const systemAdjustsInsets =
    Platform.OS === "ios" && contentInsetAdjustmentBehavior !== "never";
  const onFrameLayout = useCallback((event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.height;
    setFrameHeight((previous) => (previous !== null && Math.abs(previous - next) < 0.5 ? previous : next));
  }, []);
  const onObserverLayout = useCallback((layout: MobileWindowLayout) => {
    const safe = layout.safeAreaInsets;
    if (!safe) return;
    setObserved((previous) =>
      previous &&
      Math.abs(previous.top - safe.top) < 0.5 &&
      Math.abs(previous.bottom - safe.bottom) < 0.5 &&
      Math.abs(previous.height - layout.height) < 0.5
        ? previous
        : { top: safe.top, bottom: safe.bottom, height: layout.height },
    );
  }, []);
  const bottomBar =
    isMobileBottomTabBarRoute(pathname, Platform.OS) && verticalBarSide === null;
  const viewportHeight = resolveMobilePageViewportHeight({
    frameHeight: observed?.height ?? frameHeight,
    systemAdjustsInsets,
    observedInsets: observed,
    fallbackTopInset: typeof headerHeight === "number" && headerHeight > 0 ? headerHeight : insets.top,
    fallbackBottomInset: bottomBar
      ? (measuredTabBarInset ?? insets.bottom + MOBILE_IOS_TAB_BAR_FALLBACK_HEIGHT)
      : insets.bottom,
  });
  const style = useMemo<StyleProp<ViewStyle>>(
    () =>
      enabled
        ? { flexGrow: 1, ...(viewportHeight !== null ? { maxHeight: viewportHeight } : null) }
        : null,
    [enabled, viewportHeight],
  );
  const observer =
    enabled && systemAdjustsInsets ? (
      <WindowLayoutObserver style={StyleSheet.absoluteFill} onLayoutChange={onObserverLayout} />
    ) : null;
  return { style, observer, onFrameLayout };
}

export function PageScaffold({
  children,
  onRefresh,
  refreshDisabled,
  refreshLabel,
  refreshing = false,
  nativeHeader = false,
  contentInsetAdjustmentBehavior: requestedContentInsetAdjustment,
  headerBarHeight,
  headerSearchBar,
  barContentVisible,
  scrollRef,
  fillViewport = false,
  onScroll,
  scrollEventThrottle,
}: PageScaffoldProps) {
  const contentInsetAdjustmentBehavior = resolveMobilePageContentInsetAdjustment({
    platform: Platform.OS,
    nativeHeader,
    requested: requestedContentInsetAdjustment,
  });
  const { tokens } = useNemuTheme();
  const pathname = usePathname();
  const localScrollRef = useRef<ScrollViewInstance | null>(null);
  const rootTabHref = useMemo(
    () => exactMobileRootTabHrefForPathname(pathname),
    [pathname],
  );
  const edgeTracking = useNemuScrollEdgeTracking({
    systemAdjustsInsets: contentInsetAdjustmentBehavior !== "never",
  });
  const edgeRef = edgeTracking.ref as unknown as (value: ScrollViewInstance | null) => void;
  const setScrollRef = useCallback(
    (value: ScrollViewInstance | null) => {
      localScrollRef.current = value;
      edgeRef(value);
      assignScrollRef(scrollRef, value);
    },
    [edgeRef, scrollRef],
  );
  const contentStyle = usePageContentStyle({
    nativeHeader,
    headerBarHeight,
    headerSearchBar,
    contentInsetAdjustmentBehavior,
  });
  const fontScaleLayoutKey = useMobileFontScaleLayoutKey();
  const refreshControl = usePageRefreshControl({
    nativeHeader,
    onRefresh,
    refreshDisabled,
    refreshLabel,
    refreshing,
  });
  const viewportFill = usePageViewportFill({
    enabled: fillViewport,
    contentInsetAdjustmentBehavior,
  });

  useEffect(() => {
    if (!rootTabHref) return undefined;
    return subscribeMobileRootTabReselect(rootTabHref, () => {
      scrollPageScaffoldToTop(localScrollRef.current);
    });
  }, [rootTabHref]);

  return (
    <NemuScrollEdgeSurface
      nativeHeader={nativeHeader}
      barContentVisible={barContentVisible}
      headerBarHeight={headerBarHeight}
      tracking={edgeTracking}
    >
      {viewportFill.observer}
      <ScrollView
        ref={setScrollRef}
        style={[styles.root, { backgroundColor: tokens.background }]}
        alwaysBounceVertical={fillViewport ? true : undefined}
        automaticallyAdjustContentInsets={contentInsetAdjustmentBehavior !== "never"}
        automaticallyAdjustsScrollIndicatorInsets={contentInsetAdjustmentBehavior !== "never"}
        contentContainerStyle={fillViewport ? [contentStyle, viewportFill.style] : contentStyle}
        onLayout={fillViewport ? viewportFill.onFrameLayout : undefined}
        contentInsetAdjustmentBehavior={contentInsetAdjustmentBehavior}
        keyboardShouldPersistTaps="handled"
        refreshControl={refreshControl}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={onScroll ? (scrollEventThrottle ?? 32) : undefined}
      >
        <Fragment key={fontScaleLayoutKey}>{children}</Fragment>
      </ScrollView>
    </NemuScrollEdgeSurface>
  );
}

export function PageListScaffold<ItemT>({
  nativeHeader = false,
  onRefresh,
  refreshDisabled,
  refreshLabel,
  refreshing = false,
  contentInsetAdjustmentBehavior: requestedContentInsetAdjustment,
  headerBarHeight,
  headerSearchBar,
  contentContainerStyle,
  barContentVisible,
  scrollEdgePane,
  listRef,
  fillViewport = false,
  ...flatListProps
}: PageListScaffoldProps<ItemT>) {
  const contentInsetAdjustmentBehavior = resolveMobilePageContentInsetAdjustment({
    platform: Platform.OS,
    nativeHeader,
    requested: requestedContentInsetAdjustment,
  });
  const { tokens } = useNemuTheme();
  const pathname = usePathname();
  const localListRef = useRef<FlatList<ItemT> | null>(null);
  const rootTabHref = useMemo(
    () => exactMobileRootTabHrefForPathname(pathname),
    [pathname],
  );
  const edgeTracking = useNemuScrollEdgeTracking({
    systemAdjustsInsets: contentInsetAdjustmentBehavior !== "never",
  });
  const edgeRef = edgeTracking.ref as unknown as (value: FlatList<ItemT> | null) => void;
  const setListRef = useCallback(
    (value: FlatList<ItemT> | null) => {
      localListRef.current = value;
      edgeRef(value);
      assignFlatListRef(listRef, value);
    },
    [edgeRef, listRef],
  );
  const contentStyle = usePageContentStyle({
    nativeHeader,
    headerBarHeight,
    headerSearchBar,
    contentInsetAdjustmentBehavior,
  });
  const fontScaleLayoutKey = useMobileFontScaleLayoutKey();
  const refreshControl = usePageRefreshControl({
    nativeHeader,
    onRefresh,
    refreshDisabled,
    refreshLabel,
    refreshing,
  });
  const viewportFill = usePageViewportFill({
    enabled: fillViewport,
    contentInsetAdjustmentBehavior,
  });
  const { onLayout: callerOnLayout } = flatListProps;
  const onListLayout = useCallback(
    (event: LayoutChangeEvent) => {
      viewportFill.onFrameLayout(event);
      callerOnLayout?.(event);
    },
    [callerOnLayout, viewportFill.onFrameLayout],
  );
  // A text-size change remounts the list's rows and header/footer (their
  // text measures at the new size), never the list itself. A new scroll view
  // is not the one the native header tracks: UIKit then neither keeps it at
  // the top of a bar that grows or shrinks with the text (the header search
  // field covered the first row, or left a gap above it, until reopened) nor
  // settles its pull-to-refresh, and the scroll edge effect is not re-applied.
  // The kept scroll view stays pinned under the bar's new bottom.
  const { keyExtractor: callerKeyExtractor } = flatListProps;
  const keyExtractor = useCallback(
    (item: ItemT, index: number) =>
      `${fontScaleLayoutKey}:${(callerKeyExtractor ?? defaultListItemKey)(item, index)}`,
    [callerKeyExtractor, fontScaleLayoutKey],
  );

  useEffect(() => {
    if (!rootTabHref) return undefined;
    return subscribeMobileRootTabReselect(rootTabHref, () => {
      scrollPageListScaffoldToTop(localListRef.current);
    });
  }, [rootTabHref]);

  return (
    <NemuScrollEdgeSurface
      nativeHeader={nativeHeader}
      barContentVisible={barContentVisible}
      headerBarHeight={headerBarHeight}
      pane={scrollEdgePane}
      tracking={edgeTracking}
    >
      {viewportFill.observer}
      <FlatList
        ref={setListRef}
        style={[styles.root, { backgroundColor: tokens.background }]}
        automaticallyAdjustContentInsets={contentInsetAdjustmentBehavior !== "never"}
        automaticallyAdjustsScrollIndicatorInsets={contentInsetAdjustmentBehavior !== "never"}
        contentContainerStyle={[contentStyle, viewportFill.style, contentContainerStyle]}
        contentInsetAdjustmentBehavior={contentInsetAdjustmentBehavior}
        keyboardShouldPersistTaps="handled"
        refreshControl={refreshControl}
        showsVerticalScrollIndicator={false}
        {...flatListProps}
        alwaysBounceVertical={fillViewport ? true : flatListProps.alwaysBounceVertical}
        onLayout={onListLayout}
        keyExtractor={keyExtractor}
        ListHeaderComponent={fontScaleKeyedListSlot(flatListProps.ListHeaderComponent, fontScaleLayoutKey)}
        ListEmptyComponent={fontScaleKeyedListSlot(flatListProps.ListEmptyComponent, fontScaleLayoutKey)}
        ListFooterComponent={fontScaleKeyedListSlot(flatListProps.ListFooterComponent, fontScaleLayoutKey)}
      />
    </NemuScrollEdgeSurface>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
