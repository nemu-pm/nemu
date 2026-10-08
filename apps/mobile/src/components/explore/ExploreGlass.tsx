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
const CAPSULE_GLYPH = 16;
const CAPSULE_GAP = 7;

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
          <NemuRingSpinner size={15} color={ink} accessibilityLabel={accessibilityLabel ?? label} />
        ) : (
          iconNode ?? (icon ? <Ionicons name={icon} size={16} color={ink} /> : null)
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
          <NemuRingSpinner size={16} color={ink} accessibilityLabel={accessibilityLabel} />
        ) : (
          <Ionicons name={icon} size={19} color={ink} />
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

/**
 * Two-way glass switch (e.g. Shelf | Grid): one glass capsule whose selected
 * side is a neutral raised pill, like the system segmented control, so it
 * sits quietly on a cover-coloured page.
 */
export function ExploreGlassSegmented<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
}) {
  const { tokens } = useNemuTheme();
  // The selected option is the theme's primary fill, as the app's other
  // segmented controls draw it.
  return (
    <ExploreGlass style={styles.segmented}>
      {/* Not a labelled group: iOS would make it one element and hide the
          options from VoiceOver. Each option names the switch instead. */}
      <View style={styles.segmentedRow}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <NemuPressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              accessibilityHint={accessibilityLabel}
              accessibilityState={{ selected }}
              hapticFeedback="selection"
              pressedScale={0.96}
              onPress={() => {
                if (!selected) onChange(option.value);
              }}
              style={[
                styles.segment,
                selected ? { backgroundColor: tokens.primary } : null,
              ]}
            >
              <NemuText
                numberOfLines={1}
                maxFontSizeMultiplier={1.3}
                color={selected ? tokens.primaryForeground : tokens.mutedForeground}
                style={styles.segmentText}
              >
                {option.label}
              </NemuText>
            </NemuPressable>
          );
        })}
      </View>
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
    fontSize: 16,
    lineHeight: 21,
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
  segmented: {
    padding: 3,
  },
  segmentedRow: {
    flexDirection: "row",
  },
  segment: {
    minHeight: 30,
    minWidth: 58,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  // One weight for both states, so the segments never change width.
  segmentText: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: nemuFontWeight.semibold,
  },
  // Dims the content only: UIKit drops glass under a translucent ancestor.
  disabled: {
    opacity: 0.55,
  },
});
