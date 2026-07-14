import {
  Pressable,
  StyleSheet,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { hapticPress } from "@/lib/haptics";
import {
  canRunNemuPressableHaptic,
  resolveNemuPressableAccessibility,
} from "@/lib/nemuPressable";

type MobileSheetBackdropProps = Omit<PressableProps, "children" | "onPress" | "style"> & {
  accessibilityLabel: string;
  backgroundColor: string;
  haptic?: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
};

export function MobileSheetBackdrop({
  accessibilityLabel,
  accessibilityRole = "button",
  accessibilityState,
  backgroundColor,
  disabled = false,
  haptic = true,
  onPress,
  style,
  ...props
}: MobileSheetBackdropProps) {
  const {
    accessibilityRole: resolvedAccessibilityRole,
    accessibilityState: resolvedAccessibilityState,
    disabled: resolvedDisabled,
  } = resolveNemuPressableAccessibility({
    accessibilityRole,
    accessibilityState,
    disabled,
    hasAction: true,
  });

  return (
    <Pressable
      {...props}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={resolvedAccessibilityRole}
      accessibilityState={resolvedAccessibilityState}
      disabled={resolvedDisabled}
      onPress={() => {
        if (resolvedDisabled) return;
        if (canRunNemuPressableHaptic(haptic ? "press" : "none", resolvedDisabled)) {
          void hapticPress();
        }
        onPress();
      }}
      style={[styles.backdrop, { backgroundColor }, style]}
    />
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
});
