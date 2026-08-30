import { useEffect, useState, type ReactNode } from "react";
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import {
  getNemuButtonPressMotion,
  getNemuButtonDepthVisual,
  getNemuButtonMinimumTargetSize,
  hasNemuButtonShadowOverride,
  splitNemuButtonStyle,
  type NemuButtonDepthVariant,
} from "@/design/nemuButtonDepth";
import { createNemuButtonDepthStyle } from "@/design/nemuButtonDepthStyle";
import { useNemuTheme } from "@/design/useNemuTheme";
import {
  hapticConfirm,
  hapticError,
  hapticPress,
  hapticSelection,
  hapticWarning,
} from "@/lib/haptics";
import {
  canRunNemuPressableHaptic,
  resolveNemuPressableAccessibility,
  resolveNemuPressableAnimationEnabled,
  shouldResetNemuPressableInteraction,
  type NemuPressableHapticFeedback,
} from "@/lib/nemuPressable";

const useNativeAnimationDriver = Platform.OS !== "web";

type NemuPressableProps = Omit<PressableProps, "style"> & {
  buttonDepth?: NemuButtonDepthVariant;
  children: ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  pressedScale?: number;
  pressAnimationDuration?: number;
  pressAnimationEnabled?: boolean;
  hapticFeedback?: NemuPressableHapticFeedback;
  /** Enforces the native 44pt/48dp accessible target around compact visuals. */
  minimumTouchTarget?: boolean;
};

