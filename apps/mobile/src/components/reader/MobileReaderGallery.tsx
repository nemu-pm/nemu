import {
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewToken,
} from "react-native";
import {
  GlassSurface,
  NemuButton,
  radius,
  nemuFontWeight,
  useNemuTheme,
} from "@/design-system";
import type { ChapterSummary, ReadingMode } from "@/data/schema";
import { formatChapterTitle } from "@/lib/formatChapter";
import { formatMobileString, type MobileStrings } from "@/lib/mobileI18n";
import { visualPageIndexesForMobileReaderSpread } from "@/lib/mobileReaderSpreads";
import type { MobileReaderPage } from "@/sources/mobileSourcePages";
import type { ReaderScrollPageMetric } from "@/lib/mobileReaderProgress";
import { readerDisplayIndexForViewableItems } from "@/lib/mobileReaderProgress";

type MobileReaderGalleryState = {
  status: string;
  detail: string;
  title?: string;
};

type MobileReaderGalleryProps = {
  accessibilityLabel: string;
  backgroundColor: string;
  bottomPadding: number;
  chapter: ChapterSummary;
  chromeTopPadding: number;
  completed: boolean;
  displayedPages: MobileReaderPage[];
  initialContentOffset: { x: number; y: number };
  scrollMountKey: string;
  isTwoPageMode: boolean;
  loading: boolean;
  mode: ReadingMode;
  onMomentumScrollEnd: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onScrollingPageLayout?: (
    pageIndex: number,
    metric: ReaderScrollPageMetric,
  ) => void;
  onScrollingVisiblePageChange?: (pageIndex: number) => void;
  onScrollingSeekFailed?: (pageIndex: number) => void;
  onRetry?: () => void;
  onToggleControls: () => void;
  pagedMode: boolean;
  pages: MobileReaderPage[];
  pagesState: MobileReaderGalleryState;
  readerImageWidth: number;
  readerPageWidth: number;
  readerScrollRef: RefObject<MobileReaderScrollHandle | null>;
  renderImage: (page: MobileReaderPage) => ReactNode;
  sourcePageForDisplayIndex: (displayIndex: number) => number;
  spreads: number[][];
  stateTopPadding: number;
  strings: MobileStrings;
  title: string;
  windowHeight: number;
};

export type MobileReaderScrollHandle = {
  scrollTo(options: {
    x?: number;
    y?: number;
    index?: number;
    animated?: boolean;
  }): void;
};

type MobileReaderGalleryItem =
  | { kind: "spread"; spread: number[] }
  | { kind: "page"; page: MobileReaderPage; index: number };

const READER_TAP_MAX_DISTANCE = 10;
const READER_TAP_MAX_DURATION_MS = 360;
// Must exceed the double-tap zoom gesture's maxDuration (260 ms in
// ZoomableReaderImageFrame) so the chrome toggle can be cancelled when a
// second tap turns the gesture into a zoom.
const READER_DOUBLE_TAP_WINDOW_MS = 280;
const READER_DARK_TEXT = "#f8fafc";
const READER_VIEWABILITY_CONFIG = Object.freeze({
  viewAreaCoveragePercentThreshold: 50,
});

