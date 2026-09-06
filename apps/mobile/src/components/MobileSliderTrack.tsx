import { useCallback, useMemo, useRef, useState } from "react";
import {
  PanResponder,
  Platform,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { radius, useNemuTheme } from "@/design-system";
import {
  MOBILE_SLIDER_THUMB_SIZE,
  sliderRatioFromLocation,
  type MobileSliderTrackWindowFrame,
} from "@/lib/mobileSliderTrack";

type MobileSliderTrackProps = {
  progress: number;
  direction?: "ltr" | "rtl";
  disabled?: boolean;
  onRatioStart?: (ratio: number) => void;
  onRatioChange: (ratio: number) => void;
  onRatioEnd?: (ratio: number) => void;
  onRatioCancel?: () => void;
  /** Legacy release callback. Prefer onRatioEnd for new gesture-aware callers. */
  onRatioCommit?: (ratio: number) => void;
  /**
   * Reports the track's window-space box on layout and again when a drag
   * starts, for callers that anchor an overlay to the thumb from outside the
   * track's own view tree.
   */
  onTrackWindowFrame?: (frame: MobileSliderTrackWindowFrame) => void;
};

export function MobileSliderTrack({
  progress,
  direction = "ltr",
  disabled = false,
  onRatioStart,
  onRatioChange,
  onRatioEnd,
  onRatioCancel,
  onRatioCommit,
  onTrackWindowFrame,
}: MobileSliderTrackProps) {
  const { tokens } = useNemuTheme();
  const trackRef = useRef<View | null>(null);
  const [trackWidth, setTrackWidth] = useState(0);
  const clampedProgress = Math.max(0, Math.min(1, progress));
  const visualProgress =
    direction === "rtl" ? 1 - clampedProgress : clampedProgress;

  // Window coordinates come from the shadow tree, which spans the whole
  // surface. A touch's `pageX/pageY` would not: inside a SwiftUI host they are
  // measured from that host's own touch handler root, i.e. the toolbar panel.
  const measureTrackWindowFrame = useCallback(() => {
    if (!onTrackWindowFrame) return;
    trackRef.current?.measureInWindow((x, y, width, height) => {
      if (!(width > 0) || !(height > 0)) return;
      onTrackWindowFrame({ x, y, width, height });
    });
  }, [onTrackWindowFrame]);

  const panResponder = useMemo(() => {
    const ratioFromLocation = (locationX: number) => {
      if (disabled) return null;
      const ratio = sliderRatioFromLocation(locationX, trackWidth);
      return ratio;
    };
    const emitRatio = (locationX: number, handler?: (ratio: number) => void) => {
      if (!handler) return;
      const ratio = ratioFromLocation(locationX);
      if (ratio === null) return;
      handler(ratio);
    };

    return PanResponder.create({
      onStartShouldSetPanResponder: () => !disabled,
      onStartShouldSetPanResponderCapture: () => !disabled,
      onMoveShouldSetPanResponder: () => !disabled,
      onMoveShouldSetPanResponderCapture: () => !disabled,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (event) => {
        const ratio = ratioFromLocation(event.nativeEvent.locationX);
        if (ratio === null) return;
        // The track cannot move mid-drag, so one sample per gesture is enough;
        // taking it here also refreshes a frame left stale by chrome animations.
        measureTrackWindowFrame();
        onRatioStart?.(ratio);
        onRatioChange(ratio);
      },
      onPanResponderMove: (event) =>
        emitRatio(event.nativeEvent.locationX, onRatioChange),
      onPanResponderRelease: (event) =>
        emitRatio(
          event.nativeEvent.locationX,
          onRatioEnd ?? onRatioCommit ?? onRatioChange,
        ),
      onPanResponderTerminate: (event) => {
        if (onRatioCancel) {
          onRatioCancel();
          return;
        }
        // Preserve the historical behavior for callers that have not adopted
        // the explicit cancellation lifecycle yet.
        emitRatio(event.nativeEvent.locationX, onRatioCommit ?? onRatioChange);
      },
    });
  }, [
    disabled,
    measureTrackWindowFrame,
    onRatioCancel,
    onRatioChange,
    onRatioCommit,
    onRatioEnd,
    onRatioStart,
    trackWidth,
  ]);

  const onTrackLayout = (event: LayoutChangeEvent) => {
    setTrackWidth(event.nativeEvent.layout.width);
    measureTrackWindowFrame();
  };

  return (
    <View
      ref={trackRef}
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

const THUMB_SIZE = MOBILE_SLIDER_THUMB_SIZE;
const TRACK_HEIGHT = 8;

const styles = StyleSheet.create({
  touchTarget: {
    minHeight: Platform.OS === "android" ? 48 : 44,
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
