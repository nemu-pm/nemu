import type { WindowLayoutRect } from "@/lib/mobileWindowLayout";
import { mobileReaderTapExcluded } from "@/lib/mobileReaderPoseLayout";
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type ListRenderItem,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ListViewToken,
  type ViewInstance,
} from "react-native";
import Animated, { LayoutAnimationConfig, useSharedValue } from "react-native-reanimated";
import { DuoBookSpineShade } from "@/components/duo/DuoBookSpineShade";
import { mobileDuoSpreadPageRects } from "@/lib/mobileDuoSpine";
import { READER_CAPSULE_COLORS } from "@/components/reader/ReaderCapsule";
import { ReaderCapsuleButton } from "@/components/reader/ReaderCapsuleButton";
import {
  armMobileReaderStageCrossFade,
  mobileReaderPageFrameLayoutTransition,
  mobileReaderSlotLayoutTransition,
  mobileReaderStageCrossFadeEntering,
  mobileReaderStageCrossFadeExiting,
} from "@/lib/mobileReaderMotionAnimations";
import {
  mobileReaderGalleryRelayout,
  mobileReaderGalleryRemountMotion,
  mobileReaderStripRelayoutOffset,
  type MobileReaderGalleryGeometry,
} from "@/lib/mobileReaderStageMotion";
import {
  GlassSurface,
  radius,
  nemuFontWeight,
  useNemuTheme,
} from "@/design-system";
import type { ChapterSummary, ReadingMode } from "@/data/schema";
import { formatChapterTitle } from "@/lib/formatChapter";
import { formatMobileString, type MobileStrings } from "@/lib/mobileI18n";
import {
  mobileReaderSpreadPageAlignment,
  visualPageIndexesForMobileReaderSpread,
} from "@/lib/mobileReaderSpreads";
import type { MobileReaderPage } from "@/sources/mobileSourcePages";
import {
  getReaderContinuousScrollMetrics,
  readerContinuousAccessibilityAction,
  readerContinuousRelayoutProgress,
  readerScrollToIndexRetryLimit,
  readerContinuousScrollOffsetForProgress,
  readerDisplayIndexForViewableItems,
  readerScrollOffsetForLogicalFrame,
  type ReaderContinuousScrollMetrics,
  type ReaderScrollPageMetric,
} from "@/lib/mobileReaderProgress";
import { ZoomableReaderStrip } from "./ZoomableReaderStrip";
import { MOBILE_READER_DOUBLE_TAP_MAX_DELAY_MS } from "@/lib/mobileReaderZoom";
import {
  isReaderAdvancePastEndDrag,
  isReaderRetreatPastStartDrag,
  type ReaderEdgeDragMetrics,
} from "./readerEdgeDrag";
import {
  isReaderStageTapEnabled,
  isReaderTapInsideChrome,
  readerTapDispatchForZone,
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
  /** The chapter is paywalled/locked at the source, not broken. */
  locked?: boolean;
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
  /** Paged mode: the reader tried to move back past the chapter's first page. */
  onRequestRetreatPastStart?: () => void;
  /**
   * Paged mode: reading-order index of the page (or spread, in two-page mode)
   * the reader state says is on screen. Chapter edges are judged from this and
   * a measured pager, never from a raw scroll offset.
   */
  pagedDisplayIndex?: number;
  /** Paged mode: page (or spread) count that `pagedDisplayIndex` indexes. */
  pagedDisplayCount?: number;
  onSegmentedLogicalEndReached?: () => void;
  onLongStripScrollProgressChange?: (
    contentIdentity: string,
    progress: number,
  ) => void;
  /** Escape hatch for a source that refuses to serve pages. */
  onOpenSourceSettings?: () => void;
  /**
   * Locked chapters offer the neighbouring chapters directly, since the
   * locked one has no pages to read. Omitted when there is no such chapter.
   */
  onOpenNextChapter?: () => void;
  onOpenPreviousChapter?: () => void;
  onToggleControls: () => void;
  /**
   * The page under the stage is zoomed in. A zoomed page owns the whole stage,
   * so its edge bands stop turning pages and its double tap resets the zoom.
   */
  pageZoomActive?: boolean;
  /** Prevents modal/sheet taps from reaching the reader's page-turn zones. */
  tapGesturesEnabled?: boolean;
  /** A page on screen is still loading: tap zones don't turn the page yet. */
  visiblePageLoading?: boolean;
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
  /**
   * A pose change moved the pages inside an unchanged (or translating) stage:
   * spread slots and page frames glide from their old boxes this commit.
   */
  pageGlide?: boolean;
  /** The reader window's size (`WxH`): a remount after a resize never cross-fades. */
  windowKey?: string;
  spreadSlots?: WindowLayoutRect[];
  /** Stage-local rectangles owned by reader chrome (the vertical rail): never page taps. */
  tapExclusions?: readonly WindowLayoutRect[];
  /** Stage-local fold interval: never a tap target. */
  foldGap?: { start: number; end: number } | null;
  geometryKey?: string;
  onStageOriginChange?: (origin: { x: number; y: number }) => void;
  /**
   * Chapter / fetch / reading-direction identity. A `scrollMountKey` change
   * under the same content (spread ⇄ single, bilingual) cross-fades the list;
   * a new content remounts plainly.
   */
  contentIdentityKey?: string;
  /** Intrinsic size of a page, for the book-spine shading of a fold spread. */
  pageNaturalSize?: (page: MobileReaderPage) => { width: number; height: number } | null;
  /** Extra horizontal padding that centres the loading / locked / error card beside the rail. */
  stateInsets?: { left: number; right: number } | null;
  stateTopPadding: number;
  strings: MobileStrings;
  /** Manga title; `null` while unknown (the card then shows only the chapter). */
  title: string | null;
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
// Must exceed the double-tap zoom gesture's max delay
// (MOBILE_READER_DOUBLE_TAP_MAX_DELAY_MS) so the chrome toggle can be
// cancelled when a second tap turns the gesture into a zoom. Only the centre band pays this
// wait: the page-turn bands act on touch-up (see readerTapDispatchForZone).
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
  onRequestRetreatPastStart,
  pagedDisplayIndex,
  pagedDisplayCount,
  onSegmentedLogicalEndReached,
  onLongStripScrollProgressChange,
  onOpenSourceSettings,
  onOpenNextChapter,
  onOpenPreviousChapter,
  onToggleControls,
  pageZoomActive = false,
  tapGesturesEnabled = true,
  visiblePageLoading = false,
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
  spreadSlots,
  pageGlide = false,
  windowKey = "",
  tapExclusions,
  foldGap,
  geometryKey,
  onStageOriginChange,
  contentIdentityKey,
  pageNaturalSize,
  stateInsets,
  stateTopPadding,
  strings,
  title,
  windowHeight,
}: MobileReaderGalleryProps) {
  const { reduceMotion } = useNemuTheme();
  // A presentation remount of the same content (spread ⇄ single) cross-fades:
  // decided while rendering the new key so the UI-thread exiting/entering
  // animations of this very commit see it.
  const resolvedContentIdentityKey = contentIdentityKey ?? scrollMountKey;
  const [remountTrack, setRemountTrack] = useState(() => ({
    mountKey: scrollMountKey,
    contentKey: resolvedContentIdentityKey,
    windowKey,
  }));
  if (
    remountTrack.mountKey !== scrollMountKey ||
    remountTrack.contentKey !== resolvedContentIdentityKey ||
    remountTrack.windowKey !== windowKey
  ) {
    const next = { mountKey: scrollMountKey, contentKey: resolvedContentIdentityKey, windowKey };
    const motion = mobileReaderGalleryRemountMotion({
      previous: remountTrack,
      next,
      reduceMotion: reduceMotion === true,
    });
    armMobileReaderStageCrossFade(motion.crossfade ? motion.durationMs : 0);
    setRemountTrack(next);
  }
  const stageViewRef = useRef<ViewInstance | null>(null);
  const stageOriginRef = useRef({ x: 0, y: 0 });
  const hasMeasuredStageOriginRef = useRef(false);
  const measureStageOrigin = useCallback(() => {
    stageViewRef.current?.measureInWindow((x, y) => {
      if (hasMeasuredStageOriginRef.current && stageOriginRef.current.x === x && stageOriginRef.current.y === y) return;
      hasMeasuredStageOriginRef.current = true;
      stageOriginRef.current = { x, y };
      onStageOriginChange?.({ x, y });
    });
  }, [onStageOriginChange]);
  useLayoutEffect(() => {
    // Parent-only movement (e.g. equal-width RTL/LTR fold panels) does not
    // necessarily trigger this child's onLayout. Re-measure after the commit.
    measureStageOrigin();
    const frame = requestAnimationFrame(measureStageOrigin);
    // A stage glide (FLIP transform) is still settling at the first two
    // measurements; take the origin again once the spring has landed.
    const settled = setTimeout(measureStageOrigin, 450);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(settled);
    };
  }, [geometryKey, measureStageOrigin]);
  const isReaderLoading = loading || pagesState.status === "loading";
  // The gallery lives for the whole chapter; the placeholder only for the
  // first moments of it, so the infinite pulse stops with the load.
  const readerSkeletonOpacity = useSkeletonPulse(
    reduceMotion === true,
    isReaderLoading,
  );
  const readerSkeletonVisible = useSkeletonDisplayDelay(150);
  const segmentedMode = Boolean(segmentedImageFrames?.length);
  const logicalLongStripMode = longStripPresentationMode || segmentedMode;
  const resolvedContinuousContentIdentity =
    longStripContentIdentity ?? continuousContentIdentity ?? scrollMountKey;
  const [logicalScrollAccessibility, setLogicalScrollAccessibility] = useState(
    () => ({ scrollMountKey, percent: 0 }),
  );
  // The percent only feeds the VoiceOver stage label. Publishing it from the
  // 16ms scroll handler re-rendered the whole gallery on every rounded change
  // (~100× a chapter), so the live value rides a ref and lands on the state
  // when the scroll settles.
  const pendingLogicalScrollAccessibilityRef = useRef(
    logicalScrollAccessibility,
  );
  const publishLogicalScrollAccessibility = useCallback(() => {
    const pending = pendingLogicalScrollAccessibilityRef.current;
    setLogicalScrollAccessibility((current) =>
      current.scrollMountKey === pending.scrollMountKey &&
      current.percent === pending.percent
        ? current
        : pending,
    );
  }, []);
  useEffect(() => {
    pendingLogicalScrollAccessibilityRef.current = {
      scrollMountKey,
      percent: 0,
    };
    publishLogicalScrollAccessibility();
  }, [publishLogicalScrollAccessibility, scrollMountKey]);
  // Whole-strip pinch zoom (long strip only): the wrapper needs the live
  // content length for pan clamping and suspends the list's own scroll while
  // the strip is zoomed in.
  const stripContentLengthShared = useSharedValue(0);
  const [stripZoomActive, setStripZoomActive] = useState(false);
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
  const lastCentreTapEndAtRef = useRef(0);
  // Lift time of the last tap on a zoomed page (the first tap of a reset).
  const lastZoomedTapEndAtRef = useRef(0);
  const dragStartOffsetRef = useRef<number | null>(null);
  // The displayed page when the drag began: a page turn that settles during
  // the drag must not move the edge the drag is judged against.
  const dragStartDisplayIndexRef = useRef<number | undefined>(undefined);
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
  const onRequestRetreatPastStartRef = useRef(onRequestRetreatPastStart);
  const pagedDisplayRef = useRef({
    index: pagedDisplayIndex,
    count: pagedDisplayCount,
  });
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
      viewableItems: ListViewToken[];
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
    [galleryItemCount, pagedMode, resolvedContinuousContentIdentity],
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
    onRequestRetreatPastStartRef.current = onRequestRetreatPastStart;
    pagedDisplayRef.current = {
      index: pagedDisplayIndex,
      count: pagedDisplayCount,
    };
    onScrollingVisiblePageChangeRef.current = onScrollingVisiblePageChange;
    displayedPageCountRef.current = displayedPages.length;
  }, [
    displayedPages.length,
    onPageStep,
    onRequestAdvancePastEnd,
    onRequestRetreatPastStart,
    onScrollingVisiblePageChange,
    onToggleControls,
    pagedDisplayCount,
    pagedDisplayIndex,
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
    lastCentreTapEndAtRef.current = 0;
    lastZoomedTapEndAtRef.current = 0;
    if (pendingToggleTimerRef.current) {
      clearTimeout(pendingToggleTimerRef.current);
      pendingToggleTimerRef.current = null;
    }
  }, [tapGesturesEnabled]);

  useLayoutEffect(() => {
    if (appliedScrollMountKeyRef.current === scrollMountKey) return;
    touchStartRef.current = null;
    lastCentreTapEndAtRef.current = 0;
    lastZoomedTapEndAtRef.current = 0;
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
    pendingLogicalScrollProgressRef.current = !pagedMode
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
  // Stage size changes (fold, dock, rail) keep the list mounted — cells keep
  // their zoom and decoded images — and only re-place the offset: the same
  // logical page when paged, the same reading progress in a strip.
  const listGeometryRef = useRef<MobileReaderGalleryGeometry | null>(null);
  const pendingPagedRelayoutOffsetRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    const previous = listGeometryRef.current;
    const next: MobileReaderGalleryGeometry = {
      mountKey: scrollMountKey,
      paged: pagedMode,
      extent: pagedMode ? readerPageWidth : readerImageWidth,
      viewport: windowHeight,
    };
    listGeometryRef.current = next;
    if (mobileReaderGalleryRelayout(previous, next) !== "reoffset" || !previous) return;
    if (pagedMode) {
      const frameCount = pagedDisplayCount ?? galleryItemCount;
      if (frameCount <= 0) return;
      const offset = readerScrollOffsetForLogicalFrame(
        pagedDisplayIndex ?? 0,
        frameCount,
        readerPageWidth,
        mode,
      );
      // Re-applied once the new content size lands (a wider page can put the
      // offset past the old content end, where the first scroll clamps).
      pendingPagedRelayoutOffsetRef.current = offset;
      listRef.current?.scrollToOffset({ offset, animated: false });
      return;
    }
    const metrics = latestScrollMetricsRef.current;
    if (!(metrics.contentLength > 0)) return;
    const relayout = mobileReaderStripRelayoutOffset({
      contentOffset: metrics.contentOffset,
      contentLength: metrics.contentLength,
      viewportLength: metrics.viewportLength,
      nextViewportLength: windowHeight,
      widthRatio: previous.extent > 0 ? next.extent / previous.extent : 1,
      fixedLength: segmentedMode ? 0 : chromeTopPadding + bottomPadding,
    });
    // The measured content size then restores the exact progress.
    pendingContentSizeScrollProgressRef.current = {
      contentIdentity: resolvedContinuousContentIdentity,
      progress: relayout.progress,
    };
    listRef.current?.scrollToOffset({ offset: relayout.offset, animated: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- geometry is the trigger; the rest is read at that moment.
  }, [pagedMode, readerImageWidth, readerPageWidth, scrollMountKey, windowHeight]);
  const readerStatePadding = {
    paddingTop: stateTopPadding,
    paddingBottom: bottomPadding,
    // Reader cards centre in the free area beside the rail, never under it.
    paddingLeft: 24 + (stateInsets?.left ?? 0),
    paddingRight: 24 + (stateInsets?.right ?? 0),
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
    const x = touch.pageX - stageOriginRef.current.x;
    const y = touch.pageY - stageOriginRef.current.y;
    if (spreadSlots && !spreadSlots.some((slot) =>
      x >= slot.x && x <= slot.x + slot.width && y >= slot.y && y <= slot.y + slot.height)) {
      touchStartRef.current = null;
      return;
    }
    if (mobileReaderTapExcluded({ x, y }, tapExclusions, foldGap)) {
      touchStartRef.current = null;
      return;
    }
    if (
      isReaderTapInsideChrome({
        y,
        height: windowHeight,
        topInset: chromeTopPadding,
        bottomInset: bottomPadding,
      })
    ) {
      touchStartRef.current = null;
      return;
    }
    const now = Date.now();
    // A second tap is on its way: hold the first tap's chrome toggle until
    // this one lifts (a double tap drops it; see handleStageTouchEnd), so
    // a slow second tap never flashes the chrome before the zoom.
    if (
      pendingToggleTimerRef.current &&
      now - lastCentreTapEndAtRef.current <= MOBILE_READER_DOUBLE_TAP_MAX_DELAY_MS
    ) {
      clearTimeout(pendingToggleTimerRef.current);
      pendingToggleTimerRef.current = null;
    }
    touchStartRef.current = {
      x: touch.pageX,
      y: touch.pageY,
      time: now,
    };
  };
  // The chrome toggle is the only way out of a black screen, so it must keep
  // working while the chapter is in an error/blocked state. Only page turns
  // need a ready gallery.
  const readerStageTapEnabled = isReaderStageTapEnabled({
    tapGesturesEnabled,
    loading: isReaderLoading,
  });
  // Owner rule: a tap never skips a page that hasn't appeared yet (swipes
  // still can).
  const readerPageTurnEnabled =
    !isReaderLoading &&
    !visiblePageLoading &&
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
      // Reanimated shared values are officially mutable from the JS thread;
      // the compiler's immutability lint just can't see through the box.
      // eslint-disable-next-line react-hooks/immutability
      stripContentLengthShared.value = normalizedMetrics.contentLength;
      onContinuousScrollMetricsChange?.(normalizedMetrics);
      if (logicalLongStripMode) {
        const percent =
          getMobileReaderLogicalAccessibilityPercent(normalizedMetrics);
        const pending = pendingLogicalScrollAccessibilityRef.current;
        if (
          pending.scrollMountKey !== scrollMountKey ||
          pending.percent !== percent
        ) {
          pendingLogicalScrollAccessibilityRef.current = {
            scrollMountKey,
            percent,
          };
        }
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
      stripContentLengthShared,
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
      // Both ends are the same live offset, so the finger delta is the only
      // evidence of direction here: without it a tap meant for the chrome
      // toggle would advance a chapter that is already resting at its bottom.
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
    // A one-page paged chapter cannot scroll, so the list never reports a
    // drag: the finger's horizontal travel is the only evidence of a swipe
    // toward the next or previous chapter.
    if (
      pagedMode &&
      pagesState.status === "ready" &&
      pages.length > 0 &&
      pagedDisplayRef.current.count === 1
    ) {
      const horizontalDelta = touch.pageX - start.x;
      if (
        Math.abs(horizontalDelta) > Math.abs(touch.pageY - start.y) &&
        Math.abs(horizontalDelta) > READER_TAP_MAX_DISTANCE
      ) {
        const metrics: ReaderEdgeDragMetrics = {
          startOffset: 0,
          endOffset: 0,
          maxOffset: 0,
          gestureDelta: horizontalDelta,
          mode,
          pagedMode,
          displayIndex: pagedDisplayRef.current.index,
          displayCount: 1,
          viewportLength: readerPageWidth,
        };
        if (
          onRequestAdvancePastEndRef.current &&
          isReaderAdvancePastEndDrag(metrics)
        ) {
          onRequestAdvancePastEndRef.current();
          return;
        }
        if (
          onRequestRetreatPastStartRef.current &&
          isReaderRetreatPastStartDrag(metrics)
        ) {
          onRequestRetreatPastStartRef.current();
          return;
        }
      }
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
          x: touch.pageX - stageOriginRef.current.x,
          width: readerPageWidth,
          mode,
          pagedMode,
        })
      : "toggle";
    const now = Date.now();
    const dispatch = readerTapDispatchForZone({
      zone,
      // Same rule as the page's double-tap zoom (touch-down within the
      // max delay of the previous lift), so the two never disagree.
      isSecondCentreTap:
        start.time - lastCentreTapEndAtRef.current <=
        MOBILE_READER_DOUBLE_TAP_MAX_DELAY_MS,
      pageZoomed: pageZoomActive,
      followsZoomedTap:
        start.time - lastZoomedTapEndAtRef.current <=
        MOBILE_READER_DOUBLE_TAP_MAX_DELAY_MS,
    });
    lastZoomedTapEndAtRef.current = pageZoomActive ? now : 0;
    if (pendingToggleTimerRef.current) {
      clearTimeout(pendingToggleTimerRef.current);
      pendingToggleTimerRef.current = null;
    }
    // A page turn owns its band outright — the edge zones offer no double-tap
    // affordance — so it lands on touch-up instead of sitting out the
    // double-tap window that used to delay every single tap by 280 ms.
    if (dispatch.kind === "turn") {
      onPageStepRef.current?.(dispatch.zone);
      return;
    }
    // The centre band still shares its space with the page's double-tap zoom:
    // defer the chrome toggle so a zoom never flashes the chrome first, and
    // let the second centre tap cancel the pending toggle outright.
    lastCentreTapEndAtRef.current = now;
    if (dispatch.kind === "cancelPendingToggle") return;
    pendingToggleTimerRef.current = setTimeout(() => {
      pendingToggleTimerRef.current = null;
      onToggleControlsRef.current();
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
    dragStartDisplayIndexRef.current = pagedDisplayRef.current.index;
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
      if (logicalLongStripMode && isMobileReaderLogicalEndReached(metrics)) {
        onSegmentedLogicalEndReached?.();
      }
    }
    onScroll(event);
  };
  const handleGalleryContentSizeChange = (_width: number, height: number) => {
    if (pagedMode) {
      const pendingOffset = pendingPagedRelayoutOffsetRef.current;
      if (pendingOffset != null) {
        pendingPagedRelayoutOffsetRef.current = null;
        listRef.current?.scrollToOffset({ offset: pendingOffset, animated: false });
      }
      return;
    }
    const measuredMetrics = getReaderContinuousScrollMetrics({
      contentOffset: latestScrollMetricsRef.current.contentOffset,
      contentLength: height,
      viewportLength:
        latestScrollMetricsRef.current.viewportLength > 0
          ? latestScrollMetricsRef.current.viewportLength
          : windowHeight,
    });
    recordContinuousScrollMetrics(measuredMetrics, false);
    publishLogicalScrollAccessibility();
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
    publishLogicalScrollAccessibility();
  };
  const handleGalleryMomentumScrollEnd = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    publishLogicalScrollAccessibility();
    onMomentumScrollEnd(event);
  };
  const handleScrollEndDrag = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    publishLogicalScrollAccessibility();
    const startOffset = dragStartOffsetRef.current;
    const startDisplayIndex = dragStartDisplayIndexRef.current;
    dragStartOffsetRef.current = null;
    dragStartDisplayIndexRef.current = undefined;
    if (startOffset == null) return;
    if (
      !onRequestAdvancePastEndRef.current &&
      !onRequestRetreatPastStartRef.current
    ) {
      return;
    }
    if (pagesState.status !== "ready" || pages.length === 0) return;

    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const endOffset = pagedMode ? contentOffset.x : contentOffset.y;
    const viewportLength = pagedMode
      ? layoutMeasurement.width
      : layoutMeasurement.height;
    const metrics: ReaderEdgeDragMetrics = {
      startOffset,
      endOffset,
      maxOffset:
        (pagedMode ? contentSize.width : contentSize.height) - viewportLength,
      mode,
      pagedMode,
      displayIndex: startDisplayIndex,
      displayCount: pagedDisplayRef.current.count,
      viewportLength,
    };
    if (
      onRequestAdvancePastEndRef.current &&
      isReaderAdvancePastEndDrag(metrics)
    ) {
      if (logicalLongStripMode) onSegmentedLogicalEndReached?.();
      onRequestAdvancePastEndRef.current();
      return;
    }
    if (
      onRequestRetreatPastStartRef.current &&
      isReaderRetreatPastStartDrag(metrics)
    ) {
      onRequestRetreatPastStartRef.current();
    }
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

  // FlatList re-renders every cell when `renderItem`/`keyExtractor` change
  // identity, so both stay memoized across the gallery's own re-renders.
  const galleryKeyExtractor = useCallback(
    (item: MobileReaderGalleryItem) =>
      item.kind === "spread"
        ? `spread-${item.spread.join("-")}`
        : item.kind === "segment"
          ? `segment-${item.frame.segment.uri}`
          : item.page.id,
    [],
  );
  const renderGalleryItem = useCallback<
    ListRenderItem<MobileReaderGalleryItem>
  >(
    ({ item }) => {
      if (item.kind === "spread") {
        // Book posture: faint binding shade at both inner edges (stage-local,
        // like the slots). Hidden while zoomed; none for a lone cover page.
        const visualIndexes = visualPageIndexesForMobileReaderSpread(item.spread, mode);
        const spinePages =
          spreadSlots && spreadSlots.length === 2 && foldGap && pageNaturalSize && item.spread.length === 2
            ? mobileDuoSpreadPageRects({
                panes: [spreadSlots[0], spreadSlots[1]],
                naturalSizes: [
                  displayedPages[visualIndexes[0]] ? pageNaturalSize(displayedPages[visualIndexes[0]]) : null,
                  displayedPages[visualIndexes[1]] ? pageNaturalSize(displayedPages[visualIndexes[1]]) : null,
                ],
                align: "center",
              })
            : null;
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
            {visualIndexes.map(
              (pageIndex, slotIndex) => {
                const page = displayedPages[pageIndex];
                if (!page) return null;
                return (
                  <Animated.View
                    key={page.id}
                    // The halves slide apart into (or back from) the fold panes.
                    layout={pageGlide ? mobileReaderSlotLayoutTransition : undefined}
                    style={[styles.spreadPageSlot, {
                    alignItems: mobileReaderSpreadPageAlignment(
                      slotIndex, item.spread.length, Boolean(spreadSlots),
                    ),
                  },
                  // While a page glides from its old (larger) box the slot
                  // must not clip it; the zoom clip returns once it settles.
                  pageGlide ? styles.spreadPageSlotGliding : null,
                  spreadSlots ? {
                    position: "absolute", flex: 0,
                    left: spreadSlots[item.spread.length === 1 && mode === "rtl" ? 1 : slotIndex]?.x,
                    top: spreadSlots[item.spread.length === 1 && mode === "rtl" ? 1 : slotIndex]?.y,
                    width: spreadSlots[item.spread.length === 1 && mode === "rtl" ? 1 : slotIndex]?.width,
                    height: spreadSlots[item.spread.length === 1 && mode === "rtl" ? 1 : slotIndex]?.height,
                  } : undefined]}>
                    {page.imageUri ? (
                      <Animated.View layout={pageGlide ? mobileReaderPageFrameLayoutTransition : undefined}>
                        {renderImage(page)}
                      </Animated.View>
                    ) : (
                      <TextPage
                        width={readerImageWidth}
                        text={page.text}
                        fallbackPage={sourcePageForDisplayIndex(pageIndex)}
                        strings={strings}
                      />
                    )}
                  </Animated.View>
                );
              },
            )}
            {spinePages && foldGap ? (
              <DuoBookSpineShade
                leftPage={spinePages[0]}
                rightPage={spinePages[1]}
                spine={foldGap}
                visible={!pageZoomActive}
              />
            ) : null}
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
            pagedMode ? (
              // The fitted page box glides to its new size and place when the
              // pose moves it (dock, rail, fold) at a constant window size.
              <Animated.View layout={pageGlide ? mobileReaderPageFrameLayoutTransition : undefined}>
                {renderImage(page)}
              </Animated.View>
            ) : (
              renderImage(page)
            )
          ) : (
            <TextPage
              text={page.text}
              fallbackPage={sourcePageForDisplayIndex(index)}
              strings={strings}
            />
          )}
        </View>
      );
    },
    [
      displayedPages,
      spreadSlots,
      pageGlide,
      foldGap,
      pageNaturalSize,
      pageZoomActive,
      mode,
      onScrollingPageLayout,
      pagedMode,
      readerImageWidth,
      readerPageWidth,
      renderImage,
      renderImageSegment,
      sourcePageForDisplayIndex,
      strings,
      windowHeight,
    ],
  );
  const galleryGetItemLayout = useMemo(() => {
    if (segmentedMode) {
      return (
        _data: ArrayLike<MobileReaderGalleryItem> | null | undefined,
        index: number,
      ) => {
        const frame = segmentedImageFrames?.[index];
        return {
          index,
          length: frame?.height ?? 0,
          offset: frame?.offset ?? 0,
        };
      };
    }
    if (pagedMode) {
      return (
        _data: ArrayLike<MobileReaderGalleryItem> | null | undefined,
        index: number,
      ) => ({
        index,
        length: readerPageWidth,
        offset: readerPageWidth * index,
      });
    }
    return undefined;
  }, [pagedMode, readerPageWidth, segmentedImageFrames, segmentedMode]);
  const galleryContentContainerStyle = useMemo(
    () => [
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
    ],
    [bottomPadding, chromeTopPadding, pagedMode, segmentedMode],
  );

  const galleryInitialScrollIndex =
    pagedMode && !segmentedMode && galleryItemCount > 0 && readerPageWidth > 0
      ? Math.max(0, Math.min(galleryItemCount - 1, Math.round(initialContentOffset.x / readerPageWidth)))
      : undefined;
  const galleryList = (
    // A key change inside keeps the old list drawn while it fades (exiting);
    // leaving the reader skips it.
    <LayoutAnimationConfig skipExiting>
    <Animated.View
      // One list per presentation; stage size changes never remount it.
      key={scrollMountKey}
      entering={mobileReaderStageCrossFadeEntering}
      exiting={mobileReaderStageCrossFadeExiting}
      style={styles.readerScroll}
    >
    <FlatList
      ref={listRef}
      data={galleryItems}
      keyExtractor={galleryKeyExtractor}
      renderItem={renderGalleryItem}
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
      // Not on the paged list: Android's clipped-subview pass drops cells
      // when a remounted list (spread ⇄ single after a fold) gets its offset
      // before its first layout, and never restores them — a black reader
      // that stays black while paging. `windowSize` already bounds the cells.
      removeClippedSubviews={false}
      getItemLayout={galleryGetItemLayout}
      // A remount (spread ⇄ single, rotation) renders its first window
      // around the page being read, not around page 0: otherwise the new
      // list shows empty black cells until the offset scroll lands.
      initialScrollIndex={galleryInitialScrollIndex}
      onMomentumScrollEnd={handleGalleryMomentumScrollEnd}
      onContentSizeChange={handleGalleryContentSizeChange}
      onLayout={handleGalleryLayout}
      onScroll={handleGalleryScroll}
      onScrollBeginDrag={handleScrollBeginDrag}
      onScrollEndDrag={handleScrollEndDrag}
      onScrollToIndexFailed={handleScrollToIndexFailed}
      onViewableItemsChanged={pagedMode ? undefined : onViewableItemsChanged}
      overScrollMode="never"
      scrollEnabled={logicalLongStripMode ? !stripZoomActive : undefined}
      scrollEventThrottle={16}
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={galleryContentContainerStyle}
      style={styles.readerScroll}
    />
    </Animated.View>
    </LayoutAnimationConfig>
  );

  return (
    <View
      ref={stageViewRef}
      onLayout={measureStageOrigin}
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
        <View
          pointerEvents="none"
          style={[
            styles.readerLoadingContainer,
            stateInsets ? { paddingLeft: stateInsets.left, paddingRight: stateInsets.right } : null,
          ]}
        >
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
            />
          ) : null}
        </View>
      ) : pages.length ? (
        logicalLongStripMode ? (
          <ZoomableReaderStrip
            contentLengthShared={stripContentLengthShared}
            onZoomActiveChange={setStripZoomActive}
            resetKey={resolvedContinuousContentIdentity}
            viewportHeight={windowHeight}
            viewportWidth={readerPageWidth}
          >
            {galleryList}
          </ZoomableReaderStrip>
        ) : (
          galleryList
        )
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
          {/* The chrome's language over the black stage: a centred message
              (no light card slab) and dark glass capsule actions. */}
          <View style={styles.readerStateStack}>
            <Ionicons
              accessibilityElementsHidden
              importantForAccessibility="no"
              name={
                pagesState.locked
                  ? "lock-closed-outline"
                  : pagesState.status === "blocked"
                    ? "shield-outline"
                    : pagesState.status === "error"
                      ? "alert-circle-outline"
                      : "document-outline"
              }
              size={30}
              color={READER_CAPSULE_COLORS.secondaryText}
            />
            <Text
              accessibilityRole="header"
              numberOfLines={2}
              style={[styles.readerTitle, { color: READER_CAPSULE_COLORS.primaryText }]}
            >
              {pagesState.title ?? formatChapterTitle(chapter, strings)}
            </Text>
            {title ? (
              <Text
                numberOfLines={2}
                style={[styles.readerSubtitle, { color: READER_CAPSULE_COLORS.secondaryText }]}
              >
                {title}
              </Text>
            ) : null}
            <Text style={[styles.readerText, { color: READER_CAPSULE_COLORS.secondaryText }]}>
              {pagesState.detail}
            </Text>
            {pagesState.status === "blocked" ? (
              <Text style={[styles.readerText, { color: READER_CAPSULE_COLORS.secondaryText }]}>
                {strings.reader.sourceBlockedHint}
              </Text>
            ) : null}
            <View style={styles.readerStateActions}>
              {pagesState.locked && onOpenNextChapter ? (
                <ReaderCapsuleButton
                  prominent
                  icon="play-skip-forward"
                  label={strings.reader.nextChapter}
                  onPress={onOpenNextChapter}
                />
              ) : null}
              {pagesState.locked && onOpenPreviousChapter ? (
                <ReaderCapsuleButton
                  icon="play-skip-back"
                  label={strings.reader.previousChapter}
                  onPress={onOpenPreviousChapter}
                />
              ) : null}
              {/* A chapter that resolved to zero pages is just as stuck as an
                  errored one, and a blocked source can recover once its
                  settings change — offer the retry in all three cases. */}
              {onRetry && pagesState.status !== "loading" ? (
                <ReaderCapsuleButton
                  prominent={!pagesState.locked}
                  icon="refresh"
                  label={strings.common.retry}
                  onPress={onRetry}
                />
              ) : null}
              {onOpenSourceSettings &&
              (pagesState.status === "blocked" ||
                pagesState.status === "error") ? (
                <ReaderCapsuleButton
                  icon="settings-outline"
                  label={strings.reader.openSourceSettings}
                  onPress={onOpenSourceSettings}
                />
              ) : null}
            </View>
            {!pagesState.locked ? (
              <Text style={[styles.progressPillText, { color: READER_CAPSULE_COLORS.secondaryText }]}>
                {pagesState.status === "blocked" ||
                pagesState.status === "error"
                  ? strings.reader.pageLoadingUnavailable
                  : completed
                    ? strings.reader.markedComplete
                    : strings.reader.progressNotCompleted}
              </Text>
            ) : null}
          </View>
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
  },
  readerLoadingStrip: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
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
    // A fully open display has no synthetic hinge. Fitted facing pages meet
    // at the spine; only observed reserved regions may separate their slots.
    gap: 0,
    paddingHorizontal: 0,
  },
  spreadPageSlotGliding: {
    overflow: "visible",
  },
  spreadPageSlot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    // A zoomed spread half stays inside its own slot instead of painting over
    // the facing page (later siblings paint on top, so only one side ever
    // showed the overlap).
    overflow: "hidden",
  },
  scrollingFrame: {
    alignItems: "center",
    // Long-strip pages must not paint a zoom transform over the previous
    // page: RN paints later siblings on top, so the overflow only ever showed
    // upward. Clip the zoom to the page's own frame; paged mode stays
    // unclipped so a zoom can still use the dark stage margins.
    overflow: "hidden",
  },
  readerStateStack: {
    width: "100%",
    maxWidth: 380,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 24,
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
    fontSize: 20,
    lineHeight: 26,
    fontWeight: nemuFontWeight.semibold,
    textAlign: "center",
  },
  readerSubtitle: {
    fontSize: 14,
    lineHeight: 19,
    textAlign: "center",
  },
  readerText: {
    maxWidth: 290,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
  },
  readerStateActions: {
    alignItems: "center",
    gap: 10,
    marginTop: 8,
  },
  progressPillText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: nemuFontWeight.medium,
  },
});
