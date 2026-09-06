import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { StyleSheet, View } from "react-native";
import { MobileSliderTrack } from "@/components/MobileSliderTrack";
import type { MobileReaderScrubberPreviewHandle } from "@/components/reader/MobileReaderScrubberPreview";
import type { ReadingMode } from "@/data/schema";
import { hapticPress, hapticSelection } from "@/lib/haptics";
import { formatMobileString, type MobileStrings } from "@/lib/mobileI18n";
import {
  clampReaderPageIndex,
  readerDisplayIndexForVisualProgressRatio,
  formatReaderPageValue,
  formatReaderSpreadValue,
  readerProgressRatio,
  readerRoutePageForDisplayIndex,
  readerScrubberDirection,
  readerScrubberInteractionScopeKey,
  readerSourceStepTargetForDisplayIndex,
  shouldRunReaderMenuPageSwitchHaptic,
} from "@/lib/mobileReaderProgress";
import { READER_CHROME_PANEL_CONTENT_MIN_HEIGHT } from "@/lib/mobileReaderHeader";
import type { MobileSliderTrackWindowFrame } from "@/lib/mobileSliderTrack";

export type MobileReaderScrubberProps = {
  pageIndex: number;
  pageCount: number;
  mode: ReadingMode;
  strings: MobileStrings;
  onChange: (index: number) => void;
  /** Optional native frame/spread position used by two-page mode. */
  scrubIndex?: number;
  scrubCount?: number;
  onScrubChange?: (index: number) => void;
  onStep?: (direction: "previous" | "next") => void;
  continuousScroll?: boolean;
  scrollProgress?: number;
  scrollable?: boolean;
  onScrollScrubStart?: () => number | void;
  onScrollProgressChange?: (progress: number) => void;
  onScrollScrubEnd?: () => void;
  onScrollScrubCancel?: () => void;
  onContinuousAccessibilityStep?: (
    direction: "previous" | "next",
  ) => void;
  spreadScrubbing?: boolean;
  /** Changes whenever the mounted chapter/presentation can invalidate a drag. */
  interactionScopeKey?: string;
  /** Maps a native spread position to the first logical page it previews. */
  getPreviewPageIndex?: (scrubIndex: number) => number;
  /** Publishes the temporary page shown while the thumb is moving. */
  onPreviewPageIndexChange?: (pageIndex: number | null) => void;
  /**
   * Overlay that draws the preview bubble. It lives outside the reader's
   * clipped glass toolbar, so the thumb geometry is handed to it imperatively
   * — a drag then repaints the bubble without re-rendering the reader.
   */
  previewRef?: RefObject<MobileReaderScrubberPreviewHandle | null>;
};

