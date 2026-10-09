import { useState, type ComponentProps, type ReactNode } from "react";
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  nemuColorWithAlpha,
  nemuFontWeight,
  NemuPressable,
  NemuRingSpinner,
  NemuText,
  radius,
  useNemuTheme,
} from "@/design-system";
import { GlassView, glassViewAvailable } from "../../../modules/nemu-window-layout";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

const GLASS_TEXT_MAX_SCALE = 1.4;
/** The capsule's side padding, glyph and glyph–label gap (`styles.capsuleInner`). */
const CAPSULE_PADDING_X = 18;
const CAPSULE_GLYPH = 22;
const CAPSULE_GAP = 9;

/**
 * System Liquid Glass (UIKit `UIGlassEffect`, iOS 26) for the design-explore
 * surfaces. Where the binary has no glass it paints a quiet translucent fill,
 * never a faux blur. `cornerRadius` 0 = capsule.
 */
export function ExploreGlass({
  children,
  style,
  tintColor,
  cornerRadius = 0,
  interactive = false,
  pointerEvents,
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  tintColor?: string;
  cornerRadius?: number;
  interactive?: boolean;
  pointerEvents?: "auto" | "none" | "box-none" | "box-only";
}) {
  const { scheme } = useNemuTheme();
  if (!glassViewAvailable) {
    return (
      <View
        pointerEvents={pointerEvents}
        style={[
          {
            borderRadius: cornerRadius || 999,
            backgroundColor:
              tintColor ?? (scheme === "dark" ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.7)"),
          },
          style,
        ]}
      >
        {children}
      </View>
    );
  }
  return (
    <GlassView
      style={style}
      pointerEvents={pointerEvents}
      tintColor={tintColor}
      cornerRadius={cornerRadius}
      interactive={interactive}
    >
      {children}
    </GlassView>
  );
}

/**
 * A glass capsule button. `prominent` tints the glass with `tint` (the
 * primary action, like a `.glassProminent` button); otherwise it is clear
 * system glass. Every press gives the light selection impact.
 */
export function ExploreGlassButton({
  label,
  icon,
  iconNode,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  prominent = false,
  tint,
  ink,
  busy = false,
  disabled = false,
  style,
  shortLabel,
}: {
  label: string;
  /**
   * Said instead of `label` when the whole label does not fit the capsule
   * ("Continue" for "Continue Chapter 131" in a narrow pane): a label is
   * never cut off with an ellipsis while a shorter one would fit.
   */
  shortLabel?: string;
  icon?: IoniconName;
  iconNode?: ReactNode;
  onPress: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  prominent?: boolean;
  /** Glass tint for a prominent button. */
  tint?: string;
  /** Label and glyph colour. */
  ink: string;
  busy?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const [innerWidth, setInnerWidth] = useState<number | null>(null);
  const [labelWidth, setLabelWidth] = useState<number | null>(null);
  const hasGlyph = Boolean(busy || iconNode || icon);
  const fits =
    !shortLabel ||
    innerWidth === null ||
    labelWidth === null ||
    labelWidth <= innerWidth - CAPSULE_PADDING_X * 2 - (hasGlyph ? CAPSULE_GLYPH + CAPSULE_GAP : 0);
  const shown = fits ? label : (shortLabel ?? label);
  return (
    <ExploreGlass
      interactive
      // A disabled prominent button drops its tint rather than fading it: a
      // faded tint on a bright colour (a yellow card) left its label at 3:1.
      // The caller passes an ink that reads on the page for that case.
      tintColor={prominent && !disabled ? tint : undefined}
      style={[styles.capsule, style]}
    >
      {prominent && !disabled && tint ? (
        // The colour itself, opaque: tinted glass lets the page show through,
        // and a button in the page's own hue then melted into it. The glass
        // keeps its rim and its press response around the fill.
        <View
          pointerEvents="none"
          style={[
            styles.prominentFill,
            // A lit rim along the top, so the button reads as raised off a
            // page of its own hue.
            { backgroundColor: tint, borderColor: "rgba(255,255,255,0.28)" },
          ]}
        />
      ) : null}
      <NemuPressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ busy: busy || undefined, disabled: disabled || undefined }}
        disabled={disabled}
        hapticFeedback="press"
        pressedScale={0.97}
        onPress={onPress}
        onLayout={
          shortLabel
            ? (event: LayoutChangeEvent) => {
                const next = Math.round(event.nativeEvent.layout.width);
                setInnerWidth((current) => (current === next ? current : next));
              }
            : undefined
        }
        style={[styles.capsuleInner, disabled && !prominent ? styles.disabled : null]}
      >
        {busy ? (
          <NemuRingSpinner size={20} color={ink} accessibilityLabel={accessibilityLabel ?? label} />
        ) : (
          iconNode ?? (icon ? <Ionicons name={icon} size={CAPSULE_GLYPH} color={ink} /> : null)
        )}
        <NemuText
          numberOfLines={1}
          maxFontSizeMultiplier={GLASS_TEXT_MAX_SCALE}
          color={ink}
          style={styles.capsuleText}
        >
          {shown}
        </NemuText>
        {shortLabel ? (
          // The whole label's natural width, measured off screen.
          <View pointerEvents="none" style={styles.measureBox} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <NemuText
              numberOfLines={1}
              maxFontSizeMultiplier={GLASS_TEXT_MAX_SCALE}
              style={[styles.capsuleText, styles.measureText]}
              onLayout={(event: LayoutChangeEvent) => {
                const next = Math.ceil(event.nativeEvent.layout.width);
                setLabelWidth((current) => (current === next ? current : next));
              }}
            >
              {label}
            </NemuText>
          </View>
        ) : null}
      </NemuPressable>
    </ExploreGlass>
  );
}

