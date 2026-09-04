import { useEffect } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useNemuTheme } from "@/design/useNemuTheme";

const SPIN_DURATION_MS = 900;

export type NemuRingSpinnerProps = {
  /** Outer diameter in points. */
  size?: number;
  /** Ring stroke width in points. */
  thickness?: number;
  /** Colour of the leading arc (defaults to `tokens.primary`). */
  color?: string;
  /** Colour of the remaining ring (defaults to `tokens.border`). */
  trackColor?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * The Nemu loading ring: a hairline track with one accent segment sweeping a
 * full turn every 900ms, linearly. Replaces the platform `ActivityIndicator`
 * wherever loading sits inside Nemu chrome so the spinner reads as ours.
 *
 * Reduce Motion (either the Nemu theme preference or the OS setting) renders
 * the ring static with the accent segment parked at 12 o'clock, so the shape
 * still reads as "busy" without any rotation.
 */
export function NemuRingSpinner({
  size = 18,
  thickness = 2,
  color,
  trackColor,
  accessibilityLabel,
  style,
}: NemuRingSpinnerProps) {
  const { reduceMotion, tokens } = useNemuTheme();
  const reducedMotion = useReducedMotion();
  const motionDisabled = reduceMotion || reducedMotion === true;
  const rotation = useSharedValue(0);

  useEffect(() => {
    if (motionDisabled) {
      cancelAnimation(rotation);
      rotation.value = 0;
      return;
    }
    rotation.value = 0;
    rotation.value = withRepeat(
      withTiming(360, {
        duration: SPIN_DURATION_MS,
        easing: Easing.linear,
      }),
      -1,
      false,
    );
    return () => cancelAnimation(rotation);
  }, [motionDisabled, rotation]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const ringStyle: ViewStyle = {
    width: size,
    height: size,
    borderRadius: size / 2,
    borderWidth: thickness,
    borderColor: trackColor ?? tokens.border,
    borderTopColor: color ?? tokens.primary,
  };

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="progressbar"
      style={[styles.host, { width: size, height: size }, style]}
    >
      {motionDisabled ? (
        <View style={ringStyle} />
      ) : (
        <Animated.View style={[ringStyle, animatedStyle]} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    alignItems: "center",
    justifyContent: "center",
  },
});
