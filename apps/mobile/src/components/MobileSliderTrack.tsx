import { useMemo, useState } from "react";
import {
  PanResponder,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { radius, useNemuTheme } from "@/design-system";
import { sliderRatioFromLocation } from "@/lib/mobileSliderTrack";

type MobileSliderTrackProps = {
  progress: number;
  direction?: "ltr" | "rtl";
  disabled?: boolean;
  onRatioChange: (ratio: number) => void;
  onRatioCommit?: (ratio: number) => void;
};

export function MobileSliderTrack({
  progress,
  direction = "ltr",
  disabled = false,
  onRatioChange,
  onRatioCommit,
}: MobileSliderTrackProps) {
  const { tokens } = useNemuTheme();
  const [trackWidth, setTrackWidth] = useState(0);
  const clampedProgress = Math.max(0, Math.min(1, progress));
  const visualProgress =
    direction === "rtl" ? 1 - clampedProgress : clampedProgress;

  const panResponder = useMemo(() => {
    const emitRatio = (locationX: number, handler?: (ratio: number) => void) => {
      if (disabled || !handler) return;
      const ratio = sliderRatioFromLocation(locationX, trackWidth);
      if (ratio === null) return;
      handler(ratio);
    };

    return PanResponder.create({
      onStartShouldSetPanResponder: () => !disabled,
      onStartShouldSetPanResponderCapture: () => !disabled,
      onMoveShouldSetPanResponder: () => !disabled,
      onMoveShouldSetPanResponderCapture: () => !disabled,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (event) =>
        emitRatio(event.nativeEvent.locationX, onRatioChange),
      onPanResponderMove: (event) =>
        emitRatio(event.nativeEvent.locationX, onRatioChange),
      onPanResponderRelease: (event) =>
        emitRatio(event.nativeEvent.locationX, onRatioCommit ?? onRatioChange),
      onPanResponderTerminate: (event) =>
        emitRatio(event.nativeEvent.locationX, onRatioCommit ?? onRatioChange),
    });
  }, [disabled, onRatioChange, onRatioCommit, trackWidth]);

  const onTrackLayout = (event: LayoutChangeEvent) => {
    setTrackWidth(event.nativeEvent.layout.width);
  };

  return (
    <View
      {...panResponder.panHandlers}
      style={styles.touchTarget}
      onLayout={onTrackLayout}
    >
      {/* pointerEvents="none" keeps every touch targeting the outer view the
          responder measures, so locationX is track-relative even when the
          gesture starts on the thumb or fill. */}
      <View pointerEvents="none" style={styles.trackShell}>
        <View style={[styles.track, { backgroundColor: tokens.muted }]}>
          <View
            style={[
              styles.fill,
              {
                backgroundColor: tokens.primary,
                width: `${clampedProgress * 100}%`,
              },
              direction === "rtl" ? styles.fillRtl : styles.fillLtr,
            ]}
          />
        </View>
        <View
          style={[
            styles.thumb,
            {
              backgroundColor: tokens.primary,
              borderColor: tokens.primaryForeground,
              left: `${visualProgress * 100}%`,
            },
          ]}
        />
      </View>
    </View>
  );
}

const THUMB_SIZE = 18;
const TRACK_HEIGHT = 8;

const styles = StyleSheet.create({
  touchTarget: {
    minHeight: 32,
    justifyContent: "center",
  },
  trackShell: {
    height: TRACK_HEIGHT,
    justifyContent: "center",
    position: "relative",
  },
  track: {
    height: TRACK_HEIGHT,
    borderRadius: radius.sm,
    overflow: "hidden",
  },
  fill: {
    position: "absolute",
    height: TRACK_HEIGHT,
    borderRadius: radius.sm,
    top: 0,
  },
  fillLtr: {
    left: 0,
  },
  fillRtl: {
    right: 0,
  },
  thumb: {
    position: "absolute",
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    top: (TRACK_HEIGHT - THUMB_SIZE) / 2,
    marginLeft: -(THUMB_SIZE / 2),
    borderRadius: THUMB_SIZE / 2,
    borderWidth: 2,
  },
});