export function MobileReaderScrubber({
  pageIndex,
  pageCount,
  mode,
  strings,
  onChange,
  scrubIndex = pageIndex,
  scrubCount = pageCount,
  onScrubChange = onChange,
  onStep,
  continuousScroll = false,
  scrollProgress = 0,
  scrollable = false,
  onScrollScrubStart,
  onScrollProgressChange,
  onScrollScrubEnd,
  onScrollScrubCancel,
  onContinuousAccessibilityStep,
  spreadScrubbing = false,
  interactionScopeKey,
  getPreviewPageIndex,
  onPreviewPageIndexChange,
  previewRef,
}: MobileReaderScrubberProps) {
  const clampedPageIndex = clampReaderPageIndex(pageIndex, pageCount);
  const clampedScrubIndex = clampReaderPageIndex(scrubIndex, scrubCount);
  const discreteProgress = readerProgressRatio(clampedScrubIndex, scrubCount);
  const normalizedScrollProgress = Number.isFinite(scrollProgress)
    ? Math.max(0, Math.min(1, scrollProgress))
    : 0;
  const progress = continuousScroll
    ? normalizedScrollProgress
    : discreteProgress;
  const disabled = continuousScroll ? !scrollable : scrubCount <= 1;
  const scrubInteractionScope = readerScrubberInteractionScopeKey({
    continuousScroll,
    contentIdentity: interactionScopeKey,
    disabled,
    mode,
    scrubCount,
  });
  const scrubInteractionToken = useMemo(
    () => ({ scope: scrubInteractionScope }),
    [scrubInteractionScope],
  );
  const [dragProgressState, setDragProgressState] = useState<{
    token: { scope: string };
    value: number;
  } | null>(null);
  const dragStartProgressRef = useRef<number | null>(null);
  const pendingScrollProgressRef = useRef<number | null>(null);
  const continuousScrollScopeRef = useRef(continuousScroll);
  const onScrollScrubCancelRef = useRef(onScrollScrubCancel);
  const dragProgress =
    dragProgressState?.token === scrubInteractionToken
      ? dragProgressState.value
      : null;
  const trackProgress = dragProgress ?? progress;
  const scrubberDirection = readerScrubberDirection({
    continuousScroll,
    mode,
  });
  const pageNumber = readerRoutePageForDisplayIndex(
    clampedPageIndex,
    pageCount,
    mode,
  );
  const totalPages = Math.max(1, pageCount);
  const scrollPercent = Math.round(normalizedScrollProgress * 100);
  const accessibilityValue = continuousScroll
    ? {
        min: 0,
        max: 100,
        now: scrollPercent,
        text: formatMobileString(strings.reader.scrollProgress, {
          percent: scrollPercent,
        }),
      }
    : spreadScrubbing
      ? {
          min: 1,
          max: Math.max(1, scrubCount),
          now: clampedScrubIndex + 1,
          text: formatReaderSpreadValue(
            clampedScrubIndex,
            scrubCount,
            strings,
          ),
        }
      : {
        min: 1,
        max: totalPages,
        now: pageNumber,
        text: formatReaderPageValue(
          clampedPageIndex,
          pageCount,
          mode,
          strings,
        ),
        };
  const previousActionLabel = spreadScrubbing
    ? strings.reader.previousSpread
    : strings.reader.previousPage;
  const nextActionLabel = spreadScrubbing
    ? strings.reader.nextSpread
    : strings.reader.nextPage;
  const lastMenuPageHapticRef = useRef(clampedScrubIndex);
  const lastPreviewPageHapticRef = useRef<number | null>(null);
  const pendingPreviewRatioRef = useRef<number | null>(null);
  const previewFrameRef = useRef<number | null>(null);
  const trackWindowFrameRef = useRef<MobileSliderTrackWindowFrame | null>(null);
  const onTrackWindowFrame = useCallback(
    (frame: MobileSliderTrackWindowFrame) => {
      trackWindowFrameRef.current = frame;
    },
    [],
  );

  useEffect(() => {
    lastMenuPageHapticRef.current = clampedScrubIndex;
  }, [clampedScrubIndex]);

  useLayoutEffect(() => {
    onScrollScrubCancelRef.current = onScrollScrubCancel;
  }, [onScrollScrubCancel]);

  useLayoutEffect(() => {
    const oldContinuousDragWasActive =
      continuousScrollScopeRef.current && dragStartProgressRef.current != null;
    continuousScrollScopeRef.current = continuousScroll;
    dragStartProgressRef.current = null;
    pendingScrollProgressRef.current = null;
    if (oldContinuousDragWasActive) {
      onScrollScrubCancelRef.current?.();
    }
  }, [continuousScroll, scrubInteractionScope]);

  useEffect(
    () => () => {
      if (
        continuousScrollScopeRef.current &&
        dragStartProgressRef.current != null
      ) {
        onScrollScrubCancelRef.current?.();
      }
    },
    [],
  );

  useEffect(() => {
    const pendingProgress = pendingScrollProgressRef.current;
    if (
      !continuousScroll ||
      dragStartProgressRef.current != null ||
      pendingProgress == null ||
      Math.abs(normalizedScrollProgress - pendingProgress) > 0.002
    ) {
      return;
    }
    const timeout = setTimeout(() => {
      pendingScrollProgressRef.current = null;
      setDragProgressState(null);
    }, 0);
    return () => clearTimeout(timeout);
  }, [continuousScroll, normalizedScrollProgress]);

  const runMenuPageSwitchHaptic = useCallback(
    (nextPageIndex: number) => {
      if (
        !shouldRunReaderMenuPageSwitchHaptic(
          lastMenuPageHapticRef.current,
          nextPageIndex,
          scrubCount,
        )
      ) {
        return;
      }

      lastMenuPageHapticRef.current = clampReaderPageIndex(
        nextPageIndex,
        scrubCount,
      );
      void hapticPress();
    },
    [scrubCount],
  );

  const selectScrubIndex = useCallback(
    (nextScrubIndex: number) => {
      const clampedNextScrubIndex = clampReaderPageIndex(
        nextScrubIndex,
        scrubCount,
      );
      runMenuPageSwitchHaptic(clampedNextScrubIndex);
      onScrubChange(clampedNextScrubIndex);
    },
    [onScrubChange, runMenuPageSwitchHaptic, scrubCount],
  );

  const logicalProgressForVisualRatio = useCallback(
    (ratio: number) =>
      scrubberDirection === "rtl"
        ? 1 - Math.max(0, Math.min(1, ratio))
        : Math.max(0, Math.min(1, ratio)),
    [scrubberDirection],
  );

  const publishPreviewForRatioNow = useCallback(
    (ratio: number) => {
      const logicalProgress = logicalProgressForVisualRatio(ratio);
      const nextScrubIndex = continuousScroll
        ? clampReaderPageIndex(
            Math.round(logicalProgress * Math.max(0, pageCount - 1)),
            pageCount,
          )
        : readerDisplayIndexForVisualProgressRatio(ratio, scrubCount, mode);
      const nextPageIndex = clampReaderPageIndex(
        getPreviewPageIndex?.(nextScrubIndex) ?? nextScrubIndex,
        pageCount,
      );
      if (
        lastPreviewPageHapticRef.current != null &&
        lastPreviewPageHapticRef.current !== nextPageIndex
      ) {
        void hapticSelection();
      }
      lastPreviewPageHapticRef.current = nextPageIndex;
      onPreviewPageIndexChange?.(nextPageIndex);
      const track = trackWindowFrameRef.current;
      if (track) {
        // `ratio` is already the thumb's visual position, so RTL needs no
        // mirroring here — the track and the bubble read the same number.
        previewRef?.current?.setGeometry({
          ratio: Math.max(0, Math.min(1, ratio)),
          track,
        });
      }
    },
    [
      continuousScroll,
      getPreviewPageIndex,
      logicalProgressForVisualRatio,
      mode,
      onPreviewPageIndexChange,
      pageCount,
      previewRef,
      scrubCount,
    ],
  );
  const publishPreviewForRatioNowRef = useRef(publishPreviewForRatioNow);
  useEffect(() => {
    publishPreviewForRatioNowRef.current = publishPreviewForRatioNow;
  }, [publishPreviewForRatioNow]);

  const cancelPendingPreviewFrame = useCallback(() => {
    if (previewFrameRef.current != null) {
      cancelAnimationFrame(previewFrameRef.current);
      previewFrameRef.current = null;
    }
    pendingPreviewRatioRef.current = null;
  }, []);

  // A pan emits far more moves than the display has frames, and each publish
  // lifted a page index all the way to the reader screen. Coalescing to one
  // publish per frame keeps the newest ratio and drops the rest.
  const publishPreviewForRatio = useCallback((ratio: number) => {
    pendingPreviewRatioRef.current = ratio;
    if (previewFrameRef.current != null) return;
    previewFrameRef.current = requestAnimationFrame(() => {
      previewFrameRef.current = null;
      const pendingRatio = pendingPreviewRatioRef.current;
      pendingPreviewRatioRef.current = null;
      if (pendingRatio == null) return;
      publishPreviewForRatioNowRef.current(pendingRatio);
    });
  }, []);

  useEffect(() => cancelPendingPreviewFrame, [cancelPendingPreviewFrame]);

  const clearPreview = useCallback(() => {
    cancelPendingPreviewFrame();
    lastPreviewPageHapticRef.current = null;
    onPreviewPageIndexChange?.(null);
    previewRef?.current?.setGeometry(null);
  }, [cancelPendingPreviewFrame, onPreviewPageIndexChange, previewRef]);
  const clearPreviewRef = useRef(clearPreview);
  useEffect(() => {
    clearPreviewRef.current = clearPreview;
  }, [clearPreview]);
  // A chapter switch can unmount the scrubber mid-drag; the bubble lives in a
  // sibling overlay, so it has to be told to go away.
  useEffect(() => () => clearPreviewRef.current(), []);

  const onRatioStart = useCallback(
    (ratio: number) => {
      pendingScrollProgressRef.current = null;
      const currentScrollProgress = continuousScroll
        ? onScrollScrubStart?.()
        : undefined;
      dragStartProgressRef.current =
        typeof currentScrollProgress === "number" &&
        Number.isFinite(currentScrollProgress)
          ? Math.max(0, Math.min(1, currentScrollProgress))
          : progress;
      setDragProgressState({
        token: scrubInteractionToken,
        value: logicalProgressForVisualRatio(ratio),
      });
      publishPreviewForRatio(ratio);
    }, [
      continuousScroll,
      logicalProgressForVisualRatio,
      onScrollScrubStart,
      progress,
      publishPreviewForRatio,
      scrubInteractionToken,
      setDragProgressState,
    ],
  );

  const onRatioPreview = useCallback(
    (ratio: number) => {
      const nextProgress = logicalProgressForVisualRatio(ratio);
      setDragProgressState({
        token: scrubInteractionToken,
        value: nextProgress,
      });
      if (continuousScroll) onScrollProgressChange?.(nextProgress);
      publishPreviewForRatio(ratio);
    }, [
      continuousScroll,
      logicalProgressForVisualRatio,
      onScrollProgressChange,
      publishPreviewForRatio,
      scrubInteractionToken,
      setDragProgressState,
    ],
  );

  const onRatioEnd = useCallback(
    (ratio: number) => {
      const nextProgress = logicalProgressForVisualRatio(ratio);
      dragStartProgressRef.current = null;
      clearPreview();
      if (continuousScroll) {
        pendingScrollProgressRef.current = nextProgress;
        setDragProgressState({
          token: scrubInteractionToken,
          value: nextProgress,
        });
        onScrollProgressChange?.(nextProgress);
        onScrollScrubEnd?.();
        if (Math.abs(normalizedScrollProgress - nextProgress) <= 0.002) {
          pendingScrollProgressRef.current = null;
          setDragProgressState(null);
        }
        return;
      }
      setDragProgressState(null);
      selectScrubIndex(
        readerDisplayIndexForVisualProgressRatio(ratio, scrubCount, mode),
      );
    },
    [
      continuousScroll,
      clearPreview,
      logicalProgressForVisualRatio,
      mode,
      onScrollProgressChange,
      onScrollScrubEnd,
      normalizedScrollProgress,
      scrubInteractionToken,
      scrubCount,
      selectScrubIndex,
      setDragProgressState,
    ],
  );

  const onRatioCancel = useCallback(() => {
    const startProgress = dragStartProgressRef.current;
    dragStartProgressRef.current = null;
    if (continuousScroll && startProgress != null) {
      pendingScrollProgressRef.current = startProgress;
      setDragProgressState({
        token: scrubInteractionToken,
        value: startProgress,
      });
      onScrollProgressChange?.(startProgress);
      if (Math.abs(normalizedScrollProgress - startProgress) <= 0.002) {
        pendingScrollProgressRef.current = null;
        setDragProgressState(null);
      }
    } else {
      setDragProgressState(null);
    }
    if (continuousScroll) onScrollScrubCancel?.();
    clearPreview();
  }, [
    clearPreview,
    continuousScroll,
    normalizedScrollProgress,
    onScrollProgressChange,
    onScrollScrubCancel,
    scrubInteractionToken,
    setDragProgressState,
  ]);

  const stepSourcePage = useCallback(
    (direction: "previous" | "next") => {
      if (disabled) return;
      if (continuousScroll) {
        onContinuousAccessibilityStep?.(direction);
        return;
      }
      if (onStep) {
        onStep(direction);
        return;
      }
      const nextDisplayIndex = readerSourceStepTargetForDisplayIndex(
        clampedPageIndex,
        pageCount,
        mode,
        direction,
      );
      if (nextDisplayIndex != null) {
        runMenuPageSwitchHaptic(nextDisplayIndex);
        onChange(nextDisplayIndex);
      }
    },
    [
      clampedPageIndex,
      continuousScroll,
      disabled,
      mode,
      onChange,
      onContinuousAccessibilityStep,
      onStep,
      pageCount,
      runMenuPageSwitchHaptic,
    ],
  );

  return (
    <View
      accessibilityRole="adjustable"
      accessibilityState={{ disabled }}
      accessibilityValue={accessibilityValue}
      accessibilityActions={[
        { name: "decrement", label: previousActionLabel },
        { name: "increment", label: nextActionLabel },
      ]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === "increment") {
          stepSourcePage("next");
        } else if (event.nativeEvent.actionName === "decrement") {
          stepSourcePage("previous");
        }
      }}
      style={styles.root}
    >
      <MobileSliderTrack
        progress={trackProgress}
        direction={scrubberDirection}
        disabled={disabled}
        onRatioStart={onRatioStart}
        onRatioChange={onRatioPreview}
        onRatioEnd={onRatioEnd}
        onRatioCancel={onRatioCancel}
        onTrackWindowFrame={onTrackWindowFrame}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    // Matches the shared reader chrome content box so the bottom toolbar
    // panel resolves to exactly the same height as the top info panel.
    minHeight: READER_CHROME_PANEL_CONTENT_MIN_HEIGHT,
    justifyContent: "center",
    position: "relative",
  },
});
