import { useEffect, useRef, useState } from "react";
import {
  Animated,
  ActivityIndicator,
  Easing,
  Platform,
  type AccessibilityRole,
  type AccessibilityState,
  StyleSheet,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Svg, { Path } from "react-native-svg";
import { createNemuButtonDepthStyle } from "@/design/nemuButtonDepthStyle";
import {
  getNemuButtonPressMotion,
  getNemuButtonDepthVisual,
  getNemuButtonDefaultCrossAxisAlignment,
  hasNemuButtonShadowOverride,
  resolveNemuButtonTouchTargetStyle,
  shouldAnimateNemuButtonPress,
  splitNemuButtonStyle,
  type NemuButtonDepthVariant,
} from "@/design/nemuButtonDepth";
import type { NemuPressableHapticFeedback } from "@/lib/nemuPressable";
import { resolveNemuButtonAccessibility } from "@/lib/nemuPressable";
import { nemuFontWeight, nemuMaxFontSizeMultiplier } from "@/design/typography";
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

/** Shared geometry for the high-emphasis CTA used by onboarding and page empty states. */
export const NEMU_PROMINENT_CTA_SIZE: NemuButtonSize = "lg";

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
  sm: 16,
  lg: 16,
  icon: 16,
  "icon-xs": 12,
  "icon-sm": 16,
  "icon-lg": 16,
};

const buttonLabelStyles: Record<NemuButtonSize, TextStyle> = {
  default: { fontSize: 14, lineHeight: 20 },
  xs: { fontSize: 12, lineHeight: 16 },
  sm: { fontSize: 14, lineHeight: 20 },
  lg: { fontSize: 14, lineHeight: 20 },
  icon: { fontSize: 14, lineHeight: 20 },
  "icon-xs": { fontSize: 12, lineHeight: 16 },
  "icon-sm": { fontSize: 14, lineHeight: 20 },
  "icon-lg": { fontSize: 14, lineHeight: 20 },
};

