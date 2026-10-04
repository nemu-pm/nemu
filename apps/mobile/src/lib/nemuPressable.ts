import type { AccessibilityRole, AccessibilityState } from "react-native";

export type NemuPressableHapticFeedback =
  | "press"
  | "selection"
  | "confirm"
  | "warning"
  | "error"
  | "none";

/**
 * Named press scales so screens stop hand-picking ad-hoc values. An explicit
 * `pressedScale` prop still wins over the profile.
 */
const nemuPressablePressProfiles = {
  card: 0.98,
  row: 0.985,
  icon: 0.94,
  tab: 0.97,
} as const;

export type NemuPressableProfile = keyof typeof nemuPressablePressProfiles;

export function resolveNemuPressablePressedScale({
  pressProfile,
  pressedScale,
}: {
  pressProfile?: NemuPressableProfile;
  pressedScale?: number;
}): number | undefined {
  if (pressedScale !== undefined) return pressedScale;
  if (pressProfile !== undefined) return nemuPressablePressProfiles[pressProfile];
  return undefined;
}

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
 * Every pressable inherits the app's unresolved-safe Reduce Motion policy: the
 * press spring runs only once the setting is known to be off (`false`), so an
 * unresolved (`null`) read stays still rather than animating first and
 * settling later. Callers can still opt a bespoke control explicitly in or out
 * through `pressAnimationEnabled`.
 */
export function resolveNemuPressableAnimationEnabled({
  pressAnimationEnabled,
  reduceMotion,
}: {
  /**
   * Still accepted so the component call site keeps compiling; button depth no
   * longer decides the policy now that every pressable honours the setting.
   */
  hasButtonDepth?: boolean;
  pressAnimationEnabled?: boolean;
  reduceMotion: boolean | null;
}): boolean {
  if (pressAnimationEnabled !== undefined) return pressAnimationEnabled;
  return reduceMotion === false;
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

/**
 * Native row selection (UITableView inset-grouped / Android list items): the
 * row fills with a highlight on touch-down and fades it out on release,
 * instead of shrinking. Timings follow UIKit: a short touch-down delay so a
 * scroll that starts on the row never flashes it, a quick tap still shows it
 * briefly, and the fade-out is ~quarter of a second.
 */
export const NEMU_ROW_HIGHLIGHT = {
  /** Touch-down → highlight (UIScrollView `delaysContentTouches` feel). */
  delayMs: 60,
  /** Release → highlight gone. */
  fadeOutMs: 260,
  /** Foreground-colour alpha of the fill (≈ systemGray4 over the card). */
  lightAlpha: 0.08,
  darkAlpha: 0.14,
} as const;

type RadiusStyle = {
  borderRadius?: unknown;
  borderTopLeftRadius?: unknown;
  borderTopRightRadius?: unknown;
  borderBottomLeftRadius?: unknown;
  borderBottomRightRadius?: unknown;
  borderTopStartRadius?: unknown;
  borderTopEndRadius?: unknown;
  borderBottomStartRadius?: unknown;
  borderBottomEndRadius?: unknown;
  borderWidth?: unknown;
};

function radiusValue(...values: unknown[]): number {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, value);
  }
  return 0;
}

/**
 * Corner radii of a row's highlight: the row's own corners (per corner, so a
 * first/last row of a grouped card keeps only its outer corners), concentric
 * inside its border — the fill starts inside the border, so each radius loses
 * the border width. A square row inside a rounded, clipping card gets square
 * corners here and the card clips it to the card's corners.
 */
export function resolveNemuRowHighlightRadii(style: RadiusStyle | null | undefined): {
  borderTopLeftRadius: number;
  borderTopRightRadius: number;
  borderBottomLeftRadius: number;
  borderBottomRightRadius: number;
} {
  const s = style ?? {};
  const inset = radiusValue(s.borderWidth);
  const corner = (...values: unknown[]) => Math.max(0, radiusValue(...values, s.borderRadius) - inset);
  return {
    borderTopLeftRadius: corner(s.borderTopLeftRadius, s.borderTopStartRadius),
    borderTopRightRadius: corner(s.borderTopRightRadius, s.borderTopEndRadius),
    borderBottomLeftRadius: corner(s.borderBottomLeftRadius, s.borderBottomStartRadius),
    borderBottomRightRadius: corner(s.borderBottomRightRadius, s.borderBottomEndRadius),
  };
}