export function NemuPressable({
  buttonDepth,
  children,
  containerStyle,
  style,
  pressedScale,
  pressAnimationDuration,
  pressAnimationEnabled,
  hitSlop = 6,
  accessibilityRole,
  onPress,
  onPressIn,
  onPressOut,
  onLongPress,
  disabled,
  accessibilityState,
  hapticFeedback = "press",
  minimumTouchTarget = false,
  ...props
}: NemuPressableProps) {
  const { reduceMotion, scheme, tokens } = useNemuTheme();
  const [scale] = useState(() => new Animated.Value(1));
  const [depthPressProgress] = useState(() => new Animated.Value(0));
  const {
    accessibilityRole: resolvedAccessibilityRole,
    accessibilityState: resolvedAccessibilityState,
    disabled: resolvedDisabled,
  } = resolveNemuPressableAccessibility({
    accessibilityRole,
    accessibilityState,
    disabled,
    hasAction: Boolean(onPress || onLongPress),
  });
  const depthRestVisual = buttonDepth
    ? getNemuButtonDepthVisual({
        variant: buttonDepth,
        state: "rest",
        scheme,
        tokens,
      })
    : null;
  const depthPressedVisual = buttonDepth
    ? getNemuButtonDepthVisual({
        variant: buttonDepth,
        state: "pressed",
        scheme,
        tokens,
      })
    : null;
  const flattenedStyle = StyleSheet.flatten(style);
  const { surfaceShapeStyle, surfaceStyle } = splitNemuButtonStyle(flattenedStyle);
  const callerOverridesShadow = hasNemuButtonShadowOverride(surfaceStyle);
  const depthMotion = buttonDepth ? getNemuButtonPressMotion(buttonDepth) : null;
  // A depth-enabled surface connects `scale` and `depthPressProgress` to the
  // same Animated props node. Moving only `scale` to the native driver also
  // moves that shared node, after which the JS-driven color animation throws
  // on press. Keep the paired depth animation on one driver.
  const useNativeScaleDriver = useNativeAnimationDriver && !depthRestVisual;
  const depthMinimumTarget = buttonDepth || minimumTouchTarget
    ? getNemuButtonMinimumTargetSize(Platform.OS)
    : null;
  const resolvedPressedScale =
    pressedScale ?? (depthMotion ? depthMotion.scale : 0.96);
  const resolvedPressAnimationDuration =
    pressAnimationDuration ?? depthMotion?.duration;
  const resolvedPressAnimationEnabled =
    resolveNemuPressableAnimationEnabled({
      hasButtonDepth: Boolean(buttonDepth),
      pressAnimationEnabled,
      reduceMotion,
    });
  const depthBackgroundColor =
    depthRestVisual && depthPressedVisual
      ? depthPressProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [
            depthRestVisual.backgroundColor,
            depthPressedVisual.backgroundColor,
          ],
        })
      : undefined;
  const depthBorderColor =
    depthRestVisual && depthPressedVisual
      ? depthPressProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [
            depthRestVisual.borderColor,
            depthPressedVisual.borderColor,
          ],
        })
      : undefined;
  const restShadowOpacity = depthPressProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });

  const animateTo = (value: number, pressed: boolean) => {
    const depthTarget = pressed ? 1 : 0;
    scale.stopAnimation();
    depthPressProgress.stopAnimation();
    if (!resolvedPressAnimationEnabled) {
      scale.setValue(1);
      depthPressProgress.setValue(
        depthTarget === 1 && !resolvedDisabled ? 1 : 0,
      );
      return;
    }
    if (resolvedPressAnimationDuration !== undefined) {
      Animated.timing(scale, {
        toValue: value,
        duration: resolvedPressAnimationDuration,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
        useNativeDriver: useNativeScaleDriver,
      }).start();
    } else {
      Animated.spring(scale, {
        toValue: value,
        useNativeDriver: useNativeScaleDriver,
        stiffness: 420,
        damping: 28,
        mass: 0.65,
      }).start();
    }
    if (depthRestVisual) {
      Animated.timing(depthPressProgress, {
        toValue: depthTarget,
        duration: resolvedPressAnimationDuration ?? depthMotion?.duration ?? 180,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
        useNativeDriver: false,
      }).start();
    }
  };

  useEffect(() => {
    if (
      !shouldResetNemuPressableInteraction({
        animationEnabled: resolvedPressAnimationEnabled,
        disabled: resolvedDisabled,
      })
    ) {
      return;
    }
    scale.stopAnimation();
    scale.setValue(1);
    depthPressProgress.stopAnimation();
    depthPressProgress.setValue(0);
    // A Pressable disabled during an active gesture is not guaranteed to emit
    // onPressOut. Clear the visual latch before it can re-enable as pressed.
  }, [
    depthPressProgress,
    resolvedDisabled,
    resolvedPressAnimationEnabled,
    scale,
  ]);

  useEffect(
    () => () => {
      scale.stopAnimation();
      depthPressProgress.stopAnimation();
    },
    [depthPressProgress, scale],
  );
  const runHapticFeedback = () => {
    if (!canRunNemuPressableHaptic(hapticFeedback, resolvedDisabled)) return;
    if (hapticFeedback === "selection") {
      void hapticSelection();
      return;
    }
    if (hapticFeedback === "confirm") {
      void hapticConfirm();
      return;
    }
    if (hapticFeedback === "warning") {
      void hapticWarning();
      return;
    }
    if (hapticFeedback === "error") {
      void hapticError();
      return;
    }
    if (hapticFeedback === "press") {
      void hapticPress();
    }
  };

  return (
    <Pressable
      {...props}
      accessibilityRole={resolvedAccessibilityRole}
      accessibilityState={resolvedAccessibilityState}
      disabled={resolvedDisabled}
      hitSlop={hitSlop}
      style={[
        depthMinimumTarget ? styles.depthTouchTarget : null,
        containerStyle,
        depthMinimumTarget
          ? {
              minHeight: depthMinimumTarget,
              minWidth: depthMinimumTarget,
            }
          : null,
      ]}
      onPressIn={(event: GestureResponderEvent) => {
        if (resolvedDisabled) return;
        animateTo(resolvedPressedScale, true);
        onPressIn?.(event);
      }}
      onPressOut={(event: GestureResponderEvent) => {
        animateTo(1, false);
        if (resolvedDisabled) return;
        onPressOut?.(event);
      }}
      onPress={(event: GestureResponderEvent) => {
        if (resolvedDisabled) return;
        onPress?.(event);
        runHapticFeedback();
      }}
      onLongPress={
        onLongPress
          ? (event: GestureResponderEvent) => {
              if (resolvedDisabled) return;
              onLongPress(event);
              runHapticFeedback();
            }
          : undefined
      }
    >
      <Animated.View
        style={[
          depthRestVisual ? createNemuButtonDepthStyle(depthRestVisual) : null,
          depthRestVisual
            ? {
                backgroundColor: depthBackgroundColor,
                borderColor: depthBorderColor,
                boxShadow: callerOverridesShadow ? undefined : "none",
              }
            : null,
          style,
          { transform: [{ scale }] },
        ]}
      >
        {depthRestVisual && depthPressedVisual && !callerOverridesShadow ? (
          <>
            <Animated.View
              pointerEvents="none"
              style={[
                styles.depthShadow,
                {
                  boxShadow: depthRestVisual.boxShadow,
                  opacity: restShadowOpacity,
                },
                surfaceShapeStyle,
              ]}
            />
            <Animated.View
              pointerEvents="none"
              style={[
                styles.depthShadow,
                {
                  boxShadow: depthPressedVisual.boxShadow,
                  opacity: depthPressProgress,
                },
                surfaceShapeStyle,
              ]}
            />
          </>
        ) : null}
        {children}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  depthTouchTarget: {
    alignItems: "center",
    justifyContent: "center",
  },
  depthShadow: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "transparent",
    borderColor: "transparent",
    borderWidth: 0,
  },
});
