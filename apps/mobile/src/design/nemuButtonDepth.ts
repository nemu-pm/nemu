import type { ViewStyle } from "react-native";
import type { NemuColorScheme, NemuTokens } from "./tokens";
import {
  resolveNemuWebButtonSurface,
  type NemuWebButtonSchemePalette,
} from "./nemuWebButtonPalette";

export type NemuButtonDepthVariant =
  | "primary"
  | "outline"
  | "secondary"
  | "ghost"
  | "destructive"
  | "toolbar"
  | "toolbar-danger"
  | "chip-selected"
  | "chip"
  | "elevated";

export type NemuButtonDepthState = "rest" | "pressed";

export const NEMU_WEB_BUTTON_PRESS_MOTION = {
  duration: 180,
  easing: [0.25, 0.1, 0.25, 1] as const,
  scale: 0.97,
} as const;

export const NEMU_WEB_GHOST_BUTTON_PRESS_MOTION = {
  ...NEMU_WEB_BUTTON_PRESS_MOTION,
  duration: 150,
} as const;

export function getNemuButtonPressMotion(variant: NemuButtonDepthVariant) {
  return variant === "ghost"
    ? NEMU_WEB_GHOST_BUTTON_PRESS_MOTION
    : NEMU_WEB_BUTTON_PRESS_MOTION;
}

export function shouldAnimateNemuButtonPress(
  reduceMotion: boolean | null,
): boolean {
  return reduceMotion === false;
}

export function getNemuButtonMinimumTargetSize(platform: string): number {
  return platform === "android" ? 48 : 44;
}

export function getNemuButtonDefaultCrossAxisAlignment(
  iconOnly: boolean,
): "center" | "stretch" {
  return iconOnly ? "center" : "stretch";
}

export function resolveNemuButtonMinimumTargetSize({
  callerMinimum,
  platform,
}: {
  callerMinimum: unknown;
  platform: string;
}): number {
  const nativeMinimum = getNemuButtonMinimumTargetSize(platform);
  return typeof callerMinimum === "number" && Number.isFinite(callerMinimum)
    ? Math.max(nativeMinimum, callerMinimum)
    : nativeMinimum;
}

