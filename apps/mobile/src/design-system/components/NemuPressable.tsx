import { useState, type ReactNode } from "react";
import {
  Animated,
  Platform,
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import {
  getNemuButtonDepthVisual,
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
  type NemuPressableHapticFeedback,
} from "@/lib/nemuPressable";

const useNativeAnimationDriver = Platform.OS !== "web";

type NemuPressableProps = Omit<PressableProps, "style"> & {
  buttonDepth?: NemuButtonDepthVariant;
  children: ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  pressedScale?: number;
  hapticFeedback?: NemuPressableHapticFeedback;
};

export function NemuPressable({
  buttonDepth,
  children,
  containerStyle,
  style,
  pressedScale = 0.96,
  hitSlop = 6,
  accessibilityRole,
  onPress,
  onPressIn,
  onPressOut,
  onLongPress,
  disabled,
  accessibilityState,
  hapticFeedback = "press",
  ...props
}: NemuPressableProps) {
  const { scheme, tokens } = useNemuTheme();
  const [scale] = useState(() => new Animated.Value(1));
  const [depthPressed, setDepthPressed] = useState(false);
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
  const depthVisual = buttonDepth
    ? getNemuButtonDepthVisual({
        variant: buttonDepth,
        state: depthPressed && !resolvedDisabled ? "pressed" : "rest",
        scheme,
        tokens,
      })
    : null;

  const animateTo = (value: number) => {
    Animated.spring(scale, {
      toValue: value,
      useNativeDriver: useNativeAnimationDriver,
      stiffness: 420,
      damping: 28,
      mass: 0.65,
    }).start();
  };
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
      style={containerStyle}
      onPressIn={(event: GestureResponderEvent) => {
        if (resolvedDisabled) return;
        animateTo(pressedScale);
        if (buttonDepth) setDepthPressed(true);
        onPressIn?.(event);
      }}
      onPressOut={(event: GestureResponderEvent) => {
        animateTo(1);
        if (buttonDepth) setDepthPressed(false);
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
          depthVisual ? createNemuButtonDepthStyle(depthVisual) : null,
          style,
          { transform: [{ scale }] },
        ]}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
}
