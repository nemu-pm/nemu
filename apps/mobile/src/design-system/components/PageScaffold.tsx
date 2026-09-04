import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type MutableRefObject,
  type ReactNode,
  type Ref,
} from "react";
import { usePathname } from "expo-router";
import {
  FlatList,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  type FlatListProps,
  type ScrollViewProps,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNemuTheme } from "@/design/useNemuTheme";
import { spacing } from "@/design/tokens";
import { getMobilePageContentBottomPadding } from "@/lib/mobileFloatingTabBarClearance";
import { resolveMobilePullToRefreshEnabled } from "@/lib/mobilePullToRefresh";
import { subscribeMobileRootTabReselect } from "@/lib/mobileRootTabReselect";
import { exactMobileRootTabHrefForPathname } from "@/lib/mobileRootTabs";

type PageScaffoldProps = {
  children: ReactNode;
  onRefresh?: () => void;
  refreshDisabled?: boolean;
  refreshLabel?: string;
  refreshing?: boolean;
  nativeHeader?: boolean;
  contentInsetAdjustmentBehavior?: ScrollViewProps["contentInsetAdjustmentBehavior"];
  scrollRef?: Ref<ScrollView>;
};

type PageListScaffoldProps<ItemT> = Omit<
  FlatListProps<ItemT>,
  | "automaticallyAdjustContentInsets"
  | "automaticallyAdjustsScrollIndicatorInsets"
  | "contentInsetAdjustmentBehavior"
  | "refreshControl"
  | "showsVerticalScrollIndicator"
> & {
  nativeHeader?: boolean;
  onRefresh?: () => void;
  refreshDisabled?: boolean;
  refreshLabel?: string;
  refreshing?: boolean;
  contentInsetAdjustmentBehavior?: ScrollViewProps["contentInsetAdjustmentBehavior"];
  listRef?: Ref<FlatList<ItemT>>;
};

type ScrollableWebNode = {
  scrollTo?: (options: { behavior?: "auto" | "smooth"; left?: number; top?: number }) => void;
  scrollTop?: number;
};

type ScrollViewWithWebNode = ScrollView & {
  getScrollableNode?: () => ScrollableWebNode | null;
};

function assignScrollRef(ref: Ref<ScrollView> | undefined, value: ScrollView | null) {
  if (!ref) return;
  if (typeof ref === "function") {
    ref(value);
    return;
  }
  (ref as MutableRefObject<ScrollView | null>).current = value;
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

function scrollPageScaffoldToTop(scrollView: ScrollView | null) {
  scrollView?.scrollTo({ y: 0, animated: true });
  const scrollableNode = (scrollView as ScrollViewWithWebNode | null)?.getScrollableNode?.();
  scrollableNode?.scrollTo?.({ top: 0, left: 0, behavior: "smooth" });
  if (scrollableNode && typeof scrollableNode.scrollTop === "number") {
    scrollableNode.scrollTop = 0;
  }
}

function scrollPageListScaffoldToTop<ItemT>(list: FlatList<ItemT> | null) {
  list?.scrollToOffset({ offset: 0, animated: true });
}

function usePageContentStyle(nativeHeader: boolean) {
  const insets = useSafeAreaInsets();
  return [
    styles.content,
    {
      paddingTop: nativeHeader ? spacing.pageTop : insets.top + spacing.pageTop,
      paddingBottom: getMobilePageContentBottomPadding(insets.bottom),
    },
  ];
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
  scrollRef,
}: PageScaffoldProps) {
  const { tokens } = useNemuTheme();
  const pathname = usePathname();
  const localScrollRef = useRef<ScrollView | null>(null);
  const rootTabHref = useMemo(
    () => exactMobileRootTabHrefForPathname(pathname),
    [pathname],
  );
  const setScrollRef = useCallback(
    (value: ScrollView | null) => {
      localScrollRef.current = value;
      assignScrollRef(scrollRef, value);
    },
    [scrollRef],
  );
  const contentStyle = usePageContentStyle(nativeHeader);
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
      {children}
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
  const contentStyle = usePageContentStyle(nativeHeader);
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
    />
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.pageX,
  },
});