function finiteDimension(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * Preserves caller layout while making the actual Pressable frame at least the
 * native target size. Percentage/auto minima and maxima cannot prove that
 * invariant, so they are removed from the resolved frame instead of overriding
 * the final 44pt/48dp constraint.
 */
export function resolveNemuButtonTouchTargetStyle({
  callerStyle,
  platform,
}: {
  callerStyle?: ViewStyle;
  platform: string;
}): ViewStyle {
  const {
    minHeight: callerMinHeight,
    minWidth: callerMinWidth,
    maxHeight: callerMaxHeight,
    maxWidth: callerMaxWidth,
    ...layoutStyle
  } = callerStyle ?? {};
  const minimum = getNemuButtonMinimumTargetSize(platform);
  const numericMaxHeight = finiteDimension(callerMaxHeight);
  const numericMaxWidth = finiteDimension(callerMaxWidth);

  return {
    ...layoutStyle,
    ...(numericMaxHeight === undefined
      ? null
      : { maxHeight: Math.max(minimum, numericMaxHeight) }),
    ...(numericMaxWidth === undefined
      ? null
      : { maxWidth: Math.max(minimum, numericMaxWidth) }),
    minHeight: resolveNemuButtonMinimumTargetSize({
      callerMinimum: callerMinHeight,
      platform,
    }),
    minWidth: resolveNemuButtonMinimumTargetSize({
      callerMinimum: callerMinWidth,
      platform,
    }),
  };
}

const NEMU_BUTTON_SURFACE_STYLE_KEYS = new Set<string>([
  "backgroundColor",
  "borderBlockColor",
  "borderBlockEndColor",
  "borderBlockStartColor",
  "borderBottomColor",
  "borderBottomEndRadius",
  "borderBottomLeftRadius",
  "borderBottomRightRadius",
  "borderBottomStartRadius",
  "borderBottomWidth",
  "borderColor",
  "borderCurve",
  "borderEndColor",
  "borderEndEndRadius",
  "borderEndStartRadius",
  "borderEndWidth",
  "borderLeftColor",
  "borderLeftWidth",
  "borderRadius",
  "borderRightColor",
  "borderRightWidth",
  "borderStartColor",
  "borderStartEndRadius",
  "borderStartStartRadius",
  "borderStartWidth",
  "borderStyle",
  "borderTopColor",
  "borderTopEndRadius",
  "borderTopLeftRadius",
  "borderTopRightRadius",
  "borderTopStartRadius",
  "borderTopWidth",
  "borderWidth",
  "boxShadow",
  "elevation",
  "shadowColor",
  "shadowOffset",
  "shadowOpacity",
  "shadowRadius",
]);

const NEMU_BUTTON_SURFACE_SHAPE_STYLE_KEYS = new Set<string>([
  "borderBottomEndRadius",
  "borderBottomLeftRadius",
  "borderBottomRightRadius",
  "borderBottomStartRadius",
  "borderCurve",
  "borderEndEndRadius",
  "borderEndStartRadius",
  "borderRadius",
  "borderStartEndRadius",
  "borderStartStartRadius",
  "borderTopEndRadius",
  "borderTopLeftRadius",
  "borderTopRightRadius",
  "borderTopStartRadius",
]);

const NEMU_BUTTON_SHADOW_STYLE_KEYS = [
  "boxShadow",
  "elevation",
  "shadowColor",
  "shadowOffset",
  "shadowOpacity",
  "shadowRadius",
] as const;

export function hasNemuButtonShadowOverride(style: ViewStyle): boolean {
  return NEMU_BUTTON_SHADOW_STYLE_KEYS.some((key) => style[key] !== undefined);
}

/** Keeps the long-standing `style` API while routing paint to the new surface. */
export function splitNemuButtonStyle(style?: ViewStyle): {
  layoutStyle: ViewStyle;
  surfaceShapeStyle: ViewStyle;
  surfaceStyle: ViewStyle;
} {
  const layoutStyle: ViewStyle = {};
  const surfaceShapeStyle: ViewStyle = {};
  const surfaceStyle: ViewStyle = {};

  for (const [key, value] of Object.entries(style ?? {})) {
    if (value === undefined) continue;
    const target = NEMU_BUTTON_SURFACE_STYLE_KEYS.has(key)
      ? surfaceStyle
      : layoutStyle;
    (target as Record<string, unknown>)[key] = value;
    if (NEMU_BUTTON_SURFACE_SHAPE_STYLE_KEYS.has(key)) {
      (surfaceShapeStyle as Record<string, unknown>)[key] = value;
      // The inner content frame owns overflow clipping. Keep its shape in sync
      // with the painted surfaces so caller pills/custom corners do not clip
      // against the component's default radius.
      (layoutStyle as Record<string, unknown>)[key] = value;
    }
  }

  return { layoutStyle, surfaceShapeStyle, surfaceStyle };
}

export type NemuButtonDepthVisual = {
  backgroundColor: string;
  borderColor: string;
  boxShadow: string;
  foregroundColor?: string;
};

const depthVariantPaletteKey: Record<
  Exclude<NemuButtonDepthVariant, "toolbar" | "toolbar-danger" | "chip" | "chip-selected">,
  keyof NemuWebButtonSchemePalette
> = {
  primary: "primary",
  outline: "outline",
  secondary: "secondary",
  ghost: "ghost",
  destructive: "destructive",
  elevated: "elevated",
};

function primaryPressedColor(dark: boolean): string {
  // Web: oklch(from var(--primary) calc(l + 0.05|0.08) c h)
  return dark ? "#7a9eff" : "#6689ff";
}

export function getNemuButtonDepthVisual({
  variant,
  state,
  scheme,
  tokens,
}: {
  variant: NemuButtonDepthVariant;
  state: NemuButtonDepthState;
  scheme: NemuColorScheme;
  tokens: NemuTokens;
}): NemuButtonDepthVisual {
  const pressed = state === "pressed";
  const paletteState = pressed ? "pressed" : "rest";
  const dark = scheme === "dark";
  const tokenOverrides = {
    primary: tokens.primary,
    primaryPressed: primaryPressedColor(dark),
  };

  switch (variant) {
    case "toolbar":
      return toolbarDepthVisual({ pressed, scheme, tokens, danger: false, tokenOverrides });
    case "toolbar-danger":
      return toolbarDepthVisual({ pressed, scheme, tokens, danger: true, tokenOverrides });
    case "chip-selected":
      return chipSelectedDepthVisual({ pressed, scheme, tokens, tokenOverrides });
    case "chip":
      return chipDepthVisual({ pressed, scheme, tokens, tokenOverrides });
    default: {
      const surface = resolveNemuWebButtonSurface(
        depthVariantPaletteKey[variant],
        scheme,
        paletteState,
        tokenOverrides,
      );
      return {
        ...surface,
        foregroundColor: depthForegroundColor(variant, pressed, tokens),
      };
    }
  }
}

function depthForegroundColor(
  variant: keyof typeof depthVariantPaletteKey,
  pressed: boolean,
  tokens: NemuTokens,
): string {
  switch (variant) {
    case "primary":
      return tokens.primaryForeground;
    case "outline":
    case "elevated":
      return tokens.foreground;
    case "secondary":
      return tokens.secondaryForeground;
    case "ghost":
      return pressed ? tokens.foreground : tokens.mutedForeground;
    case "destructive":
      return tokens.danger;
  }
}

function toolbarDepthVisual({
  pressed,
  scheme,
  tokens,
  danger,
  tokenOverrides,
}: {
  pressed: boolean;
  scheme: NemuColorScheme;
  tokens: NemuTokens;
  danger: boolean;
  tokenOverrides: { primary: string; primaryPressed: string };
}): NemuButtonDepthVisual {
  const outline = resolveNemuWebButtonSurface(
    "outline",
    scheme,
    pressed ? "pressed" : "rest",
    tokenOverrides,
  );
  return {
    ...outline,
    backgroundColor: danger ? `${tokens.danger}24` : tokens.toolbarAction,
    borderColor: danger ? `${tokens.danger}40` : tokens.toolbarActionBorder,
    foregroundColor: danger ? tokens.danger : tokens.primary,
  };
}

function chipSelectedDepthVisual({
  pressed,
  scheme,
  tokens,
  tokenOverrides,
}: {
  pressed: boolean;
  scheme: NemuColorScheme;
  tokens: NemuTokens;
  tokenOverrides: { primary: string; primaryPressed: string };
}): NemuButtonDepthVisual {
  const primary = resolveNemuWebButtonSurface(
    "primary",
    scheme,
    pressed ? "pressed" : "rest",
    tokenOverrides,
  );
  return {
    ...primary,
    backgroundColor: pressed ? tokenOverrides.primaryPressed : tokens.primary,
    borderColor: scheme === "dark" ? "rgba(143,181,255,0.50)" : "rgba(116,153,255,0.50)",
    foregroundColor: tokens.primaryForeground,
  };
}

function chipDepthVisual({
  pressed,
  scheme,
  tokens,
  tokenOverrides,
}: {
  pressed: boolean;
  scheme: NemuColorScheme;
  tokens: NemuTokens;
  tokenOverrides: { primary: string; primaryPressed: string };
}): NemuButtonDepthVisual {
  if (!pressed) {
    return {
      backgroundColor: scheme === "dark" ? "rgba(34,36,40,0.50)" : "rgba(237,240,248,0.50)",
      borderColor: tokens.border,
      boxShadow: "none",
      foregroundColor: tokens.mutedForeground,
    };
  }
  const outline = resolveNemuWebButtonSurface("outline", scheme, "pressed", tokenOverrides);
  return {
    ...outline,
    foregroundColor: tokens.mutedForeground,
  };
}
