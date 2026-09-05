import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, View } from "react-native";
import { radius } from "@/design/tokens";
import { nemuFontWeight } from "@/design/typography";
import { useNemuTheme } from "@/design/useNemuTheme";
import type { NemuPressableHapticFeedback } from "@/lib/nemuPressable";
import { MobileCachedImage } from "./MobileCachedImage";
import { NemuPressable } from "./NemuPressable";
import { NemuText } from "./NemuText";

/**
 * The one chip primitive. Every chip in the app is a depth surface: an
 * unselected chip is the recessed "pressed-in well" (`buttonDepth="chip"`) and
 * a selected one is the plain primary surface (`chip-selected`) — no halo, no
 * boxed icon backgrounds.
 *
 * - `toggle` — leading icon/glyph + label + optional badge, optionally with a
 *   trailing glyph (`close` for a removable filter chip). This is the Search
 *   tab's source chip, unchanged.
 * - `menu` — an already-composed `label: value` string plus a chevron; the
 *   caller marks it selected when the value is anything but the default.
 * - `icon` — a bare glyph in a 30pt well (the filter funnel), with an optional
 *   badge count.
 */
export type MobileChipVariant = "toggle" | "menu" | "icon";

export type MobileChipProps = {
  variant?: MobileChipVariant;
  /** Composed display text. Unused by the `icon` variant. */
  label?: string;
  selected: boolean;
  disabled?: boolean;
  /** Remote leading icon (`toggle`); falls back to `fallbackIcon` while absent. */
  icon?: string;
  /** Leading glyph for `toggle`, or the glyph itself for `icon`. */
  fallbackIcon?: keyof typeof Ionicons.glyphMap;
  /** Trailing glyph. `menu` defaults to `chevron-down`. */
  trailingIcon?: keyof typeof Ionicons.glyphMap;
  badge?: string;
  accessibilityLabel: string;
  accessibilityHint?: string;
  accessibilityRole?: "button" | "checkbox" | "tab" | "radio";
  accessibilityState?: { checked?: boolean; selected?: boolean; disabled?: boolean };
  hapticFeedback?: NemuPressableHapticFeedback;
  testID?: string;
  onPress: () => void;
  onLongPress?: () => void;
};

const MENU_TRAILING_GLYPH_SIZE = 14;

export function MobileChip({
  variant = "toggle",
  label,
  selected,
  disabled = false,
  icon,
  fallbackIcon,
  trailingIcon,
  badge,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole = "button",
  accessibilityState,
  hapticFeedback,
  testID,
  onPress,
  onLongPress,
}: MobileChipProps) {
  const { tokens } = useNemuTheme();
  const foregroundColor = selected
    ? tokens.primaryForeground
    : tokens.mutedForeground;
  const resolvedAccessibilityState =
    accessibilityState ??
    (accessibilityRole === "checkbox" || accessibilityRole === "radio"
      ? { checked: selected, disabled }
      : { selected, disabled });
  const resolvedTrailingIcon =
    trailingIcon ?? (variant === "menu" ? "chevron-down" : undefined);

  return (
    <NemuPressable
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityRole={accessibilityRole}
      accessibilityState={resolvedAccessibilityState}
      buttonDepth={selected ? "chip-selected" : "chip"}
      disabled={disabled}
      hapticFeedback={
        hapticFeedback ?? (disabled ? "none" : "selection")
      }
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={260}
      pressedScale={0.97}
      testID={testID}
      style={[
        styles.root,
        variant === "icon" ? styles.rootIcon : null,
        variant === "menu" ? styles.rootMenu : null,
        {
          opacity: disabled ? 0.58 : 1,
        },
      ]}
    >
      {icon ? (
        <MobileCachedImage
          fallback={
            fallbackIcon ? (
              <Ionicons name={fallbackIcon} size={16} color={foregroundColor} />
            ) : null
          }
          uriOwnership="source"
          source={{ uri: icon }}
          style={styles.iconImage}
        />
      ) : fallbackIcon ? (
        <Ionicons name={fallbackIcon} size={16} color={foregroundColor} />
      ) : null}
      {label ? (
        <NemuText
          numberOfLines={1}
          style={[styles.label, { color: foregroundColor }]}
        >
          {label}
        </NemuText>
      ) : null}
      {badge ? (
        <View style={[styles.badge, { backgroundColor: tokens.card }]}>
          <NemuText
            numberOfLines={1}
            style={[styles.badgeLabel, { color: tokens.mutedForeground }]}
          >
            {badge}
          </NemuText>
        </View>
      ) : null}
      {resolvedTrailingIcon ? (
        <Ionicons
          name={resolvedTrailingIcon}
          size={MENU_TRAILING_GLYPH_SIZE}
          color={foregroundColor}
        />
      ) : null}
    </NemuPressable>
  );
}

const styles = StyleSheet.create({
  root: {
    minHeight: 30,
    maxWidth: 154,
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
  },
  // A bare glyph keeps the 30pt pill square instead of inheriting the
  // label-sized horizontal padding.
  rootIcon: {
    minWidth: 30,
    paddingHorizontal: 7,
  },
  // A menu chip carries `group: value`, so it needs more room than a source
  // name before the label starts truncating.
  rootMenu: {
    maxWidth: 210,
  },
  iconImage: {
    width: 16,
    height: 16,
    flexShrink: 0,
    borderRadius: 4,
  },
  label: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: nemuFontWeight.medium,
    letterSpacing: 0,
  },
  badge: {
    flexShrink: 0,
    borderRadius: radius.pill,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  badgeLabel: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: nemuFontWeight.semibold,
  },
});
