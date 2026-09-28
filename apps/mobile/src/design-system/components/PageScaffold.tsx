import type { ScrollViewInstance } from "react-native";
import {
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type MutableRefObject,
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
  type ScrollViewProps,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNemuTheme } from "@/design/useNemuTheme";
import { spacing } from "@/design/tokens";
import { useMobilePageGutters } from "@/design/useMobilePageGutters";
import { getMobilePageContentBottomPadding } from "@/lib/mobileFloatingTabBarClearance";
import { resolveMobilePullToRefreshEnabled } from "@/lib/mobilePullToRefresh";
import { subscribeMobileRootTabReselect } from "@/lib/mobileRootTabReselect";
import { exactMobileRootTabHrefForPathname } from "@/lib/mobileRootTabs";
import { getMobileFontScaleLayoutKey } from "@/lib/mobileDynamicTypeLayout";
import { getMobilePageTopPadding } from "@/lib/mobilePageLayout";

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
  scrollRef?: Ref<ScrollViewInstance>;
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
  listRef?: Ref<FlatList<ItemT>>;
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

function usePageContentStyle({
  nativeHeader,
  headerBarHeight,
  headerSearchBar,
}: {
  nativeHeader: boolean;
  headerBarHeight?: number;
  headerSearchBar?: boolean;
}) {
  const insets = useSafeAreaInsets();
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
      paddingBottom: getMobilePageContentBottomPadding(insets.bottom),
    }),
    [gutters.left, gutters.right, headerBarHeight, headerHeight, insetAdjusted, insets.bottom, insets.top, nativeHeader],
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
      onRefresh={onRefresh}
      progressViewOffset={nativeHeader ? spacing.pageTop : insets.top + spacing.pageTop}
      refreshing={refreshing}
      titleColor={tokens.mutedForeground}
    />
  ) : undefined;
}

export function PageScaffold({
  children,
  onRefresh,
  refreshDisabled,
  refreshLabel,
  refreshing = false,
  nativeHeader = false,
  contentInsetAdjustmentBehavior = "never",
  headerBarHeight,
  headerSearchBar,
  scrollRef,
}: PageScaffoldProps) {
  const { tokens } = useNemuTheme();
  const pathname = usePathname();
  const localScrollRef = useRef<ScrollViewInstance | null>(null);
  const rootTabHref = useMemo(
    () => exactMobileRootTabHrefForPathname(pathname),
    [pathname],
  );
  const setScrollRef = useCallback(
    (value: ScrollViewInstance | null) => {
      localScrollRef.current = value;
      assignScrollRef(scrollRef, value);
    },
    [scrollRef],
  );
  const contentStyle = usePageContentStyle({
    nativeHeader,
    headerBarHeight,
    headerSearchBar,
  });
  const fontScaleLayoutKey = useMobileFontScaleLayoutKey();
  const refreshControl = usePageRefreshControl({
    nativeHeader,
    onRefresh,
    refreshDisabled,
    refreshLabel,
    refreshing,
  });

  useEffect(() => {
    if (!rootTabHref) return undefined;
    return subscribeMobileRootTabReselect(rootTabHref, () => {
      scrollPageScaffoldToTop(localScrollRef.current);
    });
  }, [rootTabHref]);

  return (
    <ScrollView
      ref={setScrollRef}
      style={[styles.root, { backgroundColor: tokens.background }]}
      automaticallyAdjustContentInsets={contentInsetAdjustmentBehavior !== "never"}
      automaticallyAdjustsScrollIndicatorInsets={contentInsetAdjustmentBehavior !== "never"}
      contentContainerStyle={contentStyle}
      contentInsetAdjustmentBehavior={contentInsetAdjustmentBehavior}
      keyboardShouldPersistTaps="handled"
      refreshControl={refreshControl}
      showsVerticalScrollIndicator={false}
    >
      <Fragment key={fontScaleLayoutKey}>{children}</Fragment>
    </ScrollView>
  );
}

export function PageListScaffold<ItemT>({
  nativeHeader = false,
  onRefresh,
  refreshDisabled,
  refreshLabel,
  refreshing = false,
  contentInsetAdjustmentBehavior = "never",
  headerBarHeight,
  headerSearchBar,
  contentContainerStyle,
  listRef,
  ...flatListProps
}: PageListScaffoldProps<ItemT>) {
  const { tokens } = useNemuTheme();
  const pathname = usePathname();
  const localListRef = useRef<FlatList<ItemT> | null>(null);
  const rootTabHref = useMemo(
    () => exactMobileRootTabHrefForPathname(pathname),
    [pathname],
  );
  const setListRef = useCallback(
    (value: FlatList<ItemT> | null) => {
      localListRef.current = value;
      assignFlatListRef(listRef, value);
    },
    [listRef],
  );
  const contentStyle = usePageContentStyle({
    nativeHeader,
    headerBarHeight,
    headerSearchBar,
  });
  const fontScaleLayoutKey = useMobileFontScaleLayoutKey();
  const refreshControl = usePageRefreshControl({
    nativeHeader,
    onRefresh,
    refreshDisabled,
    refreshLabel,
    refreshing,
  });

  useEffect(() => {
    if (!rootTabHref) return undefined;
    return subscribeMobileRootTabReselect(rootTabHref, () => {
      scrollPageListScaffoldToTop(localListRef.current);
    });
  }, [rootTabHref]);

  return (
    <FlatList
      key={fontScaleLayoutKey}
      ref={setListRef}
      style={[styles.root, { backgroundColor: tokens.background }]}
      automaticallyAdjustContentInsets={contentInsetAdjustmentBehavior !== "never"}
      automaticallyAdjustsScrollIndicatorInsets={contentInsetAdjustmentBehavior !== "never"}
      contentContainerStyle={[contentStyle, contentContainerStyle]}
      contentInsetAdjustmentBehavior={contentInsetAdjustmentBehavior}
      keyboardShouldPersistTaps="handled"
      refreshControl={refreshControl}
      showsVerticalScrollIndicator={false}
      {...flatListProps}
      ListEmptyComponent={flatListProps.ListEmptyComponent ?? undefined}
      ListFooterComponent={flatListProps.ListFooterComponent ?? undefined}
    />
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