const buttonRadii: Record<NemuButtonSize, number> = {
  default: 10,
  xs: 6,
  sm: 8,
  lg: 10,
  icon: 10,
  "icon-xs": 6,
  "icon-sm": 8,
  "icon-lg": 10,
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
  const { reduceMotion, scheme, tokens } = useNemuTheme();
  const [surfacePressProgress] = useState(() => new Animated.Value(0));
  const pressedRef = useRef(false);
  const {
    accessibilityState: resolvedAccessibilityState,
    disabled: resolvedDisabled,
  } = resolveNemuButtonAccessibility({
    accessibilityState,
    disabled,
    loading,
  });
  const resolvedVariant = resolveButtonVariant(variant, tone);
  const depthVariant = variantDepthMap[resolvedVariant];
  const restVisual = getNemuButtonDepthVisual({
    variant: depthVariant,
    state: "rest",
    scheme,
    tokens,
  });
  const pressedVisual = getNemuButtonDepthVisual({
    variant: depthVariant,
    state: "pressed",
    scheme,
    tokens,
  });
  const restForegroundColor = restVisual.foregroundColor ?? tokens.foreground;
  const pressedForegroundColor = pressedVisual.foregroundColor ?? tokens.foreground;
  const sizeStyle = buttonSizeStyles[size];
  const iconSize = buttonIconSizes[size];
  const iconOnly = size.startsWith("icon");
  const surfaceRadius = buttonRadii[size];
  const flattenedContainerStyle = StyleSheet.flatten(containerStyle);
  const touchTargetStyle = resolveNemuButtonTouchTargetStyle({
    callerStyle: flattenedContainerStyle,
    platform: Platform.OS,
  });
  const {
    layoutStyle: callerLayoutStyle,
    surfaceShapeStyle: callerSurfaceShapeStyle,
    surfaceStyle: callerSurfaceStyle,
  } = splitNemuButtonStyle(StyleSheet.flatten(style));
  const callerOverridesShadow = hasNemuButtonShadowOverride(callerSurfaceStyle);
  const pressMotion = getNemuButtonPressMotion(depthVariant);
  const animatePressMotion = shouldAnimateNemuButtonPress(reduceMotion);
  const [easeX1, easeY1, easeX2, easeY2] = pressMotion.easing;
  const animateSurface = (toValue: 0 | 1) => {
    surfacePressProgress.stopAnimation();
    if (!animatePressMotion) {
      surfacePressProgress.setValue(toValue);
      return;
    }
    Animated.timing(surfacePressProgress, {
      toValue,
      duration: pressMotion.duration,
      easing: Easing.bezier(easeX1, easeY1, easeX2, easeY2),
      useNativeDriver: false,
    }).start();
  };
  const surfaceBackgroundColor = surfacePressProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [restVisual.backgroundColor, pressedVisual.backgroundColor],
  });
  const surfaceBorderColor = surfacePressProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [restVisual.borderColor, pressedVisual.borderColor],
  });
  const foregroundColor = surfacePressProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [restForegroundColor, pressedForegroundColor],
  });
  const restShadowOpacity = surfacePressProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });

  useEffect(() => {
    if (!resolvedDisabled) return;
    pressedRef.current = false;
    surfacePressProgress.stopAnimation();
    surfacePressProgress.setValue(0);
  }, [resolvedDisabled, surfacePressProgress]);

  useEffect(() => {
    if (animatePressMotion) return;
    surfacePressProgress.stopAnimation();
    surfacePressProgress.setValue(
      pressedRef.current && !resolvedDisabled ? 1 : 0,
    );
  }, [animatePressMotion, resolvedDisabled, surfacePressProgress]);

  return (
    <NemuPressable
      accessibilityRole={accessibilityRole ?? "button"}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={resolvedAccessibilityState}
      disabled={resolvedDisabled}
      hapticFeedback={
        hapticFeedback ??
        (resolvedVariant === "destructive" ? "warning" : "press")
      }
      onPress={onPress}
      pressedScale={pressMotion.scale}
      pressAnimationDuration={pressMotion.duration}
      pressAnimationEnabled={animatePressMotion}
      hitSlop={0}
      containerStyle={[
        styles.touchTarget,
        { alignItems: getNemuButtonDefaultCrossAxisAlignment(iconOnly) },
        touchTargetStyle,
      ]}
      onPressIn={() => {
        pressedRef.current = true;
        animateSurface(1);
      }}
      onPressOut={() => {
        pressedRef.current = false;
        animateSurface(0);
      }}
      style={[
        styles.button,
        sizeStyle,
        {
          opacity: resolvedDisabled ? 0.5 : 1,
        },
        callerLayoutStyle,
      ]}
      testID={testID}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.surface,
          createNemuButtonDepthStyle(restVisual),
            {
              backgroundColor: surfaceBackgroundColor,
              borderColor: surfaceBorderColor,
              borderRadius: surfaceRadius,
              boxShadow: "none",
            },
            callerSurfaceStyle,
          ]}
        />
      {!callerOverridesShadow ? (
        <>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.surface,
              styles.shadowSurface,
              {
                borderRadius: surfaceRadius,
                boxShadow: restVisual.boxShadow,
                opacity: restShadowOpacity,
              },
              callerSurfaceShapeStyle,
            ]}
          />
          <Animated.View
            pointerEvents="none"
            style={[
              styles.surface,
              styles.shadowSurface,
              {
                borderRadius: surfaceRadius,
                boxShadow: pressedVisual.boxShadow,
                opacity: surfacePressProgress,
              },
              callerSurfaceShapeStyle,
            ]}
          />
        </>
      ) : null}
      {loading ? (
        <ActivityIndicator size="small" color={restForegroundColor} />
      ) : null}
      {!loading && icon === "add-outline" ? (
        <View style={{ height: iconSize, width: iconSize }}>
          <NemuWebPlusIcon size={iconSize} color={restForegroundColor} />
          {restForegroundColor !== pressedForegroundColor ? (
            <Animated.View
              pointerEvents="none"
              style={[styles.foregroundOverlay, { opacity: surfacePressProgress }]}
            >
              <NemuWebPlusIcon size={iconSize} color={pressedForegroundColor} />
            </Animated.View>
          ) : null}
        </View>
      ) : !loading && icon ? (
        <View style={{ height: iconSize, width: iconSize }}>
          <Ionicons name={icon} size={iconSize} color={restForegroundColor} />
          {restForegroundColor !== pressedForegroundColor ? (
            <Animated.View
              pointerEvents="none"
              style={[styles.foregroundOverlay, { opacity: surfacePressProgress }]}
            >
              <Ionicons name={icon} size={iconSize} color={pressedForegroundColor} />
            </Animated.View>
          ) : null}
        </View>
      ) : null}
      {label ? (
        <Animated.Text
          maxFontSizeMultiplier={nemuMaxFontSizeMultiplier}
          style={[
            styles.label,
            buttonLabelStyles[size],
            { color: foregroundColor },
            textStyle,
          ]}
        >
          {label}
        </Animated.Text>
      ) : null}
    </NemuPressable>
  );
}

const styles = StyleSheet.create({
  touchTarget: {
    justifyContent: "center",
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  surface: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  shadowSurface: {
    backgroundColor: "transparent",
    borderColor: "transparent",
    borderWidth: 0,
  },
  foregroundOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  label: {
    fontWeight: nemuFontWeight.medium,
    letterSpacing: 0,
    textAlign: "center",
  },
});
