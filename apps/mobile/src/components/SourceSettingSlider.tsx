import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { NemuText, nemuFontWeight, radius, useNemuTheme } from "@/design-system";
import { hapticPress, hapticSelection } from "@/lib/haptics";
import { formatSourceSettingSliderValue, snapSourceSettingSliderValue } from "@/lib/mobileSourceSettings";
import type { SourceSettingSliderProps } from "./SourceSettingSlider.types";

const SLIDER_VALUE_LABEL_WIDTH = 48;

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Android and other targets: the drawn slider (iOS uses the system one). */
export function SourceSettingSlider({ setting, value, disabled, onChange }: SourceSettingSliderProps) {
  const { tokens } = useNemuTheme();
  const [trackWidth, setTrackWidth] = useState(0);
  const lastEmittedValueRef = useRef(value);
  const min = setting.min ?? 0;
  const max = setting.max ?? 100;
  const step = setting.step ?? 1;
  const range = max > min ? max - min : 1;
  const progress = clampNumber((value - min) / range, 0, 1);
  const formatted = formatSourceSettingSliderValue(setting, value);
  const sliderValueLeft = trackWidth
    ? clampNumber(
        progress * trackWidth - SLIDER_VALUE_LABEL_WIDTH / 2,
        0,
        Math.max(0, trackWidth - SLIDER_VALUE_LABEL_WIDTH),
      )
    : 0;

  useEffect(() => {
    lastEmittedValueRef.current = value;
  }, [value]);

  const updateFromLocation = (locationX: number) => {
    if (disabled) return;
    if (!trackWidth) return;
    const nextValue = snapSourceSettingSliderValue(
      min + (clampNumber(locationX, 0, trackWidth) / trackWidth) * range,
      min,
      max,
      step,
    );
    if (nextValue !== lastEmittedValueRef.current) {
      lastEmittedValueRef.current = nextValue;
      onChange(nextValue);
      void hapticSelection();
    }
  };

  return (
    <View style={styles.sliderControl}>
      <NemuText
        density="compact"
        pointerEvents="none"
        numberOfLines={1}
        style={[
          styles.sliderFloatingValue,
          {
            color: tokens.mutedForeground,
            left: sliderValueLeft,
            width: SLIDER_VALUE_LABEL_WIDTH,
          },
        ]}
      >
        {formatted}
      </NemuText>
      <View
        accessibilityRole="adjustable"
        accessibilityLabel={setting.title}
        accessibilityState={{ disabled }}
        accessibilityValue={{
          min,
          max,
          now: value,
          text: formatted,
        }}
        onAccessibilityAction={(event) => {
          if (disabled) return;
          const action = event.nativeEvent.actionName;
          if (action === "increment") {
            const nextValue = snapSourceSettingSliderValue(value + step, min, max, step);
            if (nextValue !== value) {
              onChange(nextValue);
              void hapticSelection();
            }
          } else if (action === "decrement") {
            const nextValue = snapSourceSettingSliderValue(value - step, min, max, step);
            if (nextValue !== value) {
              onChange(nextValue);
              void hapticSelection();
            }
          }
        }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
        onMoveShouldSetResponder={() => !disabled}
        onStartShouldSetResponder={() => !disabled}
        onResponderGrant={(event) => {
          updateFromLocation(event.nativeEvent.locationX);
        }}
        onResponderMove={(event) => {
          updateFromLocation(event.nativeEvent.locationX);
        }}
        // Keep the drag once it started: a parent scroll view or the sheet's
        // pan must not take it over mid-slide.
        onResponderTerminationRequest={() => false}
        onResponderRelease={() => {
          if (!disabled) void hapticPress();
        }}
        style={[
          styles.sliderTrackTouchTarget,
          disabled && styles.disabledControl,
        ]}
      >
        {/* Drawing only: a touch over the fill or the thumb would otherwise
            report `locationX` relative to that child and jump the value. */}
        <View pointerEvents="none" style={[styles.sliderTrack, { backgroundColor: tokens.muted }]}>
          <View
            style={[
              styles.sliderFill,
              {
                backgroundColor: tokens.primary,
                width: `${progress * 100}%`,
              },
            ]}
          />
          <View
            style={[
              styles.sliderThumb,
              {
                backgroundColor: tokens.primary,
                borderColor: tokens.background,
                left: `${progress * 100}%`,
              },
            ]}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sliderControl: {
    width: "100%",
    minHeight: 48,
    justifyContent: "flex-end",
    paddingTop: 18,
  },
  sliderFloatingValue: {
    position: "absolute",
    top: 0,
    textAlign: "center",
    fontSize: 11,
    lineHeight: 14,
    fontWeight: nemuFontWeight.medium,
  },
  sliderTrackTouchTarget: {
    height: 24,
    justifyContent: "center",
  },
  sliderTrack: {
    height: 6,
    overflow: "visible",
    borderRadius: radius.pill,
  },
  sliderFill: {
    height: 6,
    borderRadius: radius.pill,
  },
  sliderThumb: {
    position: "absolute",
    top: -6,
    width: 18,
    height: 18,
    marginLeft: -9,
    borderRadius: 9,
    borderWidth: 3,
  },
  disabledControl: {
    opacity: 0.62,
  },
});
