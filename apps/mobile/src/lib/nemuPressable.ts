import type { AccessibilityRole, AccessibilityState } from "react-native";

export type NemuPressableHapticFeedback =
  | "press"
  | "selection"
  | "confirm"
  | "warning"
  | "error"
  | "none";

export type NemuPressableAccessibilityInput = {
  accessibilityRole?: AccessibilityRole;
  accessibilityState?: AccessibilityState;
  disabled?: boolean | null;
  hasAction: boolean;
};

export type NemuPressableResolvedAccessibility = {
  accessibilityRole?: AccessibilityRole;
  accessibilityState?: AccessibilityState;
  disabled: boolean;
};

export function resolveNemuPressableAccessibility({
  accessibilityRole,
  accessibilityState,
  disabled,
  hasAction,
}: NemuPressableAccessibilityInput): NemuPressableResolvedAccessibility {
  const resolvedDisabled = Boolean(disabled || accessibilityState?.disabled);

  return {
    accessibilityRole: accessibilityRole ?? (hasAction ? "button" : undefined),
    accessibilityState: resolvedDisabled
      ? { ...accessibilityState, disabled: true }
      : accessibilityState,
    disabled: resolvedDisabled,
  };
}

export function canRunNemuPressableHaptic(
  hapticFeedback: NemuPressableHapticFeedback,
  disabled: boolean,
): boolean {
  return !disabled && hapticFeedback !== "none";
}
