import type { WindowLayoutRect } from "@/lib/mobileWindowLayout";
import { mobileReaderTapExcluded } from "@/lib/mobileReaderPoseLayout";
import {
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  FlatList,
  Platform,
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
import Animated, { LayoutAnimationConfig, useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { hapticSelection } from "@/lib/haptics";
import { GestureDetector, type GestureType } from "react-native-gesture-handler";
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
  mobileReaderSplitWideHalfRects,
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
import {
  MobileReaderCurlPager,
  MobileReaderFlatSpreadSlot,
  type MobileReaderCurlPagerHandle,
} from "./MobileReaderCurlPager";
import { MobileReaderSplitWideHalf } from "./MobileReaderSplitWideHalf";
import { mobileReaderFlatSpreadState } from "@/lib/mobileReaderLoneSpreadPage";
import { pageCurlAvailable, pageSlideAvailable } from "../../../modules/nemu-window-layout";
import type { MobileReaderPageTurnTransition } from "@/lib/mobileReaderPageCurl";
import { MOBILE_READER_DOUBLE_TAP_MAX_DELAY_MS } from "@/lib/mobileReaderZoom";
import {
  isReaderAdvancePastEndDrag,
  isReaderRetreatPastStartDrag,
  type ReaderEdgeDragMetrics,
} from "./readerEdgeDrag";
import {
  isReaderStageTapEnabled,
  readerStageTouchOwner,
  readerStageTouchMatchesContent,
  readerTapDispatchForZone,
  readerTapZoneForPosition,
  readerScrollTapZoneForPosition,
  readerBookTapZoneForPosition,
  isReaderBookTapDead,
  type ReaderBookTapLayout,
} from "./readerTapZones";
import {
  readerStageMultiTouchOnEnd,
  readerStageMultiTouchOnStart,
} from "./readerStageMultiTouch";
import {
  getMobileReaderLogicalOffsetForProgress,
  getMobileReaderLogicalAccessibilityPercent,
  getMobileReaderLogicalScrollProgress,
  isMobileReaderLogicalEndReached,
  type MobileReaderSegmentFrame,
} from "@/lib/mobileReaderSegmentedImage";
import { useSkeletonDisplayDelay } from "@/lib/useSkeletonPulse";
import {
  createMobileReaderRenderRangeStore,
  MOBILE_READER_SCROLL_KEEP_AHEAD_VIEWPORTS,
  MOBILE_READER_SCROLL_KEEP_BEHIND_VIEWPORTS,
  MOBILE_READER_SCROLL_KEEP_MAX_BEHIND,
  MOBILE_READER_SCROLL_MOUNT_BEHIND_VIEWPORTS,
  MOBILE_READER_SCROLL_MOUNT_MIN_PAGES,
  nextMobileReaderMountedRange,
  nextMobileReaderScrollDirection,
  resolveMobileReaderScrollPageRange,
  type MobileReaderPageRange,
  type MobileReaderRenderRangeStore,
  type MobileReaderScrollDirection,
} from "@/lib/mobileReaderPageWindow";
import {
  MOBILE_READER_SCROLL_PAGE_SPACING,
  MOBILE_READER_SCROLL_SIDE_MARGIN,
} from "@/lib/mobileReaderScrollPresentation";
import {
  isMobileReaderScrollSeekLanded,
  isMobileReaderScrollSeekSettled,
  mobileReaderScrollAnchorForOffset,
  mobileReaderScrollCentreAnchor,
  mobileReaderScrollCentrePageIndex,
  mobileReaderScrollOffsetForCentreAnchor,
  mobileReaderScrollIndexViewOffset,
  mobileReaderScrollItemLayout,
  mobileReaderScrollOffsetForAnchor,
  MOBILE_READER_SCROLL_DEFAULT_PAGE_RATIO,
  type MobileReaderScrollLayout,
  type MobileReaderScrollPageAnchor,
} from "@/lib/mobileReaderScrollLayout";
import {
  MOBILE_READER_SCROLL_HEAD_SHIFT_WINDOW_MS,
  MOBILE_READER_STRIP_ROWS_SETTLE_MAX_MS,
  MOBILE_READER_STRIP_UNREPORTED_MAX_MS,
  MOBILE_READER_STRIP_UNREPORTED_RETRY_MS,
  isMobileReaderStripRowsSettleUnreported,
  mergeMobileReaderStripRowsSettle,
  mobileReaderStripHeadRowShift,
  mobileReaderStripHeadShiftOffset,
  resolveMobileReaderScrollEventOffset,
  resolveMobileReaderRelayoutSeekAnchor,
  resolveMobileReaderStripRowsSettle,
  resolveMobileReaderStripUnreportedReport,
  shiftMobileReaderRowIndex,
  shiftMobileReaderScrollAnchorRows,
  type MobileReaderScrollHeadShift,
  type MobileReaderStripRowsSettle,
} from "@/lib/mobileReaderStripBridge";
import {
  MOBILE_READER_STRIP_PULL_IDLE,
  mobileReaderStripPullHeaderOpacity,
  mobileReaderStripPullReleases,
  nextMobileReaderStripPull,
  type MobileReaderStripPullState,
} from "@/lib/mobileReaderStripPull";
import { createMobileReaderScrollViewportStore, type MobileReaderScrollCellRef } from "@/lib/mobileReaderPageLoading";
import {
  MobileReaderPageSpinner,
  MobileReaderScrollCellContext,
  MobileReaderScrollViewportContext,
} from "./MobileReaderPageSpinner";
import { mobileReaderPageStatusColor } from "@/lib/mobileReaderPageLoading";
import { mobileReaderPageBackgroundIsLight } from "@/lib/mobileReaderPageBackground";

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
  /** Retries the failed pages on screen; present only while there are some. */
  onAccessibilityRetry?: () => void;
  /** That action's name: "Retry these pages" with more than one failed. */
  accessibilityRetryLabel?: string;
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
  /**
   * Scroll mode with a page layout: a non-animated page seek came to rest
   * at its target offset.
   */
  onScrollingSeekLanded?: (pageIndex: number) => void;
  /**
   * Scroll mode (iOS): a released drag flings the list toward `top` (content
   * coordinate of the screen's top edge where the fling comes to rest).
   */
  onScrollingFlingTarget?: (viewport: MobileReaderScrollViewport) => void;
  onContinuousScrollMetricsChange?: (
    metrics: ReaderContinuousScrollMetrics,
  ) => void;
  /** User touch always supersedes queued restore/seek work. */
  onUserScrollBegin?: () => void;
  /**
   * Scroll mode: a user drag came to rest without a fling (a fling settles
   * through `onMomentumScrollEnd`).
   */
  onUserScrollSettle?: () => void;
  /**
   * Paged mode: the finger lifted off a swipe. `decelerating`: the pager
   * still glides to its frame (`onMomentumScrollEnd` follows); otherwise it
   * is already at rest.
   */
  onPagedDragEnd?: (decelerating: boolean) => void;
  onRetry?: () => void;
  /** Steps one page in source order. Only wired in paged reading modes. */
  onPageStep?: (direction: "previous" | "next") => void;
  /**
   * Scroll reading with screen tap zones (§4b, the Duo outer display): the
   * top quarter of the stage scrolls back one screen, the bottom quarter
   * forward one screen, the middle half toggles the chrome.
   */
  scrollScreenTapZones?: boolean;
  /** Moves the strip one screen (with `scrollScreenTapZones`). */
  onScrollScreenStep?: (direction: "previous" | "next") => void;
  /** The reader tried to move past the final page of the chapter. */
  onRequestAdvancePastEnd?: () => void;
  /**
   * Paged mode: the reader tried to move back past the chapter's first page.
   * Scroll mode with `scrollPullHeader`: a pull past the top of the list
   * beyond MOBILE_READER_STRIP_PULL_THRESHOLD, released there.
   */
  onRequestRetreatPastStart?: () => void;
  /**
   * Seamless scroll, pull prepend mode: shown above the list's first row
   * while it is pulled down (fading in up to the pull threshold). Kept
   * mounted for the whole pull mode (the list's header cell never comes
   * and goes under maintainVisibleContentPosition).
   */
  scrollPullHeader?: ReactNode;
  /** With `scrollPullHeader`: a pull may fetch the chapter above now. */
  scrollPullEnabled?: boolean;
  /**
   * Scroll mode: rows inserted / removed above or resized above the reading
   * line were checked (see MobileReaderScrollHandle.rowsSettling).
   */
  onRowsSettled?: (corrected: boolean) => void;
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
   * The chrome is fading out: its pieces (`tapExclusions`) are still on
   * screen but no longer take touches. A tap on one brings the chrome back
   * through `onRevealChrome` instead of reaching the tap zones under it.
   */
  chromeDismissing?: boolean;
  onRevealChrome?: () => void;
  /**
   * The page under the stage is zoomed in. A zoomed page owns the whole stage,
   * so its edge bands stop turning pages and its double tap resets the zoom.
   */
  pageZoomActive?: boolean;
  /**
   * Pages are fitted to the window (fit width / height / fill) and may be
   * larger than it: each page cell is exactly the stage's height and clips
   * its page, so an oversized page never paints over its neighbours.
   */
  fitClip?: boolean;
  /** Prevents modal/sheet taps from reaching the reader's page-turn zones. */
  tapGesturesEnabled?: boolean;
  /**
   * A gesture the whole stage recognises across pages and spreads (the
   * two-finger double tap for 错开一页). Fixed for the gallery's lifetime.
   */
  stageGesture?: GestureType;
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
  renderImage: (
    page: MobileReaderPage,
    placement?: MobileReaderImagePlacement,
  ) => ReactNode;
  /**
   * Scroll mode: a row that is not one of this chapter's pages (seamless
   * scroll — a chapter divider, or a page of the chapter before or after).
   * Returns `undefined` for an ordinary page. The row's height still comes
   * from `scrollPageLayout`; its render identity from `scrollPageRenderKeys`.
   */
  renderScrollRow?: (
    page: MobileReaderPage,
    placement: MobileReaderImagePlacement,
  ) => ReactNode | undefined;
  /**
   * Scroll mode: per-page render identity (page id → key). A memoized page
   * cell re-renders only when its own key, the epoch, or its place in the
   * render window changes — not when another page loads.
   */
  scrollPageRenderKeys?: ReadonlyMap<string, string> | null;
  /** Scroll mode: changes whenever every page's rendering may change. */
  scrollPageRenderEpoch?: unknown;
  /**
   * Scroll mode: space above each page (by display index). Webtoon strips
   * meet edge to edge; ordinary pages keep a small gap.
   */
  scrollPageGaps?: readonly number[] | null;
  /**
   * Scroll mode: every page's height and gap, known up front (placeholder or
   * loaded alike). Cells are sized from it and the list gets an exact
   * `getItemLayout`, so a seek lands on its page before anything decodes.
   */
  scrollPageLayout?: MobileReaderScrollLayout | null;
  /** Scroll mode: the list's side margin (0 at a 100% page width). */
  scrollSideMargin?: number;
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
  /**
   * Stage-local rectangles owned by reader chrome (capsule pieces, the
   * vertical rail) for as long as they are on screen, fade-out included:
   * never page taps.
   */
  tapExclusions?: readonly WindowLayoutRect[];
  /** Stage-local fold interval: never a tap target. */
  foldGap?: { start: number; end: number } | null;
  /**
   * Book posture (vertical hinge) spread: each half's outer strip turns the
   * page, the rest toggles the chrome, the hinge band does nothing
   * (`readerBookTapLayout`). Absent: the stage-wide bands.
   */
  bookTapLayout?: ReaderBookTapLayout | null;
  geometryKey?: string;
  onStageOriginChange?: (origin: { x: number; y: number }) => void;
  /**
   * Chapter / fetch / reading-direction identity. A `scrollMountKey` change
   * under the same content (spread ⇄ single, bilingual) cross-fades the list;
   * a new content remounts plainly.
   */
  contentIdentityKey?: string;
  /**
   * The native pager that turns paged reading (`mobileReaderPageTurnTransition`):
   * the curl (翻页 › 卷页) or Books' slide. The reader decides it (setting,
   * Reduce Motion); null, and always for long strips and tiled pages, keeps
   * the scrolling list.
   */
  pageTurnTransition?: MobileReaderPageTurnTransition | null;
  /**
   * "Match Page": each page's own background, so it turns with its page
   * (paged sheets and leaves, each half of a spread its own). Absent: every
   * page sits on `backgroundColor`.
   */
  pageBackgroundFor?: ((page: MobileReaderPage) => string) | null;
  /** The curl is turning a leaf: page overlays wait for the settled page. */
  onPageTurningChange?: (turning: boolean) => void;
  /** Overlays are mounted on the pages (Japanese-learning bubbles): a curl waits for them to leave. */
  pageOverlaysMounted?: boolean;
  /** A page wide enough to lie across the spine of a spread (split across the panes of a fold). */
  isWidePage?: (pageIndex: number) => boolean;
  /** The box a single page is fitted to (the curl's leaf is that box). */
  pageFrameSize?: (page: MobileReaderPage) => { width: number; height: number };
  /** Intrinsic size of a page, for the book-spine shading of a fold spread. */
  pageNaturalSize?: (page: MobileReaderPage) => { width: number; height: number } | null;
  /**
   * The page's image has loaded (or failed). In a flat spread, a pair whose
   * second page is not ready yet keeps that page hidden in its slot (the
   * first already against the spine); it fades in once ready. Absent: every
   * page counts as ready.
   */
  pageImageReady?: (page: MobileReaderPage) => boolean;
  /** Extra horizontal padding that centres the loading / locked / error card beside the rail. */
  stateInsets?: { left: number; right: number } | null;
  stateTopPadding: number;
  strings: MobileStrings;
  /** Manga title; `null` while unknown (the card then shows only the chapter). */
  title: string | null;
  windowHeight: number;
};

export type MobileReaderImagePlacement = {
  /** Scroll mode: inside the directional render window (decode the image). */
  inRenderWindow: boolean;
};

/**
 * Scroll mode: the screen in the strip's content coordinates (the page
 * layout's: list top padding excluded).
 */
export type MobileReaderScrollViewport = { top: number; height: number };

export type MobileReaderScrollHandle = {
  scrollTo(options: {
    x?: number;
    y?: number;
    index?: number;
    /** Scroll mode: how far into page `index` the reading line sits (0–1). */
    fraction?: number;
    animated?: boolean;
  }): void;
  /** Scroll mode with a page layout: the page (and fraction) at the reading line. */
  pageAnchor(): MobileReaderScrollPageAnchor | null;
  /**
   * Scroll mode: rows above were inserted, removed or resized and the list
   * has not reported its new offset yet (no crossing, no head prune).
   */
  rowsSettling(): boolean;
  /** Scroll mode: where the screen is now; null before the list has a size. */
  scrollViewport(): MobileReaderScrollViewport | null;
  /**
   * Scroll mode with a page layout: the page under the screen's centre now
   * (what the toolbar counter shows while scrolling); null when unknown.
   */
  centrePageIndex(): number | null;
  /**
   * Scroll mode: the list's content offset as last reported by the list
   * (not moved by a head shift until the list reports it); null when paged.
   */
  contentOffset?(): number | null;
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
/**
 * A drag that ends without a fling has settled; iOS and Android both start
 * momentum (cancelling this) well within it.
 */
const READER_SCROLL_DRAG_SETTLE_MS = 120;
/**
 * A page seek is held this long: a content-size or layout change in that
 * window (pages above decoding, the list's first layout) re-places it.
 */
const READER_SCROLL_SEEK_HOLD_MS = 2_500;
const READER_SCROLL_MAINTAIN_VISIBLE_POSITION = Object.freeze({
  minIndexForVisible: 0,
});

// A held seek outlives its hold while the pages that decide the reading line
// still have stand-in heights (their images not decoded yet), up to this.
const READER_SCROLL_SEEK_SETTLE_MAX_MS = 12_000;

type MobileReaderPageSeek = MobileReaderScrollPageAnchor & {
  until: number;
  /** Let go at `until` only once settled; at the latest here. */
  settleBy: number;
  landed: boolean;
};

function holdMobileReaderPageSeek(
  anchor: MobileReaderScrollPageAnchor,
  landed: boolean,
): MobileReaderPageSeek {
  const now = Date.now();
  return {
    pageIndex: anchor.pageIndex,
    fraction: anchor.fraction,
    until: now + READER_SCROLL_SEEK_HOLD_MS,
    settleBy: now + READER_SCROLL_SEEK_SETTLE_MAX_MS,
    landed,
  };
}

const READER_STATE_COLORS_ON_LIGHT = {
  primaryText: "#000000",
  secondaryText: "rgba(60,60,67,0.6)",
};

// One stable cell reference per segment tile (the spinner's context value).
const segmentCellRefs = new Map<number, MobileReaderScrollCellRef>();
function segmentCellRef(index: number): MobileReaderScrollCellRef {
  let ref = segmentCellRefs.get(index);
  if (!ref) {
    ref = { kind: "segment", index };
    segmentCellRefs.set(index, ref);
  }
  return ref;
}

type MobileReaderScrollPageCellProps = {
  page: MobileReaderPage;
  index: number;
  /** The list's mounted range; the cell follows its own membership. */
  renderRangeStore: MobileReaderRenderRangeStore;
  gapBefore: number;
  /** Exact picture height from the scroll layout (none: the content sizes it). */
  height: number | undefined;
  renderKey: string | undefined;
  renderEpoch: unknown;
  renderImage: MobileReaderGalleryProps["renderImage"];
  renderScrollRow?: MobileReaderGalleryProps["renderScrollRow"];
  onScrollingPageLayout?: MobileReaderGalleryProps["onScrollingPageLayout"];
  fallbackPage: number;
  strings: MobileStrings;
};

/**
 * One page of the scroll (continuous vertical) list. `renderImage` is left
 * out of the comparison on purpose: its identity changes whenever any page
 * loads, while everything this page's own rendering depends on is folded
 * into `renderKey` / `renderEpoch` by the reader.
 */
const MobileReaderScrollPageCell = memo(
  function MobileReaderScrollPageCell({
    page,
    index,
    renderRangeStore,
    gapBefore,
    height,
    renderImage,
    renderScrollRow,
    onScrollingPageLayout,
    fallbackPage,
    strings,
  }: MobileReaderScrollPageCellProps) {
    const inRenderWindow = useSyncExternalStore(
      renderRangeStore.subscribe,
      () => renderRangeStore.includes(index),
    );
    const row = renderScrollRow?.(page, { inRenderWindow });
    // A waiting page's spinner finds its place on screen through its cell.
    const cell = useMemo<MobileReaderScrollCellRef>(() => ({ kind: "page", index }), [index]);
    return (
      <MobileReaderScrollCellContext.Provider value={cell}>
      <View
        onLayout={
          onScrollingPageLayout
            ? (event) => {
                const { y, height } = event.nativeEvent.layout;
                onScrollingPageLayout(index, { y, height });
              }
            : undefined
        }
        // The space sits above the page as a margin, outside the measured
        // frame, so a page's layout height is its picture alone.
        // With a scroll layout the cell is exactly its layout height (the
        // list's getItemLayout says so), whatever the content draws.
        style={[
          styles.scrollingFrame,
          { width: "100%", marginTop: gapBefore },
          height != null ? { height } : null,
        ]}
      >
        {row !== undefined ? (
          row
        ) : page.imageUri ? (
          renderImage(page, { inRenderWindow })
        ) : (
          <TextPage text={page.text} fallbackPage={fallbackPage} strings={strings} />
        )}
      </View>
      </MobileReaderScrollCellContext.Provider>
    );
  },
  (previous, next) =>
    previous.page === next.page &&
    previous.index === next.index &&
    previous.renderRangeStore === next.renderRangeStore &&
    previous.gapBefore === next.gapBefore &&
    previous.height === next.height &&
    previous.renderKey === next.renderKey &&
    previous.renderEpoch === next.renderEpoch &&
    previous.onScrollingPageLayout === next.onScrollingPageLayout &&
    previous.fallbackPage === next.fallbackPage &&
    previous.strings === next.strings,
);

export function MobileReaderGallery({
  accessibilityLabel,
  accessibilityHidden = false,
  onAccessibilityRetry,
  accessibilityRetryLabel,
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
  onScrollingSeekLanded,
  onScrollingFlingTarget,
  onContinuousScrollMetricsChange,
  onUserScrollBegin,
  onUserScrollSettle,
  onPagedDragEnd,
  onRetry,
  onPageStep,
  scrollScreenTapZones = false,
  onScrollScreenStep,
  onRequestAdvancePastEnd,
  onRequestRetreatPastStart,
  scrollPullHeader,
  scrollPullEnabled = false,
  onRowsSettled,
  pagedDisplayIndex,
  pagedDisplayCount,
  onSegmentedLogicalEndReached,
  onLongStripScrollProgressChange,
  onOpenSourceSettings,
  onOpenNextChapter,
  onOpenPreviousChapter,
  onToggleControls,
  chromeDismissing = false,
  onRevealChrome,
  pageZoomActive = false,
  fitClip = false,
  tapGesturesEnabled = true,
  stageGesture,
  pagedMode,
  pageTurnAccessibilityEnabled,
  pages,
  pagesState,
  readerImageWidth,
  readerPageWidth,
  readerScrollRef,
  renderImage,
  renderImageSegment,
  renderScrollRow,
  scrollPageRenderKeys,
  scrollPageRenderEpoch,
  scrollPageGaps,
  scrollPageLayout: scrollPageLayoutProp,
  scrollSideMargin = MOBILE_READER_SCROLL_SIDE_MARGIN,
  segmentedImageFrames,
  sourcePageForDisplayIndex,
  spreads,
  spreadSlots,
  pageGlide = false,
  windowKey = "",
  tapExclusions,
  foldGap,
  bookTapLayout,
  geometryKey,
  onStageOriginChange,
  contentIdentityKey,
  pageTurnTransition = null,
  pageBackgroundFor = null,
  onPageTurningChange,
  pageOverlaysMounted = false,
  isWidePage,
  pageFrameSize,
  pageNaturalSize,
  pageImageReady,
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
  const readerSkeletonVisible = useSkeletonDisplayDelay(150);
  // The chapter's state (error, locked, empty) sits on the reader
  // background: dark text when that is light (White, a light page border).
  const readerStateColors = mobileReaderPageBackgroundIsLight(backgroundColor)
    ? READER_STATE_COLORS_ON_LIGHT
    : READER_CAPSULE_COLORS;
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
  // A native pager turns the pages (curl or slide); the list only scrolls.
  const curlActive =
    (pageTurnTransition === "curl" ? pageCurlAvailable : pageTurnTransition === "slide" && pageSlideAvailable)
    && pagedMode
    && !logicalLongStripMode;
  const curlPagerRef = useRef<MobileReaderCurlPagerHandle | null>(null);
  const galleryItemCount = segmentedMode
    ? segmentedImageFrames!.length
    : isTwoPageMode
      ? spreads.length
      : displayedPages.length;
  // The page layout only drives the plain vertical page list.
  const scrollPageLayout =
    !pagedMode &&
    !segmentedMode &&
    !isTwoPageMode &&
    scrollPageLayoutProp &&
    scrollPageLayoutProp.heights.length === displayedPages.length &&
    displayedPages.length > 0
      ? scrollPageLayoutProp
      : null;
  const scrollPageLayoutRef = useRef(scrollPageLayout);
  const chromeTopPaddingRef = useRef(chromeTopPadding);
  chromeTopPaddingRef.current = chromeTopPadding;
  const pendingPageSeekRef = useRef<MobileReaderPageSeek | null>(null);
  // The held seek is placed by the next content-size event even when the
  // recorded offset already matches: a top padding change moved the native
  // offset (maintainVisibleContentPosition) before onScroll reports it.
  const forcePageSeekRef = useRef(false);
  const scrollAnchorRef = useRef<MobileReaderScrollPageAnchor | null>(null);
  // The page (and the spot on it) under the viewport's centre at the last
  // scroll event: a stage relayout (fold ⇄ unfold) keeps it at the centre.
  const scrollCentreAnchorRef = useRef<MobileReaderScrollPageAnchor | null>(null);
  // The spot of the last exact placement (the opening restore, a page seek)
  // while the reader has not scrolled since: a relayout keeps it, not the
  // centre (see resolveMobileReaderRelayoutSeekAnchor).
  const restingSpotRef = useRef<MobileReaderScrollPageAnchor | null>(null);
  const onScrollingSeekLandedRef = useRef(onScrollingSeekLanded);
  const touchStartRef = useRef<{
    x: number;
    y: number;
    time: number;
    /** Landed on a chrome piece that is fading out. */
    revealsChrome?: boolean;
    contentKey: string;
    pageTurnEnabled: boolean;
    /** Landed while the strip was still gliding: the touch stops it, nothing more. */
    stopsGlide?: boolean;
  } | null>(null);
  // Scroll mode: a fling is decelerating (a touch then catches the strip).
  const scrollGlidingRef = useRef(false);
  // Two fingers down: the sequence is a pinch or a two-finger tap, never a tap.
  const multiTouchRef = useRef(false);
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
  const onRevealChromeRef = useRef(onRevealChrome);
  const onPageStepRef = useRef(onPageStep);
  const onScrollScreenStepRef = useRef(onScrollScreenStep);
  onScrollScreenStepRef.current = onScrollScreenStep;
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
  // Scroll mode: which pages decode their image. The window follows the
  // live visible page (a fling runs far ahead of the committed one), reaches
  // by screen heights toward the scroll direction (see
  // resolveMobileReaderScrollPageRange) and is re-measured at every page
  // crossing; a committed page change (a jump, a restore, a settle)
  // re-anchors it at once.
  // Reads refs only: safe in the list's once-created callbacks.
  const currentScrollViewportTop = (): number =>
    latestScrollMetricsRef.current.contentOffset -
    Math.max(0, chromeTopPaddingRef.current);
  const [scrollRenderWindow, setScrollRenderWindow] = useState<{
    anchor: number;
    direction: MobileReaderScrollDirection;
    committedIndex: number | undefined;
    /** Screen top (layout coordinates) at the crossing; null: from the anchor. */
    viewportTop: number | null;
  }>(() => ({
    anchor: pagedDisplayIndex ?? 0,
    direction: "forward",
    committedIndex: pagedDisplayIndex,
    viewportTop: null,
  }));
  if (scrollRenderWindow.committedIndex !== pagedDisplayIndex) {
    setScrollRenderWindow((current) => {
      const anchor = pagedDisplayIndex ?? current.anchor;
      return {
        anchor,
        direction: current.direction,
        committedIndex: pagedDisplayIndex,
        // A settle commits the page the list already rests on: keep the
        // measured screen. A jump has not moved the list yet.
        viewportTop: anchor === current.anchor ? current.viewportTop : null,
      };
    });
  }
  const scrollRenderRanges = useMemo(() => {
    if (pagedMode) return null;
    const { anchor, direction, viewportTop } = scrollRenderWindow;
    const viewportLength = latestScrollMetricsRef.current.viewportLength;
    const geometry = {
      pageCount: displayedPages.length,
      anchorIndex: anchor,
      direction,
      // An unmeasured screen sits where a seek puts the anchor page: its top
      // at the reading line, right below the chrome.
      viewportTop:
        viewportTop ??
        (scrollPageLayout
          ? mobileReaderScrollOffsetForAnchor(scrollPageLayout, anchor, 0) -
            Math.max(0, chromeTopPadding)
          : null),
      viewportHeight: viewportLength > 0 ? viewportLength : windowHeight,
      layout: scrollPageLayout,
      estimatedPageHeight: readerImageWidth * MOBILE_READER_SCROLL_DEFAULT_PAGE_RATIO,
    };
    return {
      // Pages mount inside this range...
      enter: resolveMobileReaderScrollPageRange({
        ...geometry,
        behindViewports: MOBILE_READER_SCROLL_MOUNT_BEHIND_VIEWPORTS,
        minAhead: MOBILE_READER_SCROLL_MOUNT_MIN_PAGES,
        minBehind: MOBILE_READER_SCROLL_MOUNT_MIN_PAGES,
      }),
      // ...and unmount only once they leave this one.
      keep: resolveMobileReaderScrollPageRange({
        ...geometry,
        aheadViewports: MOBILE_READER_SCROLL_KEEP_AHEAD_VIEWPORTS,
        behindViewports: MOBILE_READER_SCROLL_KEEP_BEHIND_VIEWPORTS,
        minAhead: MOBILE_READER_SCROLL_MOUNT_MIN_PAGES,
        minBehind: MOBILE_READER_SCROLL_MOUNT_MIN_PAGES,
        maxBehind: MOBILE_READER_SCROLL_KEEP_MAX_BEHIND,
      }),
    };
  }, [
    chromeTopPadding,
    displayedPages.length,
    pagedMode,
    readerImageWidth,
    scrollPageLayout,
    scrollRenderWindow,
    windowHeight,
  ]);
  const scrollMountedRangeRef = useRef<MobileReaderPageRange | null>(null);
  const scrollMountedRange = useMemo(() => {
    const next = scrollRenderRanges
      ? nextMobileReaderMountedRange(
          scrollMountedRangeRef.current,
          scrollRenderRanges.enter,
          scrollRenderRanges.keep,
        )
      : null;
    scrollMountedRangeRef.current = next;
    return next;
  }, [scrollRenderRanges]);
  // The pages around where an iOS fling will rest mount as soon as the
  // fling starts, so they decode while the list travels.
  const scrollFlingLandingRef = useRef<MobileReaderPageRange | null>(null);
  const [renderRangeStore] = useState(createMobileReaderRenderRangeStore);
  // Scroll reading: the viewport, for the spinners of waiting pages (only
  // pages on screen show one, centred in their part on screen).
  const [scrollViewportStore] = useState(() =>
    createMobileReaderScrollViewportStore(initialContentOffset.y),
  );
  scrollViewportStore.setGeometry({
    layout: scrollPageLayout,
    segments: segmentedMode ? (segmentedImageFrames ?? null) : null,
    topPadding: chromeTopPadding,
    fallbackViewportHeight: windowHeight,
  });
  useLayoutEffect(() => {
    scrollViewportStore.notify();
  });
  // Recorded while rendering (cells rendered below read it), announced to
  // the cells that did not re-render once the commit lands.
  renderRangeStore.set(scrollMountedRange, scrollFlingLandingRef.current);
  useLayoutEffect(() => {
    renderRangeStore.notify();
  });
  const setScrollFlingLanding = (landing: MobileReaderPageRange | null) => {
    scrollFlingLandingRef.current = landing;
    renderRangeStore.set(scrollMountedRangeRef.current, landing);
    renderRangeStore.notify();
  };
  // The page the reader is on while the list moves: the render window
  // follows it and the reader's live page (toolbar counter, progress bar)
  // shows it.
  const lastCentrePageRef = useRef<number | null>(null);
  useEffect(() => {
    lastCentrePageRef.current = null;
  }, [scrollMountKey]);
  const reportScrollingVisiblePage = useCallback((nextPageIndex: number) => {
    setScrollRenderWindow((current) =>
      current.anchor === nextPageIndex
        ? current
        : {
            anchor: nextPageIndex,
            direction: nextMobileReaderScrollDirection(
              current.anchor,
              nextPageIndex,
              current.direction,
            ),
            committedIndex: current.committedIndex,
            viewportTop: currentScrollViewportTop(),
          },
    );
    onScrollingVisiblePageChangeRef.current?.(nextPageIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reads refs only.
  }, []);
  const onViewableItemsChanged = useCallback(
    ({
      viewableItems,
    }: {
      viewableItems: ListViewToken[];
    }) => {
      // With a page layout the scroll handler reports the page under the
      // screen's centre on every frame; the viewable items' middle one can
      // be another page (a tall page half off screen is not "viewable").
      if (scrollPageLayoutRef.current) return;
      const nextPageIndex = readerDisplayIndexForViewableItems(
        viewableItems.flatMap((token) => {
          if (!token.isViewable) return [];
          if (token.item.kind === "segment") return [0];
          if (token.item.kind === "page") return [token.item.index];
          return [];
        }),
        displayedPageCountRef.current,
      );
      if (nextPageIndex != null) reportScrollingVisiblePage(nextPageIndex);
    },
    [reportScrollingVisiblePage],
  );
  const onUserScrollSettleRef = useRef(onUserScrollSettle);
  const dragSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const clearDragSettleTimer = useCallback(() => {
    if (dragSettleTimerRef.current) {
      clearTimeout(dragSettleTimerRef.current);
      dragSettleTimerRef.current = null;
    }
  }, []);
  useLayoutEffect(() => {
    onUserScrollSettleRef.current = onUserScrollSettle;
  }, [onUserScrollSettle]);
  useEffect(() => clearDragSettleTimer, [clearDragSettleTimer]);

  // Scroll mode with a page layout: page seeks are exact offsets.
  const checkPageSeekLanded = useCallback((currentOffset: number) => {
    const seek = pendingPageSeekRef.current;
    const layout = scrollPageLayoutRef.current;
    if (!seek || seek.landed || !layout) return;
    if (
      !isMobileReaderScrollSeekLanded({
        currentOffset,
        targetOffset: mobileReaderScrollOffsetForAnchor(
          layout,
          seek.pageIndex,
          seek.fraction,
        ),
        maximumOffset: latestScrollMetricsRef.current.maximumOffset,
      })
    ) {
      return;
    }
    seek.landed = true;
    onScrollingSeekLandedRef.current?.(seek.pageIndex);
  }, []);
  /** Re-places a held page seek against the current layout. */
  const reapplyPageSeek = useCallback(() => {
    const seek = pendingPageSeekRef.current;
    const layout = scrollPageLayoutRef.current;
    if (!seek || !layout) return;
    const forced = forcePageSeekRef.current;
    forcePageSeekRef.current = false;
    const now = Date.now();
    if (
      now > seek.until &&
      (now > seek.settleBy ||
        isMobileReaderScrollSeekSettled(
          layout,
          seek.pageIndex,
          seek.fraction,
          chromeTopPaddingRef.current,
        ))
    ) {
      pendingPageSeekRef.current = null;
      return;
    }
    const offset = mobileReaderScrollOffsetForAnchor(
      layout,
      seek.pageIndex,
      seek.fraction,
    );
    if (forced || Math.abs(latestScrollMetricsRef.current.contentOffset - offset) > 1) {
      listRef.current?.scrollToOffset({ offset, animated: false });
    } else {
      checkPageSeekLanded(offset);
    }
  }, [checkPageSeekLanded]);
  useLayoutEffect(() => {
    onScrollingSeekLandedRef.current = onScrollingSeekLanded;
  }, [onScrollingSeekLanded]);
  useLayoutEffect(() => {
    // Heights that change move the content size; the content-size event (after
    // the native layout, and after maintainVisibleContentPosition's own
    // correction) re-places a held seek. Re-placing here could land before
    // that correction and be shifted twice.
    scrollPageLayoutRef.current = scrollPageLayout;
  }, [scrollPageLayout]);
  // Seamless scroll: rows inserted above (a previous chapter joined) or
  // removed from the head (a chapter dropped above) move every row index.
  // The anchors the scroll handler keeps are row indexes: they move with
  // their rows now, not at the next scroll event, and events still on their
  // way in the old rows' terms are measured as the shifted offset (see
  // resolveMobileReaderScrollEventOffset), so none lands in the wrong rows.
  const scrollRowsRef = useRef<{
    mountKey: string;
    keys: string[];
    layout: MobileReaderScrollLayout | null;
  } | null>(null);
  const scrollHeadShiftRef = useRef<MobileReaderScrollHeadShift | null>(null);
  // The native offset as the list last reported it (never re-measured).
  const latestRawOffsetRef = useRef(0);
  // Rows inserted / removed above, or rows above the reading line resized:
  // until the list has reported its new size and the offset is checked
  // (put back if it did not follow), the rows are settling — no crossing,
  // no head prune (see rowsSettling on the handle).
  const rowsSettleRef = useRef<{
    settle: MobileReaderStripRowsSettle;
    events: number;
    eventsAfterContent: number;
    contentSeen: boolean;
    tries: number;
    timer: ReturnType<typeof setTimeout> | null;
    frame: number | null;
  } | null>(null);
  // The settle found no report at all since the rows changed (v14: a sheet
  // over the reader while the device turns): the list is placed on its
  // target and the rows stay settling until it reports again (see
  // isMobileReaderStripRowsSettleUnreported).
  const rowsUnreportedRef = useRef<{
    target: number;
    since: number;
    tries: number;
    fixes: number;
    timer: ReturnType<typeof setTimeout> | null;
  } | null>(null);
  const onRowsSettledRef = useRef(onRowsSettled);
  onRowsSettledRef.current = onRowsSettled;
  // Pull prepend mode (see scrollPullHeader).
  const pullStateRef = useRef<MobileReaderStripPullState>(MOBILE_READER_STRIP_PULL_IDLE);
  const pullHeaderOpacity = useSharedValue(0);
  const pullHeaderAnimatedStyle = useAnimatedStyle(() => ({ opacity: pullHeaderOpacity.value }));
  const scrollPullActiveRef = useRef(false);
  scrollPullActiveRef.current = scrollPullHeader != null && scrollPullEnabled;
  const galleryUserScrolling = () => dragStartOffsetRef.current != null || scrollGlidingRef.current;
  const clearRowsSettle = () => {
    const pending = rowsSettleRef.current;
    if (!pending) return;
    if (pending.timer) clearTimeout(pending.timer);
    if (pending.frame != null) cancelAnimationFrame(pending.frame);
    rowsSettleRef.current = null;
  };
  const clearRowsUnreported = () => {
    const unreported = rowsUnreportedRef.current;
    if (!unreported) return;
    if (unreported.timer) clearTimeout(unreported.timer);
    rowsUnreportedRef.current = null;
  };
  /** Where the list must be: a held seek's spot, else the resting spot, else `fallback`. */
  const rowsPlacementTarget = (fallback: number): number => {
    const layout = scrollPageLayoutRef.current;
    const spot = pendingPageSeekRef.current ?? restingSpotRef.current;
    return layout && spot ? mobileReaderScrollOffsetForAnchor(layout, spot.pageIndex, spot.fraction) : fallback;
  };
  /**
   * The list did not report: JS holds the target as where it is (anchors,
   * page window) — never the old offset read against the new rows (v14: a
   * centre read there crossed 631→630 at p106, and after the sheet closed
   * the strip was blank where the list really was).
   */
  const placeUnreportedRows = (target: number, probe: boolean) => {
    const metrics = latestScrollMetricsRef.current;
    recordContinuousScrollMetrics(
      { contentOffset: target, contentLength: metrics.contentLength, viewportLength: metrics.viewportLength },
      false,
    );
    latestRawOffsetRef.current = target;
    scrollHeadShiftRef.current = null;
    lastCentrePageRef.current = null;
    const layout = scrollPageLayoutRef.current;
    if (layout) {
      scrollAnchorRef.current = mobileReaderScrollAnchorForOffset(layout, target);
      const height = metrics.viewportLength > 0 ? metrics.viewportLength : windowHeight;
      scrollCentreAnchorRef.current = mobileReaderScrollCentreAnchor(layout, target, height, chromeTopPaddingRef.current);
      const centre = mobileReaderScrollCentrePageIndex(layout, target, height, chromeTopPaddingRef.current);
      if (centre != null) {
        setScrollRenderWindow((current) => {
          const viewportTop = currentScrollViewportTop();
          return current.anchor === centre && current.viewportTop === viewportTop
            ? current
            : { ...current, anchor: centre, viewportTop };
        });
      }
    }
    // A list already on its target sends no event for the same offset: a
    // 1pt step and back makes a live list report (an off-screen one ignores it).
    if (probe) listRef.current?.scrollToOffset({ offset: target + 1, animated: false });
    listRef.current?.scrollToOffset({ offset: target, animated: false });
  };
  const retryRowsUnreported = () => {
    const unreported = rowsUnreportedRef.current;
    if (!unreported) return;
    unreported.timer = null;
    if (Date.now() - unreported.since > MOBILE_READER_STRIP_UNREPORTED_MAX_MS) {
      clearRowsUnreported();
      onRowsSettledRef.current?.(true);
      return;
    }
    unreported.tries += 1;
    unreported.target = rowsPlacementTarget(unreported.target);
    placeUnreportedRows(unreported.target, true);
    unreported.timer = setTimeout(retryRowsUnreported, MOBILE_READER_STRIP_UNREPORTED_RETRY_MS);
  };
  const enterRowsUnreported = (target: number) => {
    const current = rowsUnreportedRef.current;
    if (current?.timer) clearTimeout(current.timer);
    const next = {
      target,
      since: current?.since ?? Date.now(),
      tries: current?.tries ?? 0,
      fixes: current?.fixes ?? 0,
      timer: null as ReturnType<typeof setTimeout> | null,
    };
    rowsUnreportedRef.current = next;
    placeUnreportedRows(target, false);
    next.timer = setTimeout(retryRowsUnreported, MOBILE_READER_STRIP_UNREPORTED_RETRY_MS);
  };
  /**
   * A scroll event while unreported (after the handler read it): on the
   * target, or the reader's own scroll, ends it; at rest elsewhere the list
   * is put on the target again (a few times at most).
   */
  const noteRowsUnreportedEvent = (nativeOffset: number) => {
    const unreported = rowsUnreportedRef.current;
    if (!unreported) return;
    const target = rowsPlacementTarget(unreported.target);
    const { fixTo } = resolveMobileReaderStripUnreportedReport({
      target,
      nativeOffset,
      userScrolling: galleryUserScrolling(),
    });
    if (fixTo != null && unreported.fixes < 4) {
      unreported.fixes += 1;
      enterRowsUnreported(fixTo);
      return;
    }
    clearRowsUnreported();
    if (!rowsSettleRef.current) onRowsSettledRef.current?.(fixTo != null);
  };
  const checkRowsSettle = (timedOut: boolean) => {
    const pending = rowsSettleRef.current;
    if (!pending) return;
    // The native correction's own scroll event may still be on its way:
    // give it a few frames before judging the offset (mid-scroll, an event
    // sent after the new size — an earlier one may predate the commit).
    const waiting = galleryUserScrolling() ? pending.eventsAfterContent === 0 : pending.events === 0;
    if (!timedOut && waiting && pending.tries < 3) {
      pending.tries += 1;
      pending.frame = requestAnimationFrame(() => {
        pending.frame = null;
        checkRowsSettle(false);
      });
      return;
    }
    clearRowsSettle();
    const { settle } = pending;
    const native = latestRawOffsetRef.current;
    const scrolling = galleryUserScrolling();
    const seekHeld = pendingPageSeekRef.current != null;
    // A held seek owns the offset (it re-places in the new rows' terms).
    const judged = resolveMobileReaderStripRowsSettle(settle, native, scrolling);
    if (isMobileReaderStripRowsSettleUnreported(pending.events, scrolling)) {
      // Not one event since the rows changed: `native` is the old offset,
      // not where the list is. Placed on its target; still settling.
      const target = rowsPlacementTarget(judged.expected);
      enterRowsUnreported(target);
      return;
    }
    const result = seekHeld ? { ...judged, fixTo: null } : judged;
    if (result.fixTo != null) {
      // An absolute offset in the new rows' terms: no event is stale now.
      scrollHeadShiftRef.current = null;
      // The centre read meanwhile was not reported (see rowsSettling): the
      // next event reports it again even when it is the same row.
      lastCentrePageRef.current = null;
      listRef.current?.scrollToOffset({ offset: result.fixTo, animated: false });
    }
    onRowsSettledRef.current?.(result.fixTo != null);
  };
  /** The list reported (an event or its new size): judge the offset soon. */
  const noteRowsSettleReport = (kind: "event" | "content") => {
    const pending = rowsSettleRef.current;
    if (!pending) return;
    if (kind === "event") {
      pending.events += 1;
      if (pending.contentSeen) pending.eventsAfterContent += 1;
    } else pending.contentSeen = true;
    if (!pending.contentSeen || pending.frame != null) return;
    pending.frame = requestAnimationFrame(() => {
      pending.frame = null;
      if (rowsSettleRef.current === pending) checkRowsSettle(false);
    });
  };
  const armRowsSettle = (settle: MobileReaderStripRowsSettle) => {
    const pending = rowsSettleRef.current;
    if (pending?.timer) clearTimeout(pending.timer);
    if (pending?.frame != null) cancelAnimationFrame(pending.frame);
    const next = {
      settle: mergeMobileReaderStripRowsSettle(pending?.settle ?? null, settle),
      events: 0,
      eventsAfterContent: 0,
      contentSeen: false,
      tries: 0,
      timer: null as ReturnType<typeof setTimeout> | null,
      frame: null as number | null,
    };
    next.timer = setTimeout(() => {
      next.timer = null;
      if (rowsSettleRef.current === next) checkRowsSettle(true);
    }, MOBILE_READER_STRIP_ROWS_SETTLE_MAX_MS);
    rowsSettleRef.current = next;
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- reads refs only.
  useEffect(
    () => () => {
      clearRowsSettle();
      clearRowsUnreported();
    },
    [scrollMountKey],
  );
  useLayoutEffect(() => {
    const previous = scrollRowsRef.current;
    const keys = displayedPages.map((page) => page.id);
    scrollRowsRef.current = { mountKey: scrollMountKey, keys, layout: scrollPageLayout };
    if (
      pagedMode ||
      !previous ||
      previous.mountKey !== scrollMountKey ||
      !previous.layout ||
      !scrollPageLayout
    ) {
      return;
    }
    const rows = mobileReaderStripHeadRowShift(previous.keys, keys);
    if (rows === 0 && previous.layout !== scrollPageLayout) {
      // Rows above the reading line resized (no rows added): the same
      // picture must stay at the reading line — checked once the list reports.
      const anchorRow = scrollAnchorRef.current?.pageIndex;
      if (anchorRow != null) {
        const before = previous.layout.starts[anchorRow];
        const after = scrollPageLayout.starts[anchorRow];
        if (before != null && after != null && Math.abs(after - before) > 1) {
          let rowsHeight = 0;
          for (let row = 0; row < anchorRow; row += 1) {
            const grown =
              (scrollPageLayout.heights[row] ?? 0) +
              (scrollPageLayout.gaps[row] ?? 0) -
              (previous.layout.heights[row] ?? 0) -
              (previous.layout.gaps[row] ?? 0);
            if (Math.abs(grown) > 0.5) rowsHeight += grown;
          }
          const delta = after - before;
          const scrolling = galleryUserScrolling();
          armRowsSettle({
            kind: "above-resize",
            before: latestRawOffsetRef.current,
            jsDelta: delta,
            rowsHeight,
            rows: 0,
          });
          // At rest, events still on their way carry the offset before the
          // native correction: measured where those rows are now.
          if (!scrolling) {
            const active = scrollHeadShiftRef.current;
            scrollHeadShiftRef.current =
              active && Date.now() <= active.until
                ? { ...active, offset: active.offset + delta, until: Date.now() + MOBILE_READER_SCROLL_HEAD_SHIFT_WINDOW_MS }
                : {
                    offset: delta,
                    lastOffset: latestScrollMetricsRef.current.contentOffset,
                    until: Date.now() + MOBILE_READER_SCROLL_HEAD_SHIFT_WINDOW_MS,
                  };
          }
        }
      }
    }
    if (rows == null || rows === 0) return;
    scrollAnchorRef.current = shiftMobileReaderScrollAnchorRows(scrollAnchorRef.current, rows);
    scrollCentreAnchorRef.current = shiftMobileReaderScrollAnchorRows(scrollCentreAnchorRef.current, rows);
    restingSpotRef.current = shiftMobileReaderScrollAnchorRows(restingSpotRef.current, rows);
    lastCentrePageRef.current = shiftMobileReaderRowIndex(lastCentrePageRef.current, rows);
    const seek = pendingPageSeekRef.current;
    if (seek) {
      const shifted = shiftMobileReaderRowIndex(seek.pageIndex, rows);
      if (shifted == null) pendingPageSeekRef.current = null;
      else seek.pageIndex = shifted;
    }
    const toIndex = pendingScrollToIndexRef.current;
    if (toIndex) {
      const shifted = shiftMobileReaderRowIndex(toIndex.index, rows);
      if (shifted == null) pendingScrollToIndexRef.current = null;
      else toIndex.index = shifted;
    }
    const offset = mobileReaderStripHeadShiftOffset(previous.layout.starts, scrollPageLayout.starts, rows);
    scrollHeadShiftRef.current =
      offset !== 0
        ? {
            offset,
            lastOffset: latestScrollMetricsRef.current.contentOffset,
            until: Date.now() + MOBILE_READER_SCROLL_HEAD_SHIFT_WINDOW_MS,
          }
        : null;
    // The render window stays on the screen's rows (maintainVisibleContentPosition
    // keeps the picture): never a window left on the old row numbers, which
    // mounts nothing where the list is (a black screen) until it reports.
    const centre = lastCentrePageRef.current;
    if (centre != null) {
      const viewportTop = currentScrollViewportTop() + offset;
      setScrollRenderWindow((current) => ({ ...current, anchor: centre, viewportTop }));
    }
    // The real height of the rows inserted (removed: from the old layout).
    let insertedHeight = 0;
    if (rows > 0) {
      for (let row = 0; row < rows; row += 1) {
        insertedHeight += (scrollPageLayout.heights[row] ?? 0) + (scrollPageLayout.gaps[row] ?? 0);
      }
    } else {
      for (let row = 0; row < -rows; row += 1) {
        insertedHeight -= (previous.layout.heights[row] ?? 0) + (previous.layout.gaps[row] ?? 0);
      }
    }
    if (offset !== 0) {
      armRowsSettle({
        kind: "head-shift",
        before: latestRawOffsetRef.current,
        jsDelta: offset,
        rowsHeight: insertedHeight,
        rows,
      });
    }
    if (__DEV__) {
      console.info(
        `[reader-strip] head shift rows=${rows} offset=${Math.round(offset)} anchor=${
          scrollAnchorRef.current
            ? `row${scrollAnchorRef.current.pageIndex}@${scrollAnchorRef.current.fraction.toFixed(2)}`
            : "none"
        } seek=${pendingPageSeekRef.current ? `row${pendingPageSeekRef.current.pageIndex}` : "none"}`,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the rows changing is the trigger.
  }, [displayedPages, scrollPageLayout]);
  const scrollIndexViewOffset = useCallback(
    (index: number) =>
      pagedMode || segmentedMode
        ? 0
        : mobileReaderScrollIndexViewOffset(
            chromeTopPadding,
            scrollPageGaps?.[index] ??
              (index === 0 ? 0 : MOBILE_READER_SCROLL_PAGE_SPACING),
          ),
    [chromeTopPadding, pagedMode, scrollPageGaps, segmentedMode],
  );

  useImperativeHandle(
    readerScrollRef,
    () => ({
      scrollTo({ x = 0, y = 0, index, fraction, animated = true }) {
        if (curlActive) {
          curlPagerRef.current?.goToFrame(readerPageWidth > 0 ? Math.round(x / readerPageWidth) : 0, animated);
          return;
        }
        // Only an exact page seek (below) leaves a spot a relayout keeps.
        restingSpotRef.current = null;
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
          const layout = scrollPageLayoutRef.current;
          if (layout) {
            if (scrollToIndexRetryTimerRef.current) {
              clearTimeout(scrollToIndexRetryTimerRef.current);
              scrollToIndexRetryTimerRef.current = null;
            }
            pendingScrollToIndexRef.current = null;
            pendingLogicalScrollProgressRef.current = null;
            pendingContentSizeScrollProgressRef.current = null;
            const seekFraction =
              fraction != null && Number.isFinite(fraction)
                ? Math.max(0, Math.min(1, fraction))
                : 0;
            const offset = mobileReaderScrollOffsetForAnchor(
              layout,
              targetIndex,
              seekFraction,
            );
            pendingPageSeekRef.current = animated
              ? null
              : holdMobileReaderPageSeek(
                  { pageIndex: targetIndex, fraction: seekFraction },
                  false,
                );
            restingSpotRef.current = animated ? null : { pageIndex: targetIndex, fraction: seekFraction };
            listRef.current?.scrollToOffset({ offset, animated });
            // Already there: no scroll event will report the landing.
            if (!animated) {
              checkPageSeekLanded(latestScrollMetricsRef.current.contentOffset);
            }
            return;
          }
          pendingScrollToIndexRef.current = {
            index: targetIndex,
            animated,
            attempts: 0,
          };
          listRef.current?.scrollToIndex({
            index: targetIndex,
            animated,
            viewPosition: 0,
            // The page's top right below the chrome, not under it.
            viewOffset: scrollIndexViewOffset(targetIndex),
          });
          return;
        }
        // A turn asked for after a relayout re-placed the pager supersedes
        // that re-placement: re-applying it once the new content size lands
        // snapped the turn back (a tap right after a chapter crossing).
        if (pagedMode) pendingPagedRelayoutOffsetRef.current = null;
        listRef.current?.scrollToOffset({
          offset: pagedMode ? x : y,
          animated,
        });
      },
      pageAnchor() {
        return scrollPageLayoutRef.current ? scrollAnchorRef.current : null;
      },
      rowsSettling() {
        return !pagedMode && (rowsSettleRef.current != null || rowsUnreportedRef.current != null);
      },
      scrollViewport() {
        if (pagedMode) return null;
        const metrics = latestScrollMetricsRef.current;
        const height =
          metrics.viewportLength > 0 ? metrics.viewportLength : windowHeight;
        if (!(height > 0)) return null;
        return { top: currentScrollViewportTop(), height };
      },
      contentOffset() {
        return pagedMode ? null : latestScrollMetricsRef.current.contentOffset;
      },
      centrePageIndex() {
        const layout = scrollPageLayoutRef.current;
        if (pagedMode || !layout) return null;
        const metrics = latestScrollMetricsRef.current;
        const height =
          metrics.viewportLength > 0 ? metrics.viewportLength : windowHeight;
        if (!(height > 0)) return null;
        return mobileReaderScrollCentrePageIndex(
          layout,
          metrics.contentOffset,
          height,
          chromeTopPaddingRef.current,
        );
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
        pendingPageSeekRef.current = null;
        restingSpotRef.current = null;
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
      checkPageSeekLanded,
      curlActive,
      galleryItemCount,
      pagedMode,
      readerPageWidth,
      resolvedContinuousContentIdentity,
      scrollIndexViewOffset,
      windowHeight,
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
    const viewOffset = scrollIndexViewOffset(targetIndex);
    listRef.current?.scrollToOffset({
      // Estimated like FlatList's own frames: cells start below the padding.
      offset: Math.max(
        0,
        chromeTopPadding + info.averageItemLength * targetIndex - viewOffset,
      ),
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
        viewOffset: scrollIndexViewOffset(retry.index),
      });
    }, 100);
  };

  useLayoutEffect(() => {
    onToggleControlsRef.current = onToggleControls;
    onRevealChromeRef.current = onRevealChrome;
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
    onRevealChrome,
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
      pendingPageSeekRef.current = null;
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
    forcePageSeekRef.current = false;
    const initialOffset = pagedMode ? initialContentOffset.x : initialContentOffset.y;
    const layout = scrollPageLayoutRef.current;
    scrollAnchorRef.current = layout
      ? mobileReaderScrollAnchorForOffset(layout, initialOffset)
      : null;
    scrollCentreAnchorRef.current = null;
    // The first layout of a fresh list may clamp the opening offset: hold it.
    pendingPageSeekRef.current =
      layout && scrollAnchorRef.current && initialOffset > 0
        ? holdMobileReaderPageSeek(scrollAnchorRef.current, false)
        : null;
    if (pendingPageSeekRef.current) pendingLogicalScrollProgressRef.current = null;
    restingSpotRef.current = scrollAnchorRef.current;
    listRef.current?.scrollToOffset({
      offset: initialOffset,
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
  const stripRelayoutAnchor = (layout: NonNullable<typeof scrollPageLayout>) => {
    const anchor = scrollAnchorRef.current;
    if (!anchor) return null;
    const heldSeek = pendingPageSeekRef.current;
    const restingSpot = restingSpotRef.current;
    const centre = restingSpot || (heldSeek && !heldSeek.landed) ? null : scrollCentreAnchorRef.current;
    const target = centre
      ? mobileReaderScrollAnchorForOffset(
          layout,
          mobileReaderScrollOffsetForCentreAnchor(layout, centre, windowHeight, chromeTopPadding),
        )
      : null;
    return resolveMobileReaderRelayoutSeekAnchor({ restingSpot, heldSeek, centreTarget: target, anchor });
  };
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
    // A page list keeps the page under the viewport's centre (and the spot
    // on it) at the centre — flat ⇄ half folded keeps what the reader was
    // looking at, not the chapter's progress or the top line. While an
    // opening restore is still on its way the reading-line spot is kept, as
    // before, and so is the spot of the last exact placement while the
    // reader has not scrolled since (a resume mounted at a provisional
    // width: v14 635 p40 crept up ~0.11 page per reopen). The new layout
    // already has the new heights.
    const seekAnchor = scrollPageLayout ? stripRelayoutAnchor(scrollPageLayout) : null;
    if (seekAnchor) {
      pendingContentSizeScrollProgressRef.current = null;
      pendingLogicalScrollProgressRef.current = null;
      scrollAnchorRef.current = seekAnchor;
      // The commit itself carried the offset (`listContentOffsetRef`); the
      // content-size event this relayout causes corrects any difference, by
      // then the native list has the new frames.
      pendingPageSeekRef.current = holdMobileReaderPageSeek(seekAnchor, true);
      return;
    }
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
  // Scroll mode: a change of the list's top padding (a safe-area inset that
  // came or went) is compensated by maintainVisibleContentPosition, which
  // moves the offset by the difference and strands the page that far from
  // the reading line. Re-place the page being read (and the spot on it)
  // through a held seek; the content-size event of the new padding applies it,
  // unconditionally: at the chapter's top (offset 0) the recorded offset is
  // still the target when that event comes, the native shift not reported yet.
  const chromeTopPaddingTrackRef = useRef<{ mountKey: string; padding: number } | null>(null);
  useLayoutEffect(() => {
    const previous = chromeTopPaddingTrackRef.current;
    chromeTopPaddingTrackRef.current = { mountKey: scrollMountKey, padding: chromeTopPadding };
    if (
      pagedMode ||
      !previous ||
      previous.mountKey !== scrollMountKey ||
      Math.abs(previous.padding - chromeTopPadding) < 0.5
    ) {
      return;
    }
    // A seek still held (the opening restore) is re-placed by the same event,
    // its hold renewed and its landing still reported.
    const held = pendingPageSeekRef.current;
    const anchor = held ?? scrollAnchorRef.current;
    if (!scrollPageLayoutRef.current || !anchor) return;
    pendingPageSeekRef.current = holdMobileReaderPageSeek(anchor, held ? held.landed : true);
    forcePageSeekRef.current = true;
  }, [chromeTopPadding, pagedMode, scrollMountKey]);
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
    multiTouchRef.current = readerStageMultiTouchOnStart(multiTouchRef.current, touch);
    if (multiTouchRef.current) {
      touchStartRef.current = null;
      return;
    }
    const x = touch.pageX - stageOriginRef.current.x;
    const y = touch.pageY - stageOriginRef.current.y;
    if (spreadSlots && !spreadSlots.some((slot) =>
      x >= slot.x && x <= slot.x + slot.width && y >= slot.y && y <= slot.y + slot.height)) {
      touchStartRef.current = null;
      return;
    }
    if (mobileReaderTapExcluded({ x, y }, undefined, foldGap) || isReaderBookTapDead(x, bookTapLayout)) {
      touchStartRef.current = null;
      return;
    }
    // Screen tap zones: with the chrome gone the strip's padding bands are
    // only padding (the page scrolls under them), so they belong to the top
    // and bottom zones; shown chrome still owns its own rects and bands.
    const screenZonesOwnBands = readerScrollScreenTapEnabled && !tapExclusions;
    const owner = readerStageTouchOwner({
      x,
      y,
      height: windowHeight,
      topInset: screenZonesOwnBands ? 0 : chromeTopPadding,
      bottomInset: screenZonesOwnBands ? 0 : bottomPadding,
      chromePieces: tapExclusions,
      chromeDismissing,
    });
    if (owner === "chrome") {
      touchStartRef.current = null;
      return;
    }
    const now = Date.now();
    if (owner === "revealChrome") {
      touchStartRef.current = {
        x: touch.pageX,
        y: touch.pageY,
        time: now,
        revealsChrome: true,
        contentKey: resolvedContentIdentityKey,
        pageTurnEnabled: false,
      };
      return;
    }
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
      contentKey: resolvedContentIdentityKey,
      pageTurnEnabled: readerPageTurnEnabled || readerScrollScreenTapEnabled,
      stopsGlide: !pagedMode && scrollGlidingRef.current,
    };
    // The touch itself catches the glide (iOS may not report its end).
    scrollGlidingRef.current = false;
  };
  // The chrome toggle is the only way out of a black screen, so it must keep
  // working while the chapter is loading or in an error/blocked state; there
  // every band acts like the centre. Only page turns need a ready gallery.
  const readerStageTapEnabled = isReaderStageTapEnabled({ tapGesturesEnabled });
  // A tap turns like a swipe: onto a page still loading (it shows its
  // placeholder and goes first in the load queue), never a dead tap.
  const readerPageTurnEnabled =
    !isReaderLoading &&
    pagesState.status === "ready" &&
    pages.length > 0 &&
    pagedMode &&
    Boolean(onPageStep);
  // Scroll mode's screen zones: the strip moves a screen at a time, so they
  // only need a ready, non-empty strip (a page still loading is a screen too).
  const readerScrollScreenTapEnabled =
    scrollScreenTapZones &&
    !pagedMode &&
    !isReaderLoading &&
    pagesState.status === "ready" &&
    pages.length > 0 &&
    Boolean(onScrollScreenStep);
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
    const multiTouch = readerStageMultiTouchOnEnd(multiTouchRef.current, event.nativeEvent);
    multiTouchRef.current = multiTouch.multiTouch;
    if (multiTouch.ignore) {
      touchStartRef.current = null;
      return;
    }
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start || !readerStageTouchMatchesContent(start.contentKey, resolvedContentIdentityKey)) return;

    const touch = event.nativeEvent;
    if (start.revealsChrome) {
      // Never a page turn, a chapter swipe or a toggle: the piece the reader
      // aimed at is still on screen, so the chrome it belongs to comes back.
      if (
        Math.hypot(touch.pageX - start.x, touch.pageY - start.y) <= READER_TAP_MAX_DISTANCE &&
        Date.now() - start.time <= READER_TAP_MAX_DURATION_MS
      ) {
        if (pendingToggleTimerRef.current) {
          clearTimeout(pendingToggleTimerRef.current);
          pendingToggleTimerRef.current = null;
        }
        lastCentreTapEndAtRef.current = 0;
        onRevealChromeRef.current?.();
      }
      return;
    }
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
      !curlActive &&
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
    // A tap that caught a gliding strip only stopped it (iOS): no screen
    // step and no chrome toggle on top.
    if (start.stopsGlide) return;
    const zone = !start.pageTurnEnabled
      ? "toggle"
      : readerScrollScreenTapEnabled
        ? readerScrollTapZoneForPosition({
            y: touch.pageY - stageOriginRef.current.y,
            height: windowHeight,
          })
        : bookTapLayout
          ? readerBookTapZoneForPosition({
              x: touch.pageX - stageOriginRef.current.x,
              layout: bookTapLayout,
              mode,
              pagedMode: readerPageTurnEnabled,
            })
        : readerPageTurnEnabled
          ? readerTapZoneForPosition({
              x: touch.pageX - stageOriginRef.current.x,
              width: readerPageWidth,
              mode,
              pagedMode,
            })
          : "toggle";
    // Book posture hinge band: no zone at all.
    if (zone === null) return;
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
      if (readerScrollScreenTapEnabled) onScrollScreenStepRef.current?.(dispatch.zone);
      else onPageStepRef.current?.(dispatch.zone);
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
    scrollGlidingRef.current = false;
    if (scrollFlingLandingRef.current) setScrollFlingLanding(null);
    clearDragSettleTimer();
    if (scrollToIndexRetryTimerRef.current) {
      clearTimeout(scrollToIndexRetryTimerRef.current);
      scrollToIndexRetryTimerRef.current = null;
    }
    pendingScrollToIndexRef.current = null;
    pendingPageSeekRef.current = null;
    restingSpotRef.current = null;
    forcePageSeekRef.current = false;
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
      const { contentSize, layoutMeasurement } = event.nativeEvent;
      // After a head shift, an event still in the old rows' terms is
      // measured where those rows are now.
      const resolved = resolveMobileReaderScrollEventOffset(
        scrollHeadShiftRef.current,
        event.nativeEvent.contentOffset.y,
        Date.now(),
      );
      scrollHeadShiftRef.current = resolved.shift;
      const contentOffset = { y: resolved.offset };
      const rawOffset = event.nativeEvent.contentOffset.y;
      latestRawOffsetRef.current = rawOffset;
      noteRowsSettleReport("event");
      if (scrollPullHeader != null) {
        const pulled = nextMobileReaderStripPull(pullStateRef.current, {
          offset: rawOffset,
          dragging: dragStartOffsetRef.current != null,
          enabled: scrollPullActiveRef.current,
        });
        if (pulled.state !== pullStateRef.current) {
          pullStateRef.current = pulled.state;
          pullHeaderOpacity.value = mobileReaderStripPullHeaderOpacity(pulled.state.pull);
        }
        if (pulled.haptic) void hapticSelection();
      }
      const metrics = {
        contentOffset: contentOffset.y,
        // Progress follows the physical native scroll range, including the
        // toolbar-safe trailing inset. Otherwise 100% lands before the last
        // image can clear the chrome and releasing the end thumb snaps back.
        contentLength: contentSize.height,
        viewportLength: layoutMeasurement.height,
      };
      recordContinuousScrollMetrics(metrics, logicalLongStripMode);
      scrollViewportStore.setScroll(contentOffset.y, layoutMeasurement.height);
      scrollViewportStore.notify();
      const layout = scrollPageLayoutRef.current;
      if (layout) {
        scrollAnchorRef.current = mobileReaderScrollAnchorForOffset(
          layout,
          contentOffset.y,
        );
        scrollCentreAnchorRef.current = mobileReaderScrollCentreAnchor(
          layout,
          contentOffset.y,
          layoutMeasurement.height,
          chromeTopPaddingRef.current,
        );
        checkPageSeekLanded(contentOffset.y);
        const centrePage = mobileReaderScrollCentrePageIndex(
          layout,
          contentOffset.y,
          layoutMeasurement.height,
          chromeTopPaddingRef.current,
        );
        // Reported on change only, as the viewable items were: a seek's
        // small re-placement must not re-commit a page.
        if (centrePage != null && centrePage !== lastCentrePageRef.current) {
          lastCentrePageRef.current = centrePage;
          reportScrollingVisiblePage(centrePage);
        }
      }
      // After the rows' report: an unreported settle ends (or re-places) here.
      noteRowsUnreportedEvent(rawOffset);
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
    noteRowsSettleReport("content");
    if (scrollPageLayoutRef.current && pendingPageSeekRef.current) {
      // A held page seek owns the offset; progress re-placement would fight it.
      pendingContentSizeScrollProgressRef.current = null;
      pendingLogicalScrollProgressRef.current = null;
      reapplyPageSeek();
      return;
    }
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
  const handleGalleryMomentumScrollBegin = () => {
    clearDragSettleTimer();
    scrollGlidingRef.current = true;
  };
  const handleGalleryMomentumScrollEnd = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    clearDragSettleTimer();
    scrollGlidingRef.current = false;
    if (scrollFlingLandingRef.current) setScrollFlingLanding(null);
    publishLogicalScrollAccessibility();
    onMomentumScrollEnd(event);
  };
  const handleScrollEndDrag = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    publishLogicalScrollAccessibility();
    if (pagedMode) {
      // A swipe let go exactly on a frame does not decelerate (no momentum
      // end follows): the reader is at rest now.
      const velocity = event.nativeEvent.velocity;
      const decelerating =
        velocity == null || Math.abs(velocity.x) > 0.01 || Math.abs(velocity.y) > 0.01 ||
        (readerPageWidth > 0 && Math.abs(event.nativeEvent.contentOffset.x / readerPageWidth - Math.round(event.nativeEvent.contentOffset.x / readerPageWidth)) > 0.01);
      onPagedDragEnd?.(decelerating);
    }
    if (!pagedMode && scrollPullHeader != null) {
      // Pull prepend mode: let go past the threshold fetches the chapter above.
      const released = mobileReaderStripPullReleases(pullStateRef.current) && scrollPullActiveRef.current;
      pullStateRef.current = { pull: pullStateRef.current.pull, armed: false };
      if (released) {
        if (__DEV__) {
          console.info(
            `[reader-strip] pull release pull=${Math.round(pullStateRef.current.pull)} offset=${Math.round(
              event.nativeEvent.contentOffset.y,
            )}`,
          );
        }
        onRequestRetreatPastStartRef.current?.();
      }
    }
    if (!pagedMode) {
      // iOS reports where the fling will rest (Android only the finger's
      // velocity); the reader warms that screen while the list travels.
      const flingTarget = (
        event.nativeEvent as NativeScrollEvent & {
          targetContentOffset?: { x: number; y: number };
        }
      ).targetContentOffset;
      if (
        Platform.OS === "ios" &&
        flingTarget &&
        Number.isFinite(flingTarget.y) &&
        onScrollingFlingTarget
      ) {
        const height = event.nativeEvent.layoutMeasurement.height;
        if (
          height > 0 &&
          Math.abs(flingTarget.y - event.nativeEvent.contentOffset.y) > height
        ) {
          const top = flingTarget.y - Math.max(0, chromeTopPadding);
          const layout = scrollPageLayoutRef.current;
          const restingPage = layout
            ? mobileReaderScrollCentrePageIndex(
                layout,
                flingTarget.y,
                height,
                chromeTopPaddingRef.current,
              )
            : null;
          if (restingPage != null) {
            // The resting screen and a little past it.
            setScrollFlingLanding(
              resolveMobileReaderScrollPageRange({
                pageCount: displayedPages.length,
                anchorIndex: restingPage,
                direction:
                  flingTarget.y >= event.nativeEvent.contentOffset.y
                    ? "forward"
                    : "backward",
                viewportTop: top,
                viewportHeight: height,
                layout,
                estimatedPageHeight:
                  readerImageWidth * MOBILE_READER_SCROLL_DEFAULT_PAGE_RATIO,
                aheadViewports: 0.5,
                behindViewports: 0,
                minAhead: 1,
                minBehind: 0,
              }),
            );
          }
          onScrollingFlingTarget({ top, height });
        }
      }
      clearDragSettleTimer();
      dragSettleTimerRef.current = setTimeout(() => {
        dragSettleTimerRef.current = null;
        onUserScrollSettleRef.current?.();
      }, READER_SCROLL_DRAG_SETTLE_MS);
    }
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
          ...(onAccessibilityRetry
            ? [{ name: "retryPage", label: accessibilityRetryLabel ?? strings.reader.pageImageRetry }]
            : []),
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
  // Spreads are keyed by their pages' ids, not their indexes: a chapter
  // joining in front (seamless paged reading) shifts every index, and an
  // index key would remount every cell (a black frame) for the same pages.
  const galleryKeyExtractor = useCallback(
    (item: MobileReaderGalleryItem) =>
      item.kind === "spread"
        ? `spread-${item.spread.map((index) => displayedPages[index]?.id ?? `#${index}`).join("-")}`
        : item.kind === "segment"
          ? `segment-${item.frame.segment.uri}`
          : item.page.id,
    [displayedPages],
  );
  // Seamless paged reading: a chapter joined, left or replaced its
  // placeholder around the frame on screen. The reader passes the frame's
  // new index with the new frames (same commit); when the same frame now
  // sits at another visual slot (LTR: a chapter before it; RTL: one after
  // it, frames being laid out reversed), the pager is moved there without
  // animation before the native list draws the new rows, and again once
  // the new content size lands. The curl pager re-anchors itself.
  const pagedSpliceRef = useRef<{ key: string | null; visual: number; count: number } | null>(null);
  useLayoutEffect(() => {
    if (!pagedMode || segmentedMode) {
      pagedSpliceRef.current = null;
      return;
    }
    const count = pagedDisplayCount ?? galleryItemCount;
    const index = pagedDisplayIndex ?? 0;
    const visual = mode === "rtl" ? Math.max(0, count - 1 - index) : index;
    const item = galleryItems[visual];
    const key = item ? galleryKeyExtractor(item) : null;
    const previous = pagedSpliceRef.current;
    pagedSpliceRef.current = { key, visual, count };
    // Moved: the same frame at another slot, or the frames changed count
    // with the reader's frame elsewhere (a placeholder became its chapter,
    // or left). A plain turn changes neither the count nor keeps the key.
    const moved =
      previous != null &&
      previous.visual !== visual &&
      (previous.key === key || previous.count !== count);
    if (curlActive || !moved || !key || count !== galleryItems.length || readerPageWidth <= 0) {
      return;
    }
    const offset = readerScrollOffsetForLogicalFrame(index, count, readerPageWidth, mode);
    pendingPagedRelayoutOffsetRef.current = offset;
    listRef.current?.scrollToOffset({ offset, animated: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the frames changing is the trigger.
  }, [galleryItems, pagedDisplayIndex, pagedDisplayCount]);
  // Flat spreads: a page counts as ready once its image loaded or failed (a
  // text page or a placeholder always is).
  const isDisplayedPageReady = useCallback(
    (pageIndex: number) => {
      const page = displayedPages[pageIndex];
      return !page?.imageUri || (pageImageReady?.(page) ?? true);
    },
    [displayedPages, pageImageReady],
  );
  const renderGalleryItem = useCallback<
    ListRenderItem<MobileReaderGalleryItem>
  >(
    ({ item }) => {
      if (item.kind === "spread") {
        // Book posture: faint binding shade at both inner edges (stage-local,
        // like the slots). Hidden while zoomed; none for a lone cover page.
        const visualIndexes = visualPageIndexesForMobileReaderSpread(item.spread, mode);
        // Book posture: a wide page alone reads as a printed spread, split at
        // its centre, each half against the fold edge of its pane.
        const widePage = item.spread.length === 1 ? displayedPages[item.spread[0]!] : undefined;
        if (
          spreadSlots && spreadSlots.length === 2 && widePage?.imageUri && pageFrameSize
          && isWidePage?.(item.spread[0]!)
        ) {
          const frame = pageFrameSize(widePage);
          const halves = mobileReaderSplitWideHalfRects({ slots: [spreadSlots[0]!, spreadSlots[1]!], frame });
          return (
            <View style={[styles.pagedFrame, styles.spreadFrame, { width: readerPageWidth, minHeight: windowHeight }]}>
              <MobileReaderSplitWideHalf part="left" frame={frame} rect={halves[0]}>
                {renderImage(widePage)}
              </MobileReaderSplitWideHalf>
              <MobileReaderSplitWideHalf part="right" frame={frame} rect={halves[1]}>
                {renderImage(widePage)}
              </MobileReaderSplitWideHalf>
              {foldGap ? (
                <DuoBookSpineShade
                  leftPage={halves[0]}
                  rightPage={halves[1]}
                  spine={foldGap}
                  visible={!pageZoomActive}
                />
              ) : null}
            </View>
          );
        }
        const spinePages =
          spreadSlots && spreadSlots.length === 2 && foldGap && pageNaturalSize && item.spread.length === 2
            ? mobileDuoSpreadPageRects({
                panes: [spreadSlots[0], spreadSlots[1]],
                naturalSizes: [
                  displayedPages[visualIndexes[0]] ? pageNaturalSize(displayedPages[visualIndexes[0]]) : null,
                  displayedPages[visualIndexes[1]] ? pageNaturalSize(displayedPages[visualIndexes[1]]) : null,
                ],
                align: "spine",
              })
            : null;
        // Flat spread (no fold panes): a page alone is centred on the stage
        // (the row's one slot spans it); a pair is laid out facing at once,
        // its second page fading in in place once ready.
        const flatState = !spreadSlots
          ? mobileReaderFlatSpreadState({ spread: item.spread, mode, ready: isDisplayedPageReady })
          : null;
        // "Match Page": each half of the stage takes its own page's colour.
        const halfBackgrounds = pageBackgroundFor
          ? visualIndexes.map((pageIndex) => {
              const page = displayedPages[pageIndex];
              return page ? pageBackgroundFor(page) : null;
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
            {halfBackgrounds ? (
              <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.spreadBackgrounds]}>
                <View style={[styles.spreadBackgroundHalf, { backgroundColor: halfBackgrounds[0] ?? undefined }]} />
                <View
                  style={[
                    styles.spreadBackgroundHalf,
                    { backgroundColor: halfBackgrounds[1] ?? halfBackgrounds[0] ?? undefined },
                  ]}
                />
              </View>
            ) : null}
            {visualIndexes.map(
              (pageIndex, slotIndex) => {
                const page = displayedPages[pageIndex];
                if (!page) return null;
                const slotStyle = [styles.spreadPageSlot, {
                    alignItems: mobileReaderSpreadPageAlignment(slotIndex, item.spread.length),
                  },
                  // While a page glides from its old (larger) box the slot
                  // must not clip it; the zoom clip returns once it settles.
                  pageGlide ? styles.spreadPageSlotGliding : null,
                  spreadSlots ? {
                    position: "absolute" as const, flex: 0,
                    left: spreadSlots[item.spread.length === 1 && mode === "rtl" ? 1 : slotIndex]?.x,
                    top: spreadSlots[item.spread.length === 1 && mode === "rtl" ? 1 : slotIndex]?.y,
                    width: spreadSlots[item.spread.length === 1 && mode === "rtl" ? 1 : slotIndex]?.width,
                    height: spreadSlots[item.spread.length === 1 && mode === "rtl" ? 1 : slotIndex]?.height,
                  } : undefined];
                const pageContent = page.imageUri ? (
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
                );
                // One slot type in every posture: flat ⇄ book keeps the slots
                // mounted, gliding.
                const slot: 0 | 1 = slotIndex === 0 ? 0 : 1;
                return (
                  <MobileReaderFlatSpreadSlot
                    key={page.id}
                    pending={flatState?.pendingSlot === slot}
                    // The halves slide apart into (or back from) the fold panes.
                    layout={pageGlide ? mobileReaderSlotLayoutTransition : undefined}
                    style={slotStyle}
                  >
                    {pageContent}
                  </MobileReaderFlatSpreadSlot>
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
            <MobileReaderScrollCellContext.Provider value={segmentCellRef(item.frame.index)}>
              {renderImageSegment?.(item.frame)}
            </MobileReaderScrollCellContext.Provider>
          </View>
        );
      }

      const { page, index } = item;
      if (!pagedMode) {
        return (
          <MobileReaderScrollPageCell
            page={page}
            index={index}
            renderRangeStore={renderRangeStore}
            gapBefore={
              scrollPageLayout?.gaps[index] ??
              scrollPageGaps?.[index] ??
              (index === 0 ? 0 : MOBILE_READER_SCROLL_PAGE_SPACING)
            }
            height={scrollPageLayout?.heights[index]}
            renderKey={scrollPageRenderKeys?.get(page.id)}
            renderEpoch={scrollPageRenderEpoch}
            renderImage={renderImage}
            renderScrollRow={renderScrollRow}
            onScrollingPageLayout={onScrollingPageLayout}
            fallbackPage={sourcePageForDisplayIndex(index)}
            strings={strings}
          />
        );
      }
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
            pagedMode && pageBackgroundFor ? { backgroundColor: pageBackgroundFor(page) } : null,
            pagedMode
              ? fitClip
                ? { width: readerPageWidth, height: windowHeight, overflow: "hidden" as const }
                : {
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
      pageBackgroundFor,
      spreadSlots,
      pageGlide,
      foldGap,
      isWidePage,
      pageFrameSize,
      pageNaturalSize,
      isDisplayedPageReady,
      pageZoomActive,
      fitClip,
      mode,
      onScrollingPageLayout,
      pagedMode,
      readerImageWidth,
      readerPageWidth,
      renderImage,
      renderImageSegment,
      renderScrollRow,
      scrollPageGaps,
      scrollPageLayout,
      scrollPageRenderEpoch,
      scrollPageRenderKeys,
      renderRangeStore,
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
    if (scrollPageLayout) {
      return (
        _data: ArrayLike<MobileReaderGalleryItem> | null | undefined,
        index: number,
      ) => mobileReaderScrollItemLayout(scrollPageLayout, index, chromeTopPadding);
    }
    return undefined;
  }, [
    chromeTopPadding,
    pagedMode,
    readerPageWidth,
    scrollPageLayout,
    segmentedImageFrames,
    segmentedMode,
  ]);
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
      pagedMode || segmentedMode
        ? null
        : { paddingHorizontal: scrollSideMargin },
    ],
    [bottomPadding, chromeTopPadding, pagedMode, scrollSideMargin, segmentedMode],
  );

  const galleryInitialScrollIndex =
    pagedMode && !segmentedMode && galleryItemCount > 0 && readerPageWidth > 0
      ? Math.max(0, Math.min(galleryItemCount - 1, Math.round(initialContentOffset.x / readerPageWidth)))
      : undefined;
  // Scroll mode with a page layout opens at its exact offset (the restore
  // page right below the chrome) and renders its first window there, not
  // at page 1. Fixed per list: a later `contentOffset` would re-scroll it.
  const scrollInitialPlacement = useMemo(
    () => {
      if (!scrollPageLayout || !(initialContentOffset.y > 0)) return null;
      const anchor = mobileReaderScrollAnchorForOffset(
        scrollPageLayout,
        initialContentOffset.y,
      );
      return anchor
        ? { index: anchor.pageIndex, offset: { x: 0, y: initialContentOffset.y } }
        : null;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read once per mounted list.
    [scrollMountKey, scrollPageLayout != null],
  );
  // Stage size change of a page strip: the new heights and the offset that
  // keeps the page go in one native transaction. As a command the offset
  // landed before the new heights (past the old content's end: a blank frame)
  // or after them (another part of the chapter); maintainVisibleContentPosition
  // sits this commit out, it would add its own shift on top. The value stays
  // set afterwards: the prop is applied whenever it changes.
  const listContentOffsetRef = useRef({ mountKey: scrollMountKey, offset: scrollInitialPlacement?.offset });
  if (listContentOffsetRef.current.mountKey !== scrollMountKey) {
    listContentOffsetRef.current = { mountKey: scrollMountKey, offset: scrollInitialPlacement?.offset };
  }
  const stripRelayoutSeek =
    scrollPageLayout &&
    mobileReaderGalleryRelayout(listGeometryRef.current, {
      mountKey: scrollMountKey,
      paged: pagedMode,
      extent: readerImageWidth,
      viewport: windowHeight,
    }) === "reoffset"
      ? stripRelayoutAnchor(scrollPageLayout)
      : null;
  if (stripRelayoutSeek && scrollPageLayout) {
    listContentOffsetRef.current = {
      mountKey: scrollMountKey,
      offset: {
        x: 0,
        y: mobileReaderScrollOffsetForAnchor(scrollPageLayout, stripRelayoutSeek.pageIndex, stripRelayoutSeek.fraction),
      },
    };
  }
  const curlFrames = useMemo(
    () => (isTwoPageMode ? pagedSpreads : pagedSinglePages.map(({ index }) => [index])),
    [isTwoPageMode, pagedSinglePages, pagedSpreads],
  );
  const handleCurlSettle = useCallback(
    (frame: number) => {
      // The reader reads a settled curl like the slide pager's momentum end.
      const width = Math.max(1, readerPageWidth);
      handleGalleryMomentumScrollEnd({
        nativeEvent: {
          contentOffset: { x: frame * width, y: 0 },
          contentSize: { width: width * Math.max(1, galleryItemCount), height: windowHeight },
          layoutMeasurement: { width, height: windowHeight },
        },
      } as NativeSyntheticEvent<NativeScrollEvent>);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reads the latest handlers like the list's own callbacks.
    [galleryItemCount, readerPageWidth, windowHeight, onMomentumScrollEnd],
  );
  const handleCurlEdgeIntent = useCallback((intent: "next" | "previous") => {
    if (pagesState.status !== "ready" || pages.length === 0) return;
    if (intent === "next") onRequestAdvancePastEndRef.current?.();
    else onRequestRetreatPastStartRef.current?.();
  }, [pages.length, pagesState.status]);
  const renderCurlTextPage = useCallback(
    (page: MobileReaderPage, pageIndex: number) => (
      <TextPage
        text={page.text}
        fallbackPage={sourcePageForDisplayIndex(pageIndex)}
        strings={strings}
      />
    ),
    [sourcePageForDisplayIndex, strings],
  );
  const curlStage = useMemo(() => ({ width: readerPageWidth, height: windowHeight }), [readerPageWidth, windowHeight]);
  const isWidePageOrNever = useCallback((pageIndex: number) => isWidePage?.(pageIndex) ?? false, [isWidePage]);
  const curlPager = curlActive ? (
    <LayoutAnimationConfig skipExiting>
    <Animated.View
      key={scrollMountKey}
      entering={mobileReaderStageCrossFadeEntering}
      exiting={mobileReaderStageCrossFadeExiting}
      style={styles.readerScroll}
    >
      <MobileReaderCurlPager
        anchorFrame={
          pagedDisplayIndex == null
            ? undefined
            : mode === "rtl"
              ? Math.max(0, curlFrames.length - 1 - pagedDisplayIndex)
              : pagedDisplayIndex
        }
        backgroundColor={backgroundColor}
        displayedPages={displayedPages}
        fitClip={fitClip}
        foldGap={foldGap}
        frames={curlFrames}
        initialFrame={galleryInitialScrollIndex ?? 0}
        isWide={isWidePageOrNever}
        isPageReady={isDisplayedPageReady}
        mode={mode}
        onEdgeIntent={handleCurlEdgeIntent}
        onSettleFrame={handleCurlSettle}
        onTurningChange={onPageTurningChange}
        overlaysOnPages={pageOverlaysMounted}
        pageGlide={pageGlide}
        pagerRef={curlPagerRef}
        renderImage={renderImage}
        pageFrameSize={pageFrameSize}
        renderTextPage={renderCurlTextPage}
        pageBackgroundFor={pageBackgroundFor}
        spreadMode={isTwoPageMode}
        spreadSlots={spreadSlots}
        stage={curlStage}
        transition={pageTurnTransition ?? "curl"}
        turningEnabled={!pageZoomActive}
      />
    </Animated.View>
    </LayoutAnimationConfig>
  ) : null;
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
    <MobileReaderScrollViewportContext.Provider value={pagedMode ? null : scrollViewportStore}>
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
      // A status-bar tap returns a long strip to its first page; the paged
      // (horizontal) list has no top to return to and must not claim it.
      scrollsToTop={!pagedMode}
      initialNumToRender={segmentedMode ? 2 : pagedMode ? 3 : 5}
      maxToRenderPerBatch={segmentedMode ? 2 : 5}
      // Scroll mode keeps six screens of cells either side so the pages kept
      // mounted (up to six screens ahead) are always inside the list's own
      // window; cells outside it are cheap sized placeholders.
      windowSize={segmentedMode ? 3 : pagedMode ? 7 : 13}
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
      initialScrollIndex={galleryInitialScrollIndex ?? scrollInitialPlacement?.index}
      contentOffset={listContentOffsetRef.current.offset}
      // Scroll mode: pages above that decode (or re-measure) keep the page
      // being read where it is.
      maintainVisibleContentPosition={
        scrollPageLayout && !stripRelayoutSeek ? READER_SCROLL_MAINTAIN_VISIBLE_POSITION : undefined
      }
      onMomentumScrollBegin={pagedMode ? undefined : handleGalleryMomentumScrollBegin}
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
      // Pull prepend mode: a 0pt header (no layout) whose content hangs
      // above the first row, in the bounce area.
      ListHeaderComponent={
        !pagedMode && scrollPullHeader != null ? (
          <View pointerEvents="none" style={styles.pullHeaderCell}>
            <Animated.View style={[styles.pullHeaderContent, pullHeaderAnimatedStyle]}>
              {scrollPullHeader}
            </Animated.View>
          </View>
        ) : undefined
      }
      style={styles.readerScroll}
    />
    </MobileReaderScrollViewportContext.Provider>
    </Animated.View>
    </LayoutAnimationConfig>
  );

  const stage = (
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
              if (action === "retryPage") {
                onAccessibilityRetry?.();
                return;
              }
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
      // Loading keeps the stage tappable: every band toggles the chrome.
      pointerEvents="auto"
      style={[styles.stageContainer, styles.stage, { backgroundColor }]}
      onTouchStart={readerStageTapEnabled ? handleStageTouchStart : undefined}
      onTouchEnd={readerStageTapEnabled ? handleStageTouchEnd : undefined}
      onTouchCancel={() => {
        touchStartRef.current = null;
        multiTouchRef.current = false;
      }}
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
              ]}
            >
              {/* The first page's shape on the reader background, with the
                  pages' own spinner (the skeleton already waited 150ms). */}
              <MobileReaderPageSpinner color={mobileReaderPageStatusColor(backgroundColor)} delayMs={0} />
            </Animated.View>
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
          curlPager ?? galleryList
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
              color={readerStateColors.secondaryText}
            />
            <Text
              accessibilityRole="header"
              numberOfLines={2}
              style={[styles.readerTitle, { color: readerStateColors.primaryText }]}
            >
              {pagesState.title ?? formatChapterTitle(chapter, strings)}
            </Text>
            {title ? (
              <Text
                numberOfLines={2}
                style={[styles.readerSubtitle, { color: readerStateColors.secondaryText }]}
              >
                {title}
              </Text>
            ) : null}
            <Text style={[styles.readerText, { color: readerStateColors.secondaryText }]}>
              {pagesState.detail}
            </Text>
            {pagesState.status === "blocked" ? (
              <Text style={[styles.readerText, { color: readerStateColors.secondaryText }]}>
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
              <Text style={[styles.progressPillText, { color: readerStateColors.secondaryText }]}>
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
  return stageGesture ? <GestureDetector gesture={stageGesture}>{stage}</GestureDetector> : stage;
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
  pullHeaderCell: {
    height: 0,
    overflow: "visible",
  },
  pullHeaderContent: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
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
  },
  readerLoadingStrip: {},
  readerScroll: {
    flex: 1,
    alignSelf: "stretch",
  },
  pagedContent: {
    alignItems: "center",
  },
  scrollingContent: {
    alignItems: "center",
    // Page spacing is per page (`scrollPageGaps`, a margin above each cell):
    // a flat 10pt gap here was the black bar between webtoon strips.
    gap: 0,
    paddingHorizontal: MOBILE_READER_SCROLL_SIDE_MARGIN,
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
  spreadBackgrounds: {
    flexDirection: "row",
  },
  spreadBackgroundHalf: {
    flex: 1,
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