/**
 * The glyph of a round glass button fills 40–45 % of its diameter and is
 * drawn heavy: the filled Ionicons shape where the outline one has a twin.
 */
const ICON_BUTTON_GLYPH = 24;
function boldIconName(icon: IoniconName): IoniconName {
  if (!icon.endsWith("-outline")) return icon;
  const filled = icon.slice(0, -"-outline".length) as IoniconName;
  return filled in Ionicons.glyphMap ? filled : icon;
}

/** A round glass icon button (44 pt target). */
export function ExploreGlassIconButton({
  icon,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  ink,
  tint,
  busy = false,
  disabled = false,
  size = 46,
}: {
  icon: IoniconName;
  onPress: () => void;
  accessibilityLabel: string;
  accessibilityHint?: string;
  ink: string;
  tint?: string;
  busy?: boolean;
  disabled?: boolean;
  size?: number;
}) {
  return (
    <ExploreGlass
      interactive
      tintColor={tint}
      style={{ width: size, height: size }}
    >
      <NemuPressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ busy: busy || undefined, disabled: disabled || undefined }}
        disabled={disabled}
        hapticFeedback="press"
        pressedScale={0.94}
        onPress={onPress}
        // The press target, not just its content, fills the glass.
        containerStyle={styles.fill}
        style={[styles.iconInner, disabled ? styles.disabled : null]}
      >
        {busy ? (
          <NemuRingSpinner size={22} color={ink} accessibilityLabel={accessibilityLabel} />
        ) : (
          <Ionicons name={boldIconName(icon)} size={ICON_BUTTON_GLYPH} color={ink} />
        )}
      </NemuPressable>
    </ExploreGlass>
  );
}

/** A glass chip; pressable when `onPress` is given. */
export function ExploreGlassChip({
  label,
  ink,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  selected = false,
}: {
  label: string;
  ink: string;
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  selected?: boolean;
}) {
  const { tokens } = useNemuTheme();
  const text = (
    <NemuText
      numberOfLines={1}
      maxFontSizeMultiplier={GLASS_TEXT_MAX_SCALE}
      color={selected ? tokens.primaryForeground : ink}
      style={styles.chipText}
    >
      {label}
    </NemuText>
  );
  return (
    <ExploreGlass
      interactive={Boolean(onPress)}
      tintColor={selected ? nemuColorWithAlpha(tokens.primary, 0.85) : undefined}
      style={styles.chip}
    >
      {onPress ? (
        <NemuPressable
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel ?? label}
          accessibilityHint={accessibilityHint}
          accessibilityState={{ selected }}
          hapticFeedback="press"
          pressedScale={0.96}
          onPress={onPress}
          style={styles.chipInner}
        >
          {text}
        </NemuPressable>
      ) : (
        <View accessible accessibilityLabel={accessibilityLabel ?? label} style={styles.chipInner}>
          {text}
        </View>
      )}
    </ExploreGlass>
  );
}

const styles = StyleSheet.create({
  capsule: {
    minHeight: 46,
  },
  prominentFill: {
    position: "absolute",
    top: 1,
    right: 1,
    bottom: 1,
    left: 1,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  capsuleInner: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: CAPSULE_GAP,
    paddingHorizontal: CAPSULE_PADDING_X,
  },
  measureBox: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 2000,
    opacity: 0,
    flexDirection: "row",
  },
  measureText: {
    flexShrink: 0,
  },
  capsuleText: {
    flexShrink: 1,
    // Body size, semibold: the weight the system's own prominent buttons use.
    fontSize: 17,
    lineHeight: 22,
    fontWeight: nemuFontWeight.semibold,
  },
  fill: {
    flex: 1,
  },
  iconInner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  chip: {
    minHeight: 32,
  },
  chipInner: {
    minHeight: 32,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  chipText: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: nemuFontWeight.medium,
  },
  // Dims the content only: UIKit drops glass under a translucent ancestor.
  disabled: {
    opacity: 0.55,
  },
});
