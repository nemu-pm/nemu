/**
 * DuoBilingualLayoutToggle — "Spread" ↔ "Side by side" for the bilingual book.
 *
 * Show it only when `resolveMobileDuoBilingualMode(...).showToggle` is true
 * (an eligible window with a configured dual reader).
 *
 * Props:
 * - `mode`: current value (`resolveMobileDuoBilingualMode(...).mode`).
 * - `onChange`: defaults to `setMobileDuoBilingualChoice`, the session-only
 *   store (never persisted or synced — a pose must not rewrite settings).
 * Renders one 38pt chrome icon button, for the vertical rail / top chrome;
 * the symbol shows the current layout, VoiceOver reads "Page layout, Side by
 * side" and a tap switches (HIG: title + symbol, icon-only in toolbars with an
 * accessibility label).
 * - `color`: icon/label colour on the chrome surface (chrome `secondaryText`).
 * - `strings`, `disabled`, `style`.
 */
import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps } from "react";
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { NemuPressable, radius, useNemuTheme } from "@/design-system";
import type { MobileStrings } from "@/lib/mobileI18n";
import {
  setMobileDuoBilingualChoice,
  type MobileDuoBilingualMode,
} from "@/lib/mobileDuoBilingual";

const ICONS: Record<MobileDuoBilingualMode, ComponentProps<typeof Ionicons>["name"]> = {
  spread: "book-outline",
  sideBySide: "git-compare-outline",
};

export type DuoBilingualLayoutToggleProps = {
  mode: MobileDuoBilingualMode;
  onChange?: (mode: MobileDuoBilingualMode) => void;
  color?: string;
  strings: MobileStrings;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function DuoBilingualLayoutToggle({
  mode,
  onChange = setMobileDuoBilingualChoice,
  color,
  strings,
  disabled = false,
  style,
}: DuoBilingualLayoutToggleProps) {
  const { tokens } = useNemuTheme();
  const labels: Record<MobileDuoBilingualMode, string> = {
    spread: strings.duo.bilingualSpread,
    sideBySide: strings.duo.bilingualSideBySide,
  };

  const next: MobileDuoBilingualMode = mode === "sideBySide" ? "spread" : "sideBySide";
  return (
    <NemuPressable
      accessibilityRole="button"
      accessibilityLabel={strings.duo.bilingualLayoutLabel}
      accessibilityValue={{ text: labels[mode] }}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hapticFeedback="selection"
      onPress={() => onChange(next)}
      style={[styles.iconButton, { opacity: disabled ? 0.56 : 1 }, style]}
    >
      <Ionicons name={ICONS[mode]} size={22} color={color ?? tokens.mutedForeground} />
    </NemuPressable>
  );
}

const styles = StyleSheet.create({
  iconButton: {
    flexShrink: 0,
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.xl,
    backgroundColor: "transparent",
  },
});
