import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Platform, StyleSheet, View } from "react-native";
import { MobileSliderTrack } from "@/components/MobileSliderTrack";
import type { ReadingMode } from "@/data/schema";
import { hapticPress } from "@/lib/haptics";
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
    }, [
      continuousScroll,
      logicalProgressForVisualRatio,
      onScrollScrubStart,
      progress,
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
    }, [
      continuousScroll,
      logicalProgressForVisualRatio,
      onScrollProgressChange,
      scrubInteractionToken,
      setDragProgressState,
    ],
  );

  const onRatioEnd = useCallback(
    (ratio: number) => {
      const nextProgress = logicalProgressForVisualRatio(ratio);
      dragStartProgressRef.current = null;
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
  }, [
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
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    minHeight: Platform.OS === "android" ? 48 : 44,
    justifyContent: "center",
  },
});