export function MobileReaderGallery({
  accessibilityLabel,
  backgroundColor,
  bottomPadding,
  chapter,
  chromeTopPadding,
  completed,
  displayedPages,
  initialContentOffset,
  scrollMountKey,
  isTwoPageMode,
  loading,
  mode,
  onMomentumScrollEnd,
  onScroll,
  onScrollingPageLayout,
  onScrollingVisiblePageChange,
  onScrollingSeekFailed,
  onRetry,
  onToggleControls,
  pagedMode,
  pages,
  pagesState,
  readerImageWidth,
  readerPageWidth,
  readerScrollRef,
  renderImage,
  sourcePageForDisplayIndex,
  spreads,
  stateTopPadding,
  strings,
  title,
  windowHeight,
}: MobileReaderGalleryProps) {
  const { tokens } = useNemuTheme();
  const galleryItemCount = isTwoPageMode ? spreads.length : displayedPages.length;
  const touchStartRef = useRef<{
    x: number;
    y: number;
    time: number;
  } | null>(null);
  const pendingToggleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const lastTapEndAtRef = useRef(0);
  const onToggleControlsRef = useRef(onToggleControls);
  const onScrollingVisiblePageChangeRef = useRef(
    onScrollingVisiblePageChange,
  );
  const displayedPageCountRef = useRef(displayedPages.length);
  const appliedScrollMountKeyRef = useRef<string | null>(null);
  const listRef = useRef<FlatList<MobileReaderGalleryItem> | null>(null);
  const scrollToIndexRetryTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const pendingScrollToIndexRef = useRef<{
    index: number;
    animated: boolean;
    attempts: number;
  } | null>(null);
  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken<MobileReaderGalleryItem>[] }) => {
      const nextPageIndex = readerDisplayIndexForViewableItems(
        viewableItems.flatMap((token) => {
          if (!token.isViewable || token.item.kind !== "page") return [];
          return [token.item.index];
        }),
        displayedPageCountRef.current,
      );
      if (nextPageIndex != null) {
        onScrollingVisiblePageChangeRef.current?.(nextPageIndex);
      }
    },
    [],
  );

  useImperativeHandle(
    readerScrollRef,
    () => ({
      scrollTo({ x = 0, y = 0, index, animated = true }) {
        if (
          !pagedMode &&
          index != null &&
          Number.isFinite(index) &&
          galleryItemCount > 0
        ) {
          const targetIndex = Math.max(
            0,
            Math.min(galleryItemCount - 1, Math.round(index)),
          );
          pendingScrollToIndexRef.current = {
            index: targetIndex,
            animated,
            attempts: 0,
          };
          listRef.current?.scrollToIndex({
            index: targetIndex,
            animated,
            viewPosition: 0,
          });
          return;
        }
        listRef.current?.scrollToOffset({
          offset: pagedMode ? x : y,
          animated,
        });
      },
    }),
    [galleryItemCount, pagedMode],
  );

  const handleScrollToIndexFailed = (info: {
    index: number;
    highestMeasuredFrameIndex: number;
    averageItemLength: number;
  }) => {
    const pending = pendingScrollToIndexRef.current;
    const targetIndex = Math.max(
      0,
      Math.min(galleryItemCount - 1, pending?.index ?? info.index),
    );
    const attempts = (pending?.attempts ?? 0) + 1;
    listRef.current?.scrollToOffset({
      offset: Math.max(0, info.averageItemLength * targetIndex),
      animated: false,
    });
    if (attempts > 2) {
      pendingScrollToIndexRef.current = null;
      onScrollingSeekFailed?.(targetIndex);
      return;
    }
    pendingScrollToIndexRef.current = {
      index: targetIndex,
      animated: pending?.animated ?? false,
      attempts,
    };
    if (scrollToIndexRetryTimerRef.current) {
      clearTimeout(scrollToIndexRetryTimerRef.current);
    }
    scrollToIndexRetryTimerRef.current = setTimeout(() => {
      scrollToIndexRetryTimerRef.current = null;
      const retry = pendingScrollToIndexRef.current;
      if (!retry) return;
      listRef.current?.scrollToIndex({
        index: retry.index,
        animated: retry.animated,
        viewPosition: 0,
      });
    }, 50);
  };

  useLayoutEffect(() => {
    onToggleControlsRef.current = onToggleControls;
    onScrollingVisiblePageChangeRef.current = onScrollingVisiblePageChange;
    displayedPageCountRef.current = displayedPages.length;
  }, [displayedPages.length, onScrollingVisiblePageChange, onToggleControls]);

  useLayoutEffect(() => {
    return () => {
      if (pendingToggleTimerRef.current) {
        clearTimeout(pendingToggleTimerRef.current);
        pendingToggleTimerRef.current = null;
      }
      if (scrollToIndexRetryTimerRef.current) {
        clearTimeout(scrollToIndexRetryTimerRef.current);
        scrollToIndexRetryTimerRef.current = null;
      }
      pendingScrollToIndexRef.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    if (appliedScrollMountKeyRef.current === scrollMountKey) return;
    appliedScrollMountKeyRef.current = scrollMountKey;
    listRef.current?.scrollToOffset({
      offset: pagedMode ? initialContentOffset.x : initialContentOffset.y,
      animated: false,
    });
  }, [initialContentOffset, pagedMode, scrollMountKey]);
  const readerStatePadding = {
    paddingTop: stateTopPadding,
    paddingBottom: bottomPadding,
  };
  const renderedSinglePages = useMemo(
    () => displayedPages.map((page, index) => ({ page, index })),
    [displayedPages],
  );
  const pagedSinglePages = useMemo(
    () =>
      pagedMode && mode === "rtl"
        ? [...renderedSinglePages].reverse()
        : renderedSinglePages,
    [mode, pagedMode, renderedSinglePages],
  );
  const pagedSpreads = useMemo(
    () => (pagedMode && mode === "rtl" ? [...spreads].reverse() : spreads),
    [mode, pagedMode, spreads],
  );
  const galleryItems = useMemo<MobileReaderGalleryItem[]>(
    () =>
      isTwoPageMode
        ? pagedSpreads.map((spread) => ({ kind: "spread", spread }))
        : pagedSinglePages.map(({ page, index }) => ({
            kind: "page",
            page,
            index,
          })),
    [isTwoPageMode, pagedSinglePages, pagedSpreads],
  );
  const handleStageTouchStart = (event: GestureResponderEvent) => {
    const touch = event.nativeEvent;
    touchStartRef.current = {
      x: touch.pageX,
      y: touch.pageY,
      time: Date.now(),
    };
  };
  const handleStageTouchEnd = (event: GestureResponderEvent) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start) return;

    const touch = event.nativeEvent;
    const distance = Math.hypot(touch.pageX - start.x, touch.pageY - start.y);
    if (
      distance > READER_TAP_MAX_DISTANCE ||
      Date.now() - start.time > READER_TAP_MAX_DURATION_MS
    ) {
      return;
    }
    // Defer the toggle past the double-tap window: the zoom Tap gesture only
    // activates on the second tap, so an immediate toggle would flash the
    // chrome on every double-tap zoom. A second qualifying tap cancels the
    // pending toggle instead of scheduling another.
    const now = Date.now();
    const isSecondTap =
      now - lastTapEndAtRef.current <= READER_DOUBLE_TAP_WINDOW_MS;
    lastTapEndAtRef.current = now;
    if (pendingToggleTimerRef.current) {
      clearTimeout(pendingToggleTimerRef.current);
      pendingToggleTimerRef.current = null;
    }
    if (isSecondTap) return;
    pendingToggleTimerRef.current = setTimeout(() => {
      pendingToggleTimerRef.current = null;
      onToggleControlsRef.current();
    }, READER_DOUBLE_TAP_WINDOW_MS);
  };
  const isReaderLoading = loading || pagesState.status === "loading";
  const readerStageInteractionEnabled =
    !isReaderLoading && pagesState.status === "ready";

  return (
    <View
      accessible={pagesState.status === "ready"}
      accessibilityRole={pagesState.status === "ready" ? "button" : undefined}
      accessibilityLabel={
        pagesState.status === "ready" ? accessibilityLabel : undefined
      }
      pointerEvents={isReaderLoading ? "box-none" : "auto"}
      style={[styles.stageContainer, styles.stage, { backgroundColor }]}
      onTouchStart={
        readerStageInteractionEnabled ? handleStageTouchStart : undefined
      }
      onTouchEnd={
        readerStageInteractionEnabled ? handleStageTouchEnd : undefined
      }
    >
      {isReaderLoading ? (
        <View pointerEvents="none" style={styles.readerLoadingContainer}>
          <ActivityIndicator color={READER_DARK_TEXT} size="large" />
        </View>
      ) : pages.length ? (
        <FlatList
          key={scrollMountKey}
          ref={listRef}
          data={galleryItems}
          keyExtractor={(item) =>
            item.kind === "spread"
              ? `spread-${item.spread.join("-")}`
              : item.page.id
          }
          renderItem={({ item }) => {
            if (item.kind === "spread") {
              return (
                <View
                  style={[
                    styles.pagedFrame,
                    styles.spreadFrame,
                    {
                      width: readerPageWidth,
                      minHeight: windowHeight,
                    },
                  ]}
                >
                  {visualPageIndexesForMobileReaderSpread(
                    item.spread,
                    mode,
                  ).map((pageIndex) => {
                    const page = displayedPages[pageIndex];
                    if (!page) return null;
                    return (
                      <View key={page.id} style={styles.spreadPageSlot}>
                        {page.imageUri ? (
                          renderImage(page)
                        ) : (
                          <TextPage
                            width={readerImageWidth}
                            text={page.text}
                            fallbackPage={sourcePageForDisplayIndex(pageIndex)}
                            strings={strings}
                          />
                        )}
                      </View>
                    );
                  })}
                </View>
              );
            }

            const { page, index } = item;
            return (
              <View
                onLayout={
                  pagedMode || !onScrollingPageLayout
                    ? undefined
                    : (event) => {
                        const { y, height } = event.nativeEvent.layout;
                        onScrollingPageLayout(index, { y, height });
                      }
                }
                style={[
                  pagedMode ? styles.pagedFrame : styles.scrollingFrame,
                  pagedMode
                    ? {
                        width: readerPageWidth,
                        minHeight: windowHeight,
                      }
                    : { width: "100%" },
                ]}
              >
                {page.imageUri ? (
                  renderImage(page)
                ) : (
                  <TextPage
                    text={page.text}
                    fallbackPage={sourcePageForDisplayIndex(index)}
                    strings={strings}
                  />
                )}
              </View>
            );
          }}
          alwaysBounceHorizontal={false}
          alwaysBounceVertical={!pagedMode}
          bounces={false}
          contentInsetAdjustmentBehavior="never"
          decelerationRate={pagedMode ? "fast" : "normal"}
          directionalLockEnabled
          disableIntervalMomentum={pagedMode}
          horizontal={pagedMode}
          initialNumToRender={pagedMode ? 3 : 5}
          maxToRenderPerBatch={5}
          windowSize={7}
          viewabilityConfig={READER_VIEWABILITY_CONFIG}
          removeClippedSubviews={Platform.OS === "android"}
          getItemLayout={
            pagedMode
              ? (_data, index) => ({
                  index,
                  length: readerPageWidth,
                  offset: readerPageWidth * index,
                })
              : undefined
          }
          onMomentumScrollEnd={onMomentumScrollEnd}
          onScroll={onScroll}
          onScrollToIndexFailed={handleScrollToIndexFailed}
          onViewableItemsChanged={
            pagedMode ? undefined : onViewableItemsChanged
          }
          overScrollMode="never"
          pagingEnabled={pagedMode}
          scrollEventThrottle={32}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          snapToAlignment="center"
          snapToInterval={pagedMode ? readerPageWidth : undefined}
          contentContainerStyle={[
            pagedMode ? styles.pagedContent : styles.scrollingContent,
            pagedMode
              ? null
              : {
                  paddingTop: chromeTopPadding,
                  paddingBottom: bottomPadding,
                },
          ]}
          style={styles.readerScroll}
        />
      ) : (
        <ScrollView
          alwaysBounceVertical={false}
          bounces={false}
          contentContainerStyle={[
            styles.readerStateContent,
            readerStatePadding,
          ]}
          contentInsetAdjustmentBehavior="never"
          showsVerticalScrollIndicator={false}
          style={styles.readerStateScroll}
        >
          <GlassSurface
            style={styles.pageShell}
            contentStyle={styles.pageContent}
          >
            <Text
              numberOfLines={2}
              style={[styles.readerTitle, { color: tokens.foreground }]}
            >
              {pagesState.title ?? formatChapterTitle(chapter, strings)}
            </Text>
            <Text
              numberOfLines={2}
              style={[styles.readerSubtitle, { color: tokens.mutedForeground }]}
            >
              {title}
            </Text>
            <View
              style={[styles.readerDivider, { backgroundColor: tokens.border }]}
            />
            <Text style={[styles.readerText, { color: tokens.mutedForeground }]}>
              {pagesState.detail}
            </Text>
            {pagesState.status === "error" && onRetry ? (
              <NemuButton
                label={strings.common.retry}
                variant="outline"
                onPress={onRetry}
              />
            ) : null}
            <View style={[styles.progressPill, { backgroundColor: tokens.muted }]}>
              <Text
                style={[
                  styles.progressPillText,
                  { color: tokens.mutedForeground },
                ]}
              >
                {pagesState.status === "blocked" || pagesState.status === "error"
                  ? strings.reader.pageLoadingUnavailable
                  : completed
                    ? strings.reader.markedComplete
                    : strings.reader.progressNotCompleted}
              </Text>
            </View>
          </GlassSurface>
        </ScrollView>
      )}
    </View>
  );
}

