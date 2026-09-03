import {
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import {
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
import Animated from "react-native-reanimated";
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
import {
  getReaderContinuousScrollMetrics,
  readerContinuousAccessibilityAction,
  readerContinuousRelayoutProgress,
  readerScrollToIndexRetryLimit,
  readerContinuousScrollOffsetForProgress,
  readerDisplayIndexForViewableItems,
  type ReaderContinuousScrollMetrics,
  type ReaderScrollPageMetric,
} from "@/lib/mobileReaderProgress";
import { isReaderAdvancePastEndDrag } from "./readerEdgeDrag";
import {
  isReaderStageTapEnabled,
  isReaderTapInsideChrome,
  readerTapZoneForPosition,
} from "./readerTapZones";
import {
  getMobileReaderLogicalOffsetForProgress,
  getMobileReaderLogicalAccessibilityPercent,
  getMobileReaderLogicalScrollProgress,
  isMobileReaderLogicalEndReached,
  type MobileReaderSegmentFrame,
} from "@/lib/mobileReaderSegmentedImage";
import {
  useSkeletonDisplayDelay,
  useSkeletonPulse,
} from "@/lib/useSkeletonPulse";

type MobileReaderGalleryState = {
  status: string;
  detail: string;
  title?: string;
};

type MobileReaderGalleryProps = {
  accessibilityLabel: string;
  accessibilityHidden?: boolean;
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
  longStripPresentationMode?: boolean;
  longStripContentIdentity?: string;
  continuousContentIdentity?: string;
  initialLongStripScrollProgress?: number;
  mode: ReadingMode;
  onMomentumScrollEnd: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onScrollingPageLayout?: (
    pageIndex: number,
    metric: ReaderScrollPageMetric,
  ) => void;
  onScrollingVisiblePageChange?: (pageIndex: number) => void;
  onScrollingSeekFailed?: (pageIndex: number) => void;
  onContinuousScrollMetricsChange?: (
    metrics: ReaderContinuousScrollMetrics,
  ) => void;
  /** User touch always supersedes queued restore/seek work. */
  onUserScrollBegin?: () => void;
  onRetry?: () => void;
  /** Steps one page in source order. Only wired in paged reading modes. */
  onPageStep?: (direction: "previous" | "next") => void;
  /** The reader tried to move past the final page of the chapter. */
  onRequestAdvancePastEnd?: () => void;
  onSegmentedLogicalEndReached?: () => void;
  onLongStripScrollProgressChange?: (
    contentIdentity: string,
    progress: number,
  ) => void;
  /** Escape hatch for a source that refuses to serve pages. */
  onOpenSourceSettings?: () => void;
  onToggleControls: () => void;
  /** Prevents modal/sheet taps from reaching the reader's page-turn zones. */
  tapGesturesEnabled?: boolean;
  pagedMode: boolean;
  /**
   * Keeps page-turn screen-reader actions when a paged chapter uses a
   * vertically scrollable presentation for one extreme long strip.
   */
  pageTurnAccessibilityEnabled?: boolean;
  pages: MobileReaderPage[];
  pagesState: MobileReaderGalleryState;
  readerImageWidth: number;
  readerPageWidth: number;
  readerScrollRef: RefObject<MobileReaderScrollHandle | null>;
  renderImage: (page: MobileReaderPage) => ReactNode;
  renderImageSegment?: (frame: MobileReaderSegmentFrame) => ReactNode;
  segmentedImageFrames?: ReadonlyArray<MobileReaderSegmentFrame>;
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
  scrollToProgress(progress: number, animated?: boolean): boolean;
  scrollToProgressAfterContentChange(progress: number): void;
};

type MobileReaderGalleryItem =
  | { kind: "spread"; spread: number[] }
  | { kind: "page"; page: MobileReaderPage; index: number }
  | { kind: "segment"; frame: MobileReaderSegmentFrame };

const READER_TAP_MAX_DISTANCE = 10;
const READER_TAP_MAX_DURATION_MS = 360;
// Must exceed the double-tap zoom gesture's maxDuration (260 ms in
// ZoomableReaderImageFrame) so the chrome toggle can be cancelled when a
// second tap turns the gesture into a zoom.
const READER_DOUBLE_TAP_WINDOW_MS = 280;
const READER_VIEWABILITY_CONFIG = Object.freeze({
  viewAreaCoveragePercentThreshold: 50,
});

export function MobileReaderGallery({
  accessibilityLabel,
  accessibilityHidden = false,
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
  longStripPresentationMode = false,
  longStripContentIdentity,
  continuousContentIdentity,
  initialLongStripScrollProgress,
  mode,
  onMomentumScrollEnd,
  onScroll,
  onScrollingPageLayout,
  onScrollingVisiblePageChange,
  onScrollingSeekFailed,
  onContinuousScrollMetricsChange,
  onUserScrollBegin,
  onRetry,
  onPageStep,
  onRequestAdvancePastEnd,
  onSegmentedLogicalEndReached,
  onLongStripScrollProgressChange,
  onOpenSourceSettings,
  onToggleControls,
  tapGesturesEnabled = true,
  pagedMode,
  pageTurnAccessibilityEnabled,
  pages,
  pagesState,
  readerImageWidth,
  readerPageWidth,
  readerScrollRef,
  renderImage,
  renderImageSegment,
  segmentedImageFrames,
  sourcePageForDisplayIndex,
  spreads,
  stateTopPadding,
  strings,
  title,
  windowHeight,
}: MobileReaderGalleryProps) {
  const { tokens, reduceMotion } = useNemuTheme();
  const readerSkeletonOpacity = useSkeletonPulse(reduceMotion === true);
  const readerSkeletonVisible = useSkeletonDisplayDelay(150);
  const segmentedMode = Boolean(segmentedImageFrames?.length);
  const logicalLongStripMode = longStripPresentationMode || segmentedMode;
  const resolvedContinuousContentIdentity =
    longStripContentIdentity ?? continuousContentIdentity ?? scrollMountKey;
  const [logicalScrollAccessibility, setLogicalScrollAccessibility] = useState(
    () => ({ scrollMountKey, percent: 0 }),
  );
  const logicalScrollPercent =
    logicalScrollAccessibility.scrollMountKey === scrollMountKey
      ? logicalScrollAccessibility.percent
      : 0;
  const galleryItemCount = segmentedMode
    ? segmentedImageFrames!.length
    : isTwoPageMode
      ? spreads.length
      : displayedPages.length;
  const touchStartRef = useRef<{
    x: number;
    y: number;
    time: number;
  } | null>(null);
  const pendingToggleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const lastTapEndAtRef = useRef(0);
  const dragStartOffsetRef = useRef<number | null>(null);
  const latestScrollMetricsRef = useRef<ReaderContinuousScrollMetrics>(
    getReaderContinuousScrollMetrics({
      contentOffset: 0,
      contentLength: 0,
      viewportLength: 0,
    }),
  );
  const priorContinuousContentIdentityRef = useRef<string | null>(null);
  const pendingLogicalScrollProgressRef = useRef<number | null>(null);
  const pendingContentSizeScrollProgressRef = useRef<{
    contentIdentity: string;
    progress: number;
  } | null>(null);
  const onToggleControlsRef = useRef(onToggleControls);
  const onPageStepRef = useRef(onPageStep);
  const onRequestAdvancePastEndRef = useRef(onRequestAdvancePastEnd);
  const onScrollingVisiblePageChangeRef = useRef(onScrollingVisiblePageChange);
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
    ({
      viewableItems,
    }: {
      viewableItems: ViewToken<MobileReaderGalleryItem>[];
    }) => {
      const nextPageIndex = readerDisplayIndexForViewableItems(
        viewableItems.flatMap((token) => {
          if (!token.isViewable) return [];
          if (token.item.kind === "segment") return [0];
          if (token.item.kind === "page") return [token.item.index];
          return [];
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
      scrollToProgress(progress, animated = false) {
        if (pagedMode) return false;
        const metrics = latestScrollMetricsRef.current;
        if (!metrics.scrollable) return false;
        if (scrollToIndexRetryTimerRef.current) {
          clearTimeout(scrollToIndexRetryTimerRef.current);
          scrollToIndexRetryTimerRef.current = null;
        }
        pendingScrollToIndexRef.current = null;
        listRef.current?.scrollToOffset({
          offset: readerContinuousScrollOffsetForProgress(progress, metrics),
          animated,
        });
        return true;
      },
      scrollToProgressAfterContentChange(progress) {
        pendingContentSizeScrollProgressRef.current = {
          contentIdentity: resolvedContinuousContentIdentity,
          progress: Number.isFinite(progress)
            ? Math.max(0, Math.min(1, progress))
            : 0,
        };
      },
    }),
    [
      galleryItemCount,
      pagedMode,
      resolvedContinuousContentIdentity,
    ],
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
    if (attempts > readerScrollToIndexRetryLimit(galleryItemCount)) {
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
    }, 100);
  };

  useLayoutEffect(() => {
    onToggleControlsRef.current = onToggleControls;
    onPageStepRef.current = onPageStep;
    onRequestAdvancePastEndRef.current = onRequestAdvancePastEnd;
    onScrollingVisiblePageChangeRef.current = onScrollingVisiblePageChange;
    displayedPageCountRef.current = displayedPages.length;
  }, [
    displayedPages.length,
    onPageStep,
    onRequestAdvancePastEnd,
    onScrollingVisiblePageChange,
    onToggleControls,
  ]);

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
      pendingContentSizeScrollProgressRef.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    if (tapGesturesEnabled) return;
    touchStartRef.current = null;
    lastTapEndAtRef.current = 0;
    if (pendingToggleTimerRef.current) {
      clearTimeout(pendingToggleTimerRef.current);
      pendingToggleTimerRef.current = null;
    }
  }, [tapGesturesEnabled]);

  useLayoutEffect(() => {
    if (appliedScrollMountKeyRef.current === scrollMountKey) return;
    touchStartRef.current = null;
    lastTapEndAtRef.current = 0;
    if (pendingToggleTimerRef.current) {
      clearTimeout(pendingToggleTimerRef.current);
      pendingToggleTimerRef.current = null;
    }
    if (scrollToIndexRetryTimerRef.current) {
      clearTimeout(scrollToIndexRetryTimerRef.current);
      scrollToIndexRetryTimerRef.current = null;
    }
    pendingScrollToIndexRef.current = null;
    const currentProgress = getMobileReaderLogicalScrollProgress(
      latestScrollMetricsRef.current,
    );
    const persistedProgress =
      Number.isFinite(initialLongStripScrollProgress) &&
      initialLongStripScrollProgress != null &&
      initialLongStripScrollProgress >= 0 &&
      initialLongStripScrollProgress <= 1
        ? initialLongStripScrollProgress
        : null;
    const pendingContentSizeProgress =
      pendingContentSizeScrollProgressRef.current;
    pendingLogicalScrollProgressRef.current =
      !pagedMode
        ? readerContinuousRelayoutProgress({
            sameContent:
              priorContinuousContentIdentityRef.current ===
              resolvedContinuousContentIdentity,
            currentProgress,
            pendingProgress:
              pendingContentSizeProgress?.contentIdentity ===
              resolvedContinuousContentIdentity
                ? pendingContentSizeProgress.progress
                : pendingLogicalScrollProgressRef.current,
            initialProgress: logicalLongStripMode ? persistedProgress : null,
          })
        : null;
    priorContinuousContentIdentityRef.current =
      resolvedContinuousContentIdentity;
    appliedScrollMountKeyRef.current = scrollMountKey;
    latestScrollMetricsRef.current = getReaderContinuousScrollMetrics({
      contentOffset: 0,
      contentLength: 0,
      viewportLength: 0,
    });
    dragStartOffsetRef.current = null;
    listRef.current?.scrollToOffset({
      offset: pagedMode ? initialContentOffset.x : initialContentOffset.y,
      animated: false,
    });
  }, [
    initialContentOffset,
    initialLongStripScrollProgress,
    logicalLongStripMode,
    pagedMode,
    resolvedContinuousContentIdentity,
    scrollMountKey,
  ]);
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
      segmentedMode
        ? (segmentedImageFrames ?? []).map((frame) => ({
            kind: "segment" as const,
            frame,
          }))
        : isTwoPageMode
          ? pagedSpreads.map((spread) => ({ kind: "spread", spread }))
          : pagedSinglePages.map(({ page, index }) => ({
              kind: "page",
              page,
              index,
            })),
    [
      isTwoPageMode,
      pagedSinglePages,
      pagedSpreads,
      segmentedImageFrames,
      segmentedMode,
    ],
  );
  const pagingBehaviorProps = pagedMode
    ? {
        decelerationRate: "fast" as const,
        disableIntervalMomentum: true,
        pagingEnabled: true,
        snapToAlignment: "center" as const,
        snapToInterval: readerPageWidth,
      }
    : {
        decelerationRate: "normal" as const,
      };
  const handleStageTouchStart = (event: GestureResponderEvent) => {
    const touch = event.nativeEvent;
    if (
      isReaderTapInsideChrome({
        y: touch.pageY,
        height: windowHeight,
        topInset: chromeTopPadding,
        bottomInset: bottomPadding,
      })
    ) {
      touchStartRef.current = null;
      return;
    }
    touchStartRef.current = {
      x: touch.pageX,
      y: touch.pageY,
      time: Date.now(),
    };
  };
  const isReaderLoading = loading || pagesState.status === "loading";
  // The chrome toggle is the only way out of a black screen, so it must keep
  // working while the chapter is in an error/blocked state. Only page turns
  // need a ready gallery.
  const readerStageTapEnabled = isReaderStageTapEnabled({
    tapGesturesEnabled,
    loading: isReaderLoading,
  });
  const readerPageTurnEnabled =
    !isReaderLoading &&
    pagesState.status === "ready" &&
    pages.length > 0 &&
    pagedMode &&
    Boolean(onPageStep);
  const readerAccessibilityPageTurnEnabled =
    !isReaderLoading &&
    pagesState.status === "ready" &&
    pages.length > 0 &&
    ((pageTurnAccessibilityEnabled ?? pagedMode) || logicalLongStripMode) &&
    Boolean(onPageStep);
  const recordContinuousScrollMetrics = useCallback(
    (
      metrics: {
        contentOffset: number;
        contentLength: number;
        viewportLength: number;
      },
      notifyPersistence: boolean,
    ) => {
      const normalizedMetrics = getReaderContinuousScrollMetrics(metrics);
      latestScrollMetricsRef.current = normalizedMetrics;
      onContinuousScrollMetricsChange?.(normalizedMetrics);
      if (logicalLongStripMode) {
        const percent = getMobileReaderLogicalAccessibilityPercent(
          normalizedMetrics,
        );
        setLogicalScrollAccessibility((current) =>
          current.scrollMountKey === scrollMountKey &&
          current.percent === percent
            ? current
            : { scrollMountKey, percent },
        );
      }
      if (!notifyPersistence || !longStripContentIdentity) return;
      const progress = getMobileReaderLogicalScrollProgress(normalizedMetrics);
      if (progress != null) {
        onLongStripScrollProgressChange?.(longStripContentIdentity, progress);
      }
    },
    [
      longStripContentIdentity,
      logicalLongStripMode,
      onContinuousScrollMetricsChange,
      onLongStripScrollProgressChange,
      scrollMountKey,
    ],
  );
  const handleStageTouchEnd = (event: GestureResponderEvent) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start) return;

    const touch = event.nativeEvent;
    if (
      !pagedMode &&
      pagesState.status === "ready" &&
      pages.length > 0 &&
      onRequestAdvancePastEndRef.current &&
      isReaderAdvancePastEndDrag({
        startOffset: latestScrollMetricsRef.current.contentOffset,
        endOffset: latestScrollMetricsRef.current.contentOffset,
        maxOffset: latestScrollMetricsRef.current.maximumOffset,
        gestureDelta: touch.pageY - start.y,
        mode,
        pagedMode,
      })
    ) {
      if (logicalLongStripMode) onSegmentedLogicalEndReached?.();
      onRequestAdvancePastEndRef.current();
      return;
    }
    const distance = Math.hypot(touch.pageX - start.x, touch.pageY - start.y);
    if (
      distance > READER_TAP_MAX_DISTANCE ||
      Date.now() - start.time > READER_TAP_MAX_DURATION_MS
    ) {
      return;
    }
    const zone = readerPageTurnEnabled
      ? readerTapZoneForPosition({
          x: touch.pageX,
          width: readerPageWidth,
          mode,
          pagedMode,
        })
      : "toggle";
    // Defer the action past the double-tap window: the zoom Tap gesture only
    // activates on the second tap, so acting immediately would flash the
    // chrome — or turn a page — under every double-tap zoom. Double-tap zoom
    // covers the whole page frame including the edge zones, so page turns use
    // the same window rather than an inconsistent mix of timings. A second
    // qualifying tap cancels the pending action instead of scheduling another.
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
      if (zone === "toggle") {
        onToggleControlsRef.current();
        return;
      }
      onPageStepRef.current?.(zone);
    }, READER_DOUBLE_TAP_WINDOW_MS);
  };
  const handleScrollBeginDrag = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    if (scrollToIndexRetryTimerRef.current) {
      clearTimeout(scrollToIndexRetryTimerRef.current);
      scrollToIndexRetryTimerRef.current = null;
    }
    pendingScrollToIndexRef.current = null;
    pendingLogicalScrollProgressRef.current = null;
    pendingContentSizeScrollProgressRef.current = null;
    onUserScrollBegin?.();
    const { contentOffset } = event.nativeEvent;
    dragStartOffsetRef.current = pagedMode ? contentOffset.x : contentOffset.y;
  };
  const handleGalleryScroll = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    if (!pagedMode) {
      const { contentOffset, contentSize, layoutMeasurement } =
        event.nativeEvent;
      const metrics = {
        contentOffset: contentOffset.y,
        // Progress follows the physical native scroll range, including the
        // toolbar-safe trailing inset. Otherwise 100% lands before the last
        // image can clear the chrome and releasing the end thumb snaps back.
        contentLength: contentSize.height,
        viewportLength: layoutMeasurement.height,
      };
      recordContinuousScrollMetrics(metrics, logicalLongStripMode);
      if (
        logicalLongStripMode &&
        isMobileReaderLogicalEndReached(metrics)
      ) {
        onSegmentedLogicalEndReached?.();
      }
    }
    onScroll(event);
  };
  const handleGalleryContentSizeChange = (_width: number, height: number) => {
    if (pagedMode) return;
    const measuredMetrics = getReaderContinuousScrollMetrics({
      contentOffset: latestScrollMetricsRef.current.contentOffset,
      contentLength: height,
      viewportLength:
        latestScrollMetricsRef.current.viewportLength > 0
          ? latestScrollMetricsRef.current.viewportLength
          : windowHeight,
    });
    recordContinuousScrollMetrics(measuredMetrics, false);
    const progress = pendingLogicalScrollProgressRef.current;
    const pendingContentSizeProgress =
      pendingContentSizeScrollProgressRef.current;
    const contentSizeProgress =
      pendingContentSizeProgress?.contentIdentity ===
      resolvedContinuousContentIdentity
        ? pendingContentSizeProgress.progress
        : null;
    if (pendingContentSizeProgress && contentSizeProgress == null) {
      pendingContentSizeScrollProgressRef.current = null;
    }
    if (contentSizeProgress == null && progress == null) {
      return;
    }
    pendingContentSizeScrollProgressRef.current = null;
    pendingLogicalScrollProgressRef.current = null;
    const targetProgress = contentSizeProgress ?? progress ?? 0;
    const offset = getMobileReaderLogicalOffsetForProgress({
      progress: targetProgress,
      contentLength: measuredMetrics.contentLength,
      viewportLength: measuredMetrics.viewportLength,
    });
    recordContinuousScrollMetrics(
      {
        contentOffset: offset,
        contentLength: measuredMetrics.contentLength,
        viewportLength: measuredMetrics.viewportLength,
      },
      false,
    );
    listRef.current?.scrollToOffset({ offset, animated: false });
  };
  const handleGalleryLayout = (event: {
    nativeEvent: { layout: { height: number } };
  }) => {
    if (pagedMode) return;
    recordContinuousScrollMetrics(
      getReaderContinuousScrollMetrics({
        ...latestScrollMetricsRef.current,
        viewportLength: event.nativeEvent.layout.height,
      }),
      false,
    );
  };
  const handleScrollEndDrag = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    const startOffset = dragStartOffsetRef.current;
    dragStartOffsetRef.current = null;
    if (startOffset == null) return;
    if (!onRequestAdvancePastEndRef.current) return;
    if (pagesState.status !== "ready" || pages.length === 0) return;

    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const endOffset = pagedMode ? contentOffset.x : contentOffset.y;
    const maxOffset = pagedMode
      ? contentSize.width - layoutMeasurement.width
      : contentSize.height - layoutMeasurement.height;
    if (
      !isReaderAdvancePastEndDrag({
        startOffset,
        endOffset,
        maxOffset,
        mode,
        pagedMode,
      })
    ) {
      return;
    }
    if (logicalLongStripMode) onSegmentedLogicalEndReached?.();
    onRequestAdvancePastEndRef.current();
  };
  // VoiceOver reads the stage as a single element; expose page turns as
  // actions on that element rather than as separate focusable hit zones.
  const stageAccessibilityActions =
    pagesState.status === "ready"
      ? [
          { name: "activate", label: accessibilityLabel },
          ...(readerAccessibilityPageTurnEnabled
            ? [
                {
                  name: "nextPage",
                  label: isTwoPageMode
                    ? strings.reader.nextSpread
                    : strings.reader.nextPage,
                },
                {
                  name: "previousPage",
                  label: isTwoPageMode
                    ? strings.reader.previousSpread
                    : strings.reader.previousPage,
                },
              ]
            : []),
        ]
      : undefined;

  return (
    <View
      accessible={!accessibilityHidden && pagesState.status === "ready"}
      accessibilityElementsHidden={accessibilityHidden}
      importantForAccessibility={
        accessibilityHidden ? "no-hide-descendants" : "auto"
      }
      accessibilityRole={pagesState.status === "ready" ? "button" : undefined}
      accessibilityLabel={
        pagesState.status === "ready"
          ? logicalLongStripMode
            ? `${accessibilityLabel}. ${formatMobileString(
                strings.reader.longStripProgress,
                { percent: logicalScrollPercent },
              )}`
            : accessibilityLabel
          : undefined
      }
      accessibilityActions={stageAccessibilityActions}
      onAccessibilityAction={
        stageAccessibilityActions
          ? (event) => {
              const action = event.nativeEvent.actionName;
              if (action === "nextPage") {
                if (logicalLongStripMode) {
                  const next = readerContinuousAccessibilityAction(
                    latestScrollMetricsRef.current,
                    "next",
                  );
                  if (next.kind === "scroll") {
                    listRef.current?.scrollToOffset({
                      offset: next.offset,
                      animated: true,
                    });
                  } else {
                    onSegmentedLogicalEndReached?.();
                    onRequestAdvancePastEndRef.current?.();
                  }
                  return;
                }
                onPageStepRef.current?.("next");
                return;
              }
              if (action === "previousPage") {
                if (logicalLongStripMode) {
                  const previous = readerContinuousAccessibilityAction(
                    latestScrollMetricsRef.current,
                    "previous",
                  );
                  if (previous.kind === "scroll") {
                    listRef.current?.scrollToOffset({
                      offset: previous.offset,
                      animated: true,
                    });
                  }
                  return;
                }
                onPageStepRef.current?.("previous");
                return;
              }
              onToggleControlsRef.current();
            }
          : undefined
      }
      pointerEvents={isReaderLoading ? "box-none" : "auto"}
      style={[styles.stageContainer, styles.stage, { backgroundColor }]}
      onTouchStart={readerStageTapEnabled ? handleStageTouchStart : undefined}
      onTouchEnd={readerStageTapEnabled ? handleStageTouchEnd : undefined}
    >
      {isReaderLoading ? (
        <View pointerEvents="none" style={styles.readerLoadingContainer}>
          {readerSkeletonVisible ? (
            <Animated.View
              accessibilityLabel={pagesState.detail}
              accessibilityRole="progressbar"
              style={[
                // Paged reading opens on a 1:1.45 page box at the reader
                // width; long strip opens on a full-width block, so the
                // placeholder already has the shape the first page will take.
                logicalLongStripMode
                  ? styles.readerLoadingStrip
                  : styles.readerLoadingSkeleton,
                logicalLongStripMode
                  ? {
                      width: readerPageWidth,
                      height: Math.max(240, windowHeight - 190),
                    }
                  : {
                      width: Math.min(readerImageWidth, readerPageWidth - 24),
                      maxHeight: Math.max(240, windowHeight - 190),
                    },
                {
                  backgroundColor: "rgba(255,255,255,0.10)",
                  borderColor: "rgba(255,255,255,0.13)",
                  opacity: readerSkeletonOpacity,
                },
              ]}
            >
              {logicalLongStripMode ? null : (
                <View style={styles.readerLoadingSkeletonLine} />
              )}
            </Animated.View>
          ) : null}
        </View>
      ) : pages.length ? (
        <FlatList
          key={scrollMountKey}
          ref={listRef}
          data={galleryItems}
          keyExtractor={(item) =>
            item.kind === "spread"
              ? `spread-${item.spread.join("-")}`
              : item.kind === "segment"
                ? `segment-${item.frame.segment.uri}`
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

            if (item.kind === "segment") {
              return (
                <View
                  style={[
                    styles.segmentFrame,
                    {
                      width: item.frame.width,
                      height: item.frame.height,
                    },
                  ]}
                >
                  {renderImageSegment?.(item.frame)}
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
          bounces={!pagedMode}
          contentInsetAdjustmentBehavior="never"
          {...pagingBehaviorProps}
          directionalLockEnabled
          horizontal={pagedMode}
          initialNumToRender={segmentedMode ? 2 : pagedMode ? 3 : 5}
          maxToRenderPerBatch={segmentedMode ? 2 : 5}
          windowSize={segmentedMode ? 3 : 7}
          viewabilityConfig={READER_VIEWABILITY_CONFIG}
          removeClippedSubviews={pagedMode && Platform.OS === "android"}
          getItemLayout={
            segmentedMode
              ? (_data, index) => {
                  const frame = segmentedImageFrames?.[index];
                  return {
                    index,
                    length: frame?.height ?? 0,
                    offset: frame?.offset ?? 0,
                  };
                }
              : pagedMode
                ? (_data, index) => ({
                    index,
                    length: readerPageWidth,
                    offset: readerPageWidth * index,
                  })
                : undefined
          }
          onMomentumScrollEnd={onMomentumScrollEnd}
          onContentSizeChange={handleGalleryContentSizeChange}
          onLayout={handleGalleryLayout}
          onScroll={handleGalleryScroll}
          onScrollBeginDrag={handleScrollBeginDrag}
          onScrollEndDrag={handleScrollEndDrag}
          onScrollToIndexFailed={handleScrollToIndexFailed}
          onViewableItemsChanged={
            pagedMode ? undefined : onViewableItemsChanged
          }
          overScrollMode="never"
          scrollEventThrottle={16}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            pagedMode
              ? styles.pagedContent
              : segmentedMode
                ? styles.segmentedContent
                : styles.scrollingContent,
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
            <Text
              style={[styles.readerText, { color: tokens.mutedForeground }]}
            >
              {pagesState.detail}
            </Text>
            {pagesState.status === "blocked" ? (
              <Text
                style={[styles.readerText, { color: tokens.mutedForeground }]}
              >
                {strings.reader.sourceBlockedHint}
              </Text>
            ) : null}
            <View style={styles.readerStateActions}>
              {/* A chapter that resolved to zero pages is just as stuck as an
                  errored one, and a blocked source can recover once its
                  settings change — offer the retry in all three cases. */}
              {onRetry && pagesState.status !== "loading" ? (
                <NemuButton
                  accessibilityLabel={strings.common.retry}
                  containerStyle={styles.readerStateAction}
                  label={strings.common.retry}
                  variant="outline"
                  onPress={onRetry}
                />
              ) : null}
              {onOpenSourceSettings &&
              (pagesState.status === "blocked" ||
                pagesState.status === "error") ? (
                <NemuButton
                  accessibilityLabel={strings.reader.openSourceSettings}
                  containerStyle={styles.readerStateAction}
                  label={strings.reader.openSourceSettings}
                  variant="secondary"
                  onPress={onOpenSourceSettings}
                />
              ) : null}
            </View>
            <View
              style={[styles.progressPill, { backgroundColor: tokens.muted }]}
            >
              <Text
                style={[
                  styles.progressPillText,
                  { color: tokens.mutedForeground },
                ]}
              >
                {pagesState.status === "blocked" ||
                pagesState.status === "error"
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
  readerLoadingSkeleton: {
    aspectRatio: 1 / 1.45,
    minWidth: 220,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  readerLoadingStrip: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  readerLoadingSkeletonLine: {
    width: "34%",
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.13)",
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
  segmentedContent: {
    alignItems: "center",
    gap: 0,
    paddingHorizontal: 0,
  },
  segmentFrame: {
    alignItems: "center",
    overflow: "hidden",
    borderRadius: 0,
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
  readerStateActions: {
    alignSelf: "stretch",
    gap: 8,
  },
  readerStateAction: {
    alignSelf: "stretch",
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
