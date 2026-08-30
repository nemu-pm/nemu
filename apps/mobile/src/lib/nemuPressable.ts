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

export type NemuButtonAccessibilityInput = {
  accessibilityState?: AccessibilityState;
  disabled?: boolean | null;
  loading?: boolean | null;
};

export type NemuButtonResolvedAccessibility = {
  accessibilityState: AccessibilityState;
  disabled: boolean;
};

/**
 * Keep transient native accessibility flags explicit. React Native can retain
 * Android's previous `busy: true` state when the next prop merely omits the
 * key, causing an enabled button to remain announced as busy after loading.
 */
export function resolveNemuButtonAccessibility({
  accessibilityState,
  disabled,
  loading,
}: NemuButtonAccessibilityInput): NemuButtonResolvedAccessibility {
  const resolvedDisabled = Boolean(
    disabled || loading || accessibilityState?.disabled,
  );

  return {
    accessibilityState: {
      ...accessibilityState,
      disabled: resolvedDisabled,
      busy: Boolean(loading || accessibilityState?.busy),
    },
    disabled: resolvedDisabled,
  };
}

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

/**
 * Depth controls inherit the app's unresolved-safe Reduce Motion policy. Plain
 * pressables retain their existing spring by default; callers can still opt a
 * bespoke control explicitly in or out through `pressAnimationEnabled`.
 */
export function resolveNemuPressableAnimationEnabled({
  hasButtonDepth,
  pressAnimationEnabled,
  reduceMotion,
}: {
  hasButtonDepth: boolean;
  pressAnimationEnabled?: boolean;
  reduceMotion: boolean | null;
}): boolean {
  if (pressAnimationEnabled !== undefined) return pressAnimationEnabled;
  return hasButtonDepth ? reduceMotion === false : true;
}

/** A disabled or motion-suppressed control may not receive a final press-out. */
export function shouldResetNemuPressableInteraction({
  animationEnabled,
  disabled,
}: {
  animationEnabled: boolean;
  disabled: boolean;
}): boolean {
  return disabled || !animationEnabled;
}