function TextPage({
  fallbackPage,
  strings,
  text,
  width,
}: {
  fallbackPage: number;
  strings: MobileStrings;
  text?: string | null;
  width?: number;
}) {
  const { tokens } = useNemuTheme();

  return (
    <GlassSurface
      style={[styles.textPageShell, width ? { width } : null]}
      contentStyle={styles.textPageContent}
    >
      <Text style={[styles.textPageText, { color: tokens.foreground }]}>
        {text ??
          formatMobileString(strings.reader.pageFallback, {
            page: fallbackPage,
          })}
      </Text>
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  stageContainer: {
    flex: 1,
  },
  stage: {
    flex: 1,
    alignItems: "stretch",
    justifyContent: "center",
  },
  readerStateScroll: {
    flex: 1,
    alignSelf: "stretch",
  },
  readerStateContent: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  readerLoadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  readerScroll: {
    flex: 1,
    alignSelf: "stretch",
  },
  pagedContent: {
    alignItems: "center",
  },
  scrollingContent: {
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
  },
  pagedFrame: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  spreadFrame: {
    flexDirection: "row",
    gap: 6,
  },
  spreadPageSlot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollingFrame: {
    alignItems: "center",
  },
  pageShell: {
    width: "88%",
    maxWidth: 420,
    minHeight: 440,
    borderRadius: radius.xl,
  },
  pageContent: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 24,
  },
  textPageShell: {
    width: "100%",
    maxWidth: 420,
    minHeight: 320,
    borderRadius: radius.xl,
  },
  textPageContent: {
    justifyContent: "center",
    padding: 22,
  },
  textPageText: {
    fontSize: 16,
    lineHeight: 24,
  },
  readerTitle: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: nemuFontWeight.semibold,
    textAlign: "center",
  },
  readerSubtitle: {
    fontSize: 14,
    lineHeight: 19,
    textAlign: "center",
  },
  readerDivider: {
    width: 54,
    height: StyleSheet.hairlineWidth,
    marginVertical: 6,
  },
  readerText: {
    maxWidth: 290,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
  },
  progressPill: {
    minHeight: 30,
    justifyContent: "center",
    borderRadius: radius.md,
    marginTop: 4,
    paddingHorizontal: 10,
  },
  progressPillText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: nemuFontWeight.medium,
  },
});
