import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, View } from "react-native";
import { getNemuButtonDepthVisual } from "@/design/nemuButtonDepth";
import { createNemuButtonDepthStyle } from "@/design/nemuButtonDepthStyle";
import { radius } from "@/design/tokens";
import { nemuFontWeight } from "@/design/typography";
import { useNemuTheme } from "@/design/useNemuTheme";
import type { NemuPressableHapticFeedback } from "@/lib/nemuPressable";
import { MobileCachedImage } from "./MobileCachedImage";
import {
  getMobileChipDepthVariant,
  getMobileChipGlyphSize,
  getMobileChipTrailingGlyphSize,
  isMobileChipPressable,
  resolveMobileChipAccessibilityState,
  resolveMobileChipTrailingIcon,
  type MobileChipAccessibilityRole,
  type MobileChipAccessibilityState,
  type MobileChipSize,
  type MobileChipVariant,
} from "./mobileChipVisuals";
import { NemuPressable } from "./NemuPressable";
import { NemuText } from "./NemuText";

export type {
  MobileChipSize,
  MobileChipVariant,
} from "./mobileChipVisuals";

type MobileChipBaseProps = {
  size?: MobileChipSize;
  /** Composed display text. Unused by the `icon` variant. */
  label?: string;
  selected?: boolean;
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
  accessibilityRole?: MobileChipAccessibilityRole;
  accessibilityState?: MobileChipAccessibilityState;
  hapticFeedback?: NemuPressableHapticFeedback;
  testID?: string;
};

export type MobileChipProps = MobileChipBaseProps &
  (
    | {
        variant?: Exclude<MobileChipVariant, "static">;
        onPress: () => void;
        onLongPress?: () => void;
      }
    | {
        variant: "static";
        onPress?: never;
        onLongPress?: never;
      }
  );

/**
 * The one chip primitive. Every chip in the app is a depth surface: an
 * unselected chip is the recessed "pressed-in well" (`buttonDepth="chip"`) and
 * a selected one is the plain primary surface (`chip-selected`) — no halo, no
 * boxed icon backgrounds. `mobileChipVisuals` documents the variants and the
 * two sizes, and owns the rules this component reads.
 */
export function MobileChip({
  variant = "toggle",
  size = "md",
  label,
  selected = false,
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
  const { scheme, tokens } = useNemuTheme();
  const small = size === "sm";
  const foregroundColor = selected
    ? tokens.primaryForeground
    : tokens.mutedForeground;
  const resolvedAccessibilityState = resolveMobileChipAccessibilityState({
    accessibilityRole,
    accessibilityState,
    disabled,
    selected,
  });
  const resolvedTrailingIcon = resolveMobileChipTrailingIcon({
    variant,
    trailingIcon,
  });
  const frameStyle = [
    styles.root,
    small ? styles.rootSmall : null,
    variant === "icon" ? (small ? styles.rootIconSmall : styles.rootIcon) : null,
    variant === "menu" ? styles.rootMenu : null,
  ];

  const content = (
    <>
      {icon ? (
        <MobileCachedImage
          fallback={
            fallbackIcon ? (
              <Ionicons
                name={fallbackIcon}
                size={getMobileChipGlyphSize(size)}
                color={foregroundColor}
              />
            ) : null
          }
          uriOwnership="source"
          source={{ uri: icon }}
          style={[styles.iconImage, small ? styles.iconImageSmall : null]}
        />
      ) : fallbackIcon ? (
        <Ionicons
          name={fallbackIcon}
          size={getMobileChipGlyphSize(size)}
          color={foregroundColor}
        />
      ) : null}
      {label ? (
        <NemuText
          numberOfLines={1}
          style={[
            styles.label,
            small ? styles.labelSmall : null,
            { color: foregroundColor },
          ]}
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
          size={getMobileChipTrailingGlyphSize(size)}
          color={foregroundColor}
        />
      ) : null}
    </>
  );

  if (!isMobileChipPressable(variant)) {
    return (
      <View
        accessible
        accessibilityLabel={accessibilityLabel}
        testID={testID}
        style={[
          ...frameStyle,
          createNemuButtonDepthStyle(
            getNemuButtonDepthVisual({
              variant: getMobileChipDepthVariant(selected),
              state: "rest",
              scheme,
              tokens,
            }),
          ),
        ]}
      >
        {content}
      </View>
    );
  }

  return (
    <NemuPressable
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityRole={accessibilityRole}
      accessibilityState={resolvedAccessibilityState}
      buttonDepth={getMobileChipDepthVariant(selected)}
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
        ...frameStyle,
        {
          opacity: disabled ? 0.58 : 1,
        },
      ]}
    >
      {content}
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
  rootSmall: {
    minHeight: 22,
    maxWidth: 132,
    gap: 5,
    paddingHorizontal: 7,
  },
  // A bare glyph keeps the 30pt pill square instead of inheriting the
  // label-sized horizontal padding.
  rootIcon: {
    minWidth: 30,
    paddingHorizontal: 7,
  },
  rootIconSmall: {
    minWidth: 22,
    paddingHorizontal: 5,
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
  iconImageSmall: {
    width: 13,
    height: 13,
    borderRadius: 3,
  },
  label: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: nemuFontWeight.medium,
    letterSpacing: 0,
  },
  labelSmall: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: nemuFontWeight.semibold,
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
