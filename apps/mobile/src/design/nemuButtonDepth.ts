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

function primaryPressedColor(tokens: NemuTokens, dark: boolean): string {
  // Web: oklch(from var(--primary) calc(l + 0.05|0.08) c h)
  return dark ? "#6f91fd" : "#6689ff";
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
    primaryPressed: primaryPressedColor(tokens, dark),
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
