import { useCallback } from "react";
import { StyleSheet, View } from "react-native";
import { MobileSliderTrack } from "@/components/MobileSliderTrack";
import { formatMobileString, type MobileStrings } from "@/lib/mobileI18n";
import { useSliderSelectionHaptic } from "@/lib/useSliderSelectionHaptic";
import {
  clampReaderScrollWidthPct,
  READER_SCROLL_WIDTH_MAX,
  READER_SCROLL_WIDTH_MIN,
} from "@/lib/mobileReaderSettings";

type MobileReaderWidthSliderProps = {
  value: number;
  strings: MobileStrings;
  disabled?: boolean;
  onPreview: (value: number) => void;
  onCommit: (value: number) => void;
};

export function MobileReaderWidthSlider({
  value,
  strings,
  disabled = false,
  onPreview,
  onCommit,
}: MobileReaderWidthSliderProps) {
  const clampedValue = clampReaderScrollWidthPct(value);
  const progress =
    (clampedValue - READER_SCROLL_WIDTH_MIN) /
    (READER_SCROLL_WIDTH_MAX - READER_SCROLL_WIDTH_MIN);
  const triggerSelectionHaptic = useSliderSelectionHaptic(clampedValue);

  const valueFromRatio = useCallback(
    (ratio: number) =>
      clampReaderScrollWidthPct(
        READER_SCROLL_WIDTH_MIN +
          ratio * (READER_SCROLL_WIDTH_MAX - READER_SCROLL_WIDTH_MIN),
      ),
    [],
  );

  const onRatioChange = useCallback(
    (ratio: number) => {
      const nextValue = valueFromRatio(ratio);
      onPreview(nextValue);
      triggerSelectionHaptic(nextValue);
    },
    [onPreview, triggerSelectionHaptic, valueFromRatio],
  );

  const onRatioCommit = useCallback(
    (ratio: number) => {
      const nextValue = valueFromRatio(ratio);
      onPreview(nextValue);
      onCommit(nextValue);
      triggerSelectionHaptic(nextValue);
    },
    [onCommit, onPreview, triggerSelectionHaptic, valueFromRatio],
  );

  const adjustValue = useCallback(
    (delta: number) => {
      if (disabled) return;
      const nextValue = clampReaderScrollWidthPct(clampedValue + delta);
      onPreview(nextValue);
      onCommit(nextValue);
      triggerSelectionHaptic(nextValue);
    },
    [clampedValue, disabled, onCommit, onPreview, triggerSelectionHaptic],
  );

  return (
    <View
      accessibilityRole="adjustable"
      accessibilityState={{ disabled }}
      accessibilityValue={{
        min: READER_SCROLL_WIDTH_MIN,
        max: READER_SCROLL_WIDTH_MAX,
        now: clampedValue,
        text: formatMobileString(strings.reader.pageWidthValue, {
          percent: clampedValue,
        }),
      }}
      accessibilityActions={[
        { name: "decrement", label: strings.reader.narrowPageWidth },
        { name: "increment", label: strings.reader.widenPageWidth },
      ]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === "increment") {
          adjustValue(5);
        } else if (event.nativeEvent.actionName === "decrement") {
          adjustValue(-5);
        }
      }}
      style={[styles.root, { opacity: disabled ? 0.56 : 1 }]}
    >
      <MobileSliderTrack
        progress={progress}
        disabled={disabled}
        onRatioChange={onRatioChange}
        onRatioCommit={onRatioCommit}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    minHeight: 26,
    justifyContent: "center",
  },
});
