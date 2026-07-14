import { useState } from "react";
import {
  ActivityIndicator,
  type AccessibilityRole,
  type AccessibilityState,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Svg, { Path } from "react-native-svg";
import { createNemuButtonDepthStyle } from "@/design/nemuButtonDepthStyle";
import {
  getNemuButtonDepthVisual,
  type NemuButtonDepthVariant,
} from "@/design/nemuButtonDepth";
import type { NemuPressableHapticFeedback } from "@/lib/nemuPressable";
import {
  nemuFontWeight,
  nemuMaxFontSizeMultiplier,
} from "@/design/typography";
import { useNemuTheme } from "@/design/useNemuTheme";
import { NemuPressable } from "./NemuPressable";

export type NemuButtonTone = "primary" | "secondary" | "danger" | "plain";
export type NemuButtonVariant =
  | "default"
  | "outline"
  | "secondary"
  | "ghost"
  | "destructive";
export type NemuButtonSize =
  | "default"
  | "xs"
  | "sm"
  | "lg"
  | "icon"
  | "icon-xs"
  | "icon-sm"
  | "icon-lg";

type NemuButtonProps = {
  label?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  variant?: NemuButtonVariant;
  tone?: NemuButtonTone;
  size?: NemuButtonSize;
  disabled?: boolean;
  loading?: boolean;
  hapticFeedback?: NemuPressableHapticFeedback;
  accessibilityRole?: AccessibilityRole;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityState?: AccessibilityState;
  containerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  onPress: () => void;
  testID?: string;
};

const toneVariantMap: Record<NemuButtonTone, NemuButtonVariant> = {
  primary: "default",
  secondary: "secondary",
  danger: "destructive",
  plain: "ghost",
};

const variantDepthMap: Record<NemuButtonVariant, NemuButtonDepthVariant> = {
  default: "primary",
  outline: "outline",
  secondary: "secondary",
  ghost: "ghost",
  destructive: "destructive",
};

const buttonSizeStyles: Record<NemuButtonSize, ViewStyle> = {
  default: {
    minHeight: 36,
    minWidth: 36,
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  xs: {
    minHeight: 24,
    minWidth: 24,
    gap: 4,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  sm: {
    minHeight: 32,
    minWidth: 32,
    gap: 6,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  lg: {
    minHeight: 40,
    minWidth: 40,
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  icon: {
    width: 36,
    height: 36,
    minWidth: 36,
    paddingHorizontal: 0,
  },
  "icon-xs": {
    width: 24,
    height: 24,
    minWidth: 24,
    borderRadius: 6,
    paddingHorizontal: 0,
  },
  "icon-sm": {
    width: 32,
    height: 32,
    minWidth: 32,
    borderRadius: 8,
    paddingHorizontal: 0,
  },
  "icon-lg": {
    width: 40,
    height: 40,
    minWidth: 40,
    paddingHorizontal: 0,
  },
};

const buttonIconSizes: Record<NemuButtonSize, number> = {
  default: 16,
  xs: 12,
  sm: 15,
  lg: 17,
  icon: 17,
  "icon-xs": 12,
  "icon-sm": 15,
  "icon-lg": 18,
};

function resolveButtonVariant(
  variant: NemuButtonVariant | undefined,
  tone: NemuButtonTone | undefined,
) {
  return variant ?? (tone ? toneVariantMap[tone] : "default");
}

function NemuWebPlusIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12.001 5.00003V19.002"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
      />
      <Path
        d="M19.002 12.002L4.99998 12.002"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
      />
    </Svg>
  );
}

export function NemuButton({
  label,
  icon,
  variant,
  tone,
  size = "default",
  disabled,
  loading,
  hapticFeedback,
  accessibilityRole,
  accessibilityLabel,
  accessibilityHint,
  accessibilityState,
  containerStyle,
  style,
  textStyle,
  onPress,
  testID,
}: NemuButtonProps) {
  const { scheme, tokens } = useNemuTheme();
  const [pressed, setPressed] = useState(false);
  const resolvedDisabled = Boolean(disabled || loading);
  const resolvedVariant = resolveButtonVariant(variant, tone);
  const depthVariant = variantDepthMap[resolvedVariant];
  const visual = getNemuButtonDepthVisual({
    variant: depthVariant,
    state: pressed && !resolvedDisabled ? "pressed" : "rest",
    scheme,
    tokens,
  });
  const foregroundColor = visual.foregroundColor ?? tokens.foreground;
  const sizeStyle = buttonSizeStyles[size];
  const iconSize = buttonIconSizes[size];

  return (
    <NemuPressable
      accessibilityRole={accessibilityRole ?? "button"}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{
        ...accessibilityState,
        disabled: resolvedDisabled || accessibilityState?.disabled,
        busy: loading || accessibilityState?.busy || undefined,
      }}
      disabled={resolvedDisabled}
      hapticFeedback={
        hapticFeedback ?? (resolvedVariant === "destructive" ? "warning" : "press")
      }
      onPress={onPress}
      pressedScale={0.97}
      containerStyle={containerStyle}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[
        styles.button,
        sizeStyle,
        createNemuButtonDepthStyle(visual),
        {
          opacity: resolvedDisabled ? 0.5 : 1,
        },
        style,
      ]}
      testID={testID}
    >
      {loading ? <ActivityIndicator size="small" color={foregroundColor} /> : null}
      {!loading && icon === "add-outline" ? (
        <NemuWebPlusIcon size={iconSize} color={foregroundColor} />
      ) : !loading && icon ? (
        <Ionicons name={icon} size={iconSize} color={foregroundColor} />
      ) : null}
      {label ? (
        <Text
          maxFontSizeMultiplier={nemuMaxFontSizeMultiplier}
          style={[styles.label, { color: foregroundColor }, textStyle]}
        >
          {label}
        </Text>
      ) : null}
    </NemuPressable>
  );
}

export function NemuIconButton(props: Omit<NemuButtonProps, "label"> & { icon: keyof typeof Ionicons.glyphMap }) {
  return (
    <View style={styles.iconButtonFrame}>
      <NemuButton size="icon" {...props} />
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  label: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: nemuFontWeight.medium,
    letterSpacing: 0,
    textAlign: "center",
  },
  iconButtonFrame: {
    width: 36,
    height: 36,
  },
});
