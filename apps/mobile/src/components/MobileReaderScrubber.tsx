import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { MobileSliderTrack } from "@/components/MobileSliderTrack";
import type { ReadingMode } from "@/data/schema";
import { hapticPress } from "@/lib/haptics";
import type { MobileStrings } from "@/lib/mobileI18n";
import {
  clampReaderPageIndex,
  readerDisplayIndexForVisualProgressRatio,
  formatReaderPageValue,
  readerProgressRatio,
  readerRoutePageForDisplayIndex,
  shouldRunReaderMenuPageSwitchHaptic,
} from "@/lib/mobileReaderProgress";

type MobileReaderScrubberProps = {
  pageIndex: number;
  pageCount: number;
  mode: ReadingMode;
  strings: MobileStrings;
  onChange: (index: number) => void;
};

export function MobileReaderScrubber({
  pageIndex,
  pageCount,
  mode,
  strings,
  onChange,
}: MobileReaderScrubberProps) {
  const clampedPageIndex = clampReaderPageIndex(pageIndex, pageCount);
  const progress = readerProgressRatio(clampedPageIndex, pageCount);
  const [dragProgress, setDragProgress] = useState<number | null>(null);
  const trackProgress =
    dragProgress == null
      ? progress
      : mode === "rtl"
        ? 1 - dragProgress
        : dragProgress;
  const disabled = pageCount <= 1;
  const pageNumber = readerRoutePageForDisplayIndex(
    clampedPageIndex,
    pageCount,
    mode,
  );
  const totalPages = Math.max(1, pageCount);
  const lastMenuPageHapticRef = useRef(clampedPageIndex);

  useEffect(() => {
    lastMenuPageHapticRef.current = clampedPageIndex;
  }, [clampedPageIndex]);

  const runMenuPageSwitchHaptic = useCallback(
    (nextPageIndex: number) => {
      if (
        !shouldRunReaderMenuPageSwitchHaptic(
          lastMenuPageHapticRef.current,
          nextPageIndex,
          pageCount,
        )
      ) {
        return;
      }

      lastMenuPageHapticRef.current = clampReaderPageIndex(
        nextPageIndex,
        pageCount,
      );
      void hapticPress();
    },
    [pageCount],
  );

  const selectPageIndex = useCallback(
    (nextPageIndex: number) => {
      const clampedNextPageIndex = clampReaderPageIndex(nextPageIndex, pageCount);
      runMenuPageSwitchHaptic(clampedNextPageIndex);
      onChange(clampedNextPageIndex);
    },
    [onChange, pageCount, runMenuPageSwitchHaptic],
  );

  const onRatioPreview = useCallback((ratio: number) => {
    setDragProgress(ratio);
  }, [setDragProgress]);

  const onRatioCommit = useCallback(
    (ratio: number) => {
      setDragProgress(null);
      selectPageIndex(
        readerDisplayIndexForVisualProgressRatio(ratio, pageCount, mode),
      );
    },
    [mode, pageCount, selectPageIndex, setDragProgress],
  );

  const stepSourcePage = useCallback(
    (delta: 1 | -1) => {
      const nextDisplayIndex =
        mode === "rtl" ? clampedPageIndex - delta : clampedPageIndex + delta;
      selectPageIndex(nextDisplayIndex);
    },
    [clampedPageIndex, mode, selectPageIndex],
  );

  return (
    <View
      accessibilityRole="adjustable"
      accessibilityState={{ disabled }}
      accessibilityValue={{
        min: 1,
        max: totalPages,
        now: pageNumber,
        text: formatReaderPageValue(clampedPageIndex, pageCount, mode, strings),
      }}
      accessibilityActions={[
        { name: "decrement", label: strings.reader.previousPage },
        { name: "increment", label: strings.reader.nextPage },
      ]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === "increment") {
          stepSourcePage(1);
        } else if (event.nativeEvent.actionName === "decrement") {
          stepSourcePage(-1);
        }
      }}
      style={styles.root}
    >
      <MobileSliderTrack
        progress={trackProgress}
        direction={mode === "rtl" ? "rtl" : "ltr"}
        disabled={disabled}
        onRatioChange={onRatioPreview}
        onRatioCommit={onRatioCommit}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    minHeight: 28,
    justifyContent: "center",
  },
});
