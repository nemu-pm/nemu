/**
 * Web-parity button surface palette for mobile.
 *
 * Source of truth: `src/index.css`
 * - `.btn-nemu-primary|outline|secondary|ghost|destructive`
 * - `.tabs-nemu-trigger[data-active]` / `.source-selector-item-active` (elevated)
 *
 * rgba values are tuned matches for the web oklch definitions (hue 269° glass family).
 */

export type NemuWebButtonSurface = {
  backgroundColor: string;
  borderColor: string;
  boxShadow: string;
};

export type NemuWebButtonSchemePalette = {
  primary: { rest: NemuWebButtonSurface; pressed: NemuWebButtonSurface };
  outline: { rest: NemuWebButtonSurface; pressed: NemuWebButtonSurface };
  secondary: { rest: NemuWebButtonSurface; pressed: NemuWebButtonSurface };
  ghost: { rest: NemuWebButtonSurface; pressed: NemuWebButtonSurface };
  destructive: { rest: NemuWebButtonSurface; pressed: NemuWebButtonSurface };
  elevated: { rest: NemuWebButtonSurface; pressed: NemuWebButtonSurface };
};

export const nemuWebButtonPalette: Record<"light" | "dark", NemuWebButtonSchemePalette> = {
  light: {
    primary: {
      rest: {
        backgroundColor: "var(--use-tokens-primary)",
        borderColor: "rgba(116,153,255,0.30)",
        boxShadow:
          "0px 1px 3px rgba(38,57,176,0.25), 0px 0px 1px rgba(62,89,210,0.20), inset 0px 0.5px 0px rgba(255,255,255,0.20)",
      },
      pressed: {
        backgroundColor: "var(--use-tokens-primary-pressed)",
        borderColor: "rgba(116,153,255,0.30)",
        boxShadow:
          "0px 2px 8px rgba(50,73,193,0.30), 0px 0px 1px rgba(62,89,210,0.25), inset 0px 0.5px 0px rgba(255,255,255,0.25)",
      },
    },
    outline: {
      rest: {
        backgroundColor: "rgba(249,250,254,0.65)",
        borderColor: "rgba(76,96,156,0.14)",
        boxShadow:
          "0px 1px 4px rgba(46,65,135,0.06), 0px 0px 1px rgba(46,65,135,0.08), inset 0px 0.5px 0px rgba(255,255,255,0.50)",
      },
      pressed: {
        backgroundColor: "rgba(249,250,254,0.80)",
        borderColor: "rgba(76,96,156,0.20)",
        boxShadow:
          "0px 2px 8px rgba(46,65,135,0.10), 0px 0px 1px rgba(46,65,135,0.12), inset 0px 0.5px 0px rgba(255,255,255,0.60)",
      },
    },
    secondary: {
      rest: {
        backgroundColor: "rgba(237,240,248,0.85)",
        borderColor: "rgba(76,96,156,0.12)",
        boxShadow:
          "0px 1px 3px rgba(46,65,135,0.05), 0px 0px 1px rgba(46,65,135,0.06), inset 0px 0.5px 0px rgba(255,255,255,0.60)",
      },
      pressed: {
        backgroundColor: "rgba(226,231,243,0.90)",
        borderColor: "rgba(76,96,156,0.12)",
        boxShadow:
          "0px 2px 6px rgba(46,65,135,0.08), 0px 0px 1px rgba(46,65,135,0.10), inset 0px 0.5px 0px rgba(255,255,255,0.70)",
      },
    },
    ghost: {
      rest: {
        backgroundColor: "transparent",
        borderColor: "transparent",
        boxShadow: "none",
      },
      pressed: {
        backgroundColor: "rgba(0,0,0,0.05)",
        borderColor: "rgba(0,0,0,0.06)",
        boxShadow: "inset 0px 0.5px 0px rgba(255,255,255,0.30)",
      },
    },
    destructive: {
      rest: {
        backgroundColor: "rgba(252,235,233,0.90)",
        borderColor: "rgba(217,77,67,0.20)",
        boxShadow:
          "0px 1px 3px rgba(217,77,67,0.10), 0px 0px 1px rgba(217,77,67,0.08), inset 0px 0.5px 0px rgba(255,255,255,0.45)",
      },
      pressed: {
        backgroundColor: "rgba(250,225,222,0.92)",
        borderColor: "rgba(217,77,67,0.28)",
        boxShadow:
          "0px 2px 8px rgba(217,77,67,0.15), 0px 0px 1px rgba(217,77,67,0.12), inset 0px 0.5px 0px rgba(255,255,255,0.50)",
      },
    },
    elevated: {
      rest: {
        backgroundColor: "rgba(252,253,255,0.92)",
        borderColor: "rgba(76,96,156,0.12)",
        boxShadow:
          "0px 1px 4px rgba(46,65,135,0.08), 0px 2px 8px rgba(0,0,0,0.04), inset 0px 0.5px 0px rgba(255,255,255,0.70)",
      },
      pressed: {
        backgroundColor: "rgba(249,250,254,0.80)",
        borderColor: "rgba(76,96,156,0.20)",
        boxShadow:
          "0px 2px 8px rgba(46,65,135,0.10), 0px 0px 1px rgba(46,65,135,0.12), inset 0px 0.5px 0px rgba(255,255,255,0.60)",
      },
    },
  },
  dark: {
    primary: {
      rest: {
        backgroundColor: "var(--use-tokens-primary)",
        borderColor: "rgba(143,181,255,0.25)",
        boxShadow:
          "0px 2px 8px rgba(0,0,0,0.35), 0px 0px 1px rgba(0,0,0,0.30), inset 0px 0.5px 0px rgba(255,255,255,0.12)",
      },
      pressed: {
        backgroundColor: "var(--use-tokens-primary-pressed)",
        borderColor: "rgba(143,181,255,0.25)",
        boxShadow:
          "0px 4px 12px rgba(0,0,0,0.40), 0px 0px 1px rgba(0,0,0,0.35), inset 0px 0.5px 0px rgba(255,255,255,0.15)",
      },
    },
    outline: {
      rest: {
        backgroundColor: "rgba(30,32,38,0.60)",
        borderColor: "rgba(93,99,114,0.18)",
        boxShadow:
          "0px 2px 8px rgba(0,0,0,0.30), 0px 0px 1px rgba(0,0,0,0.25), inset 0px 0.5px 0px rgba(255,255,255,0.05)",
      },
      pressed: {
        backgroundColor: "rgba(36,38,44,0.70)",
        borderColor: "rgba(93,99,114,0.22)",
        boxShadow:
          "0px 4px 12px rgba(0,0,0,0.35), 0px 0px 1px rgba(0,0,0,0.30), inset 0px 0.5px 0px rgba(255,255,255,0.06)",
      },
    },
    secondary: {
      rest: {
        backgroundColor: "rgba(34,36,40,0.70)",
        borderColor: "rgba(93,99,114,0.15)",
        boxShadow:
          "0px 2px 6px rgba(0,0,0,0.25), 0px 0px 1px rgba(0,0,0,0.20), inset 0px 0.5px 0px rgba(255,255,255,0.04)",
      },
      pressed: {
        backgroundColor: "rgba(40,42,48,0.75)",
        borderColor: "rgba(93,99,114,0.15)",
        boxShadow:
          "0px 3px 10px rgba(0,0,0,0.30), 0px 0px 1px rgba(0,0,0,0.25), inset 0px 0.5px 0px rgba(255,255,255,0.05)",
      },
    },
    ghost: {
      rest: {
        backgroundColor: "transparent",
        borderColor: "transparent",
        boxShadow: "none",
      },
      pressed: {
        backgroundColor: "rgba(255,255,255,0.08)",
        borderColor: "rgba(255,255,255,0.06)",
        boxShadow: "inset 0px 0.5px 0px rgba(255,255,255,0.05)",
      },
    },
    destructive: {
      rest: {
        backgroundColor: "rgba(238,113,105,0.35)",
        borderColor: "rgba(238,113,105,0.30)",
        boxShadow:
          "0px 2px 6px rgba(0,0,0,0.30), 0px 0px 1px rgba(0,0,0,0.25), inset 0px 0.5px 0px rgba(238,113,105,0.15)",
      },
      pressed: {
        backgroundColor: "rgba(238,113,105,0.40)",
        borderColor: "rgba(238,113,105,0.40)",
        boxShadow:
          "0px 4px 12px rgba(0,0,0,0.35), 0px 0px 8px rgba(238,113,105,0.15), inset 0px 0.5px 0px rgba(238,113,105,0.20)",
      },
    },
    elevated: {
      rest: {
        backgroundColor: "rgba(36,38,44,0.85)",
        borderColor: "rgba(255,255,255,0.10)",
        boxShadow:
          "0px 2px 8px rgba(0,0,0,0.30), 0px 4px 12px rgba(0,0,0,0.15), inset 0px 0.5px 0px rgba(255,255,255,0.06)",
      },
      pressed: {
        backgroundColor: "rgba(36,38,44,0.70)",
        borderColor: "rgba(93,99,114,0.22)",
        boxShadow:
          "0px 4px 12px rgba(0,0,0,0.35), 0px 0px 1px rgba(0,0,0,0.30), inset 0px 0.5px 0px rgba(255,255,255,0.06)",
      },
    },
  },
};

export function resolveNemuWebButtonSurface(
  paletteKey: keyof NemuWebButtonSchemePalette,
  scheme: "light" | "dark",
  state: "rest" | "pressed",
  tokenOverrides?: {
    primary?: string;
    primaryPressed?: string;
  },
): NemuWebButtonSurface {
  const surface = nemuWebButtonPalette[scheme][paletteKey][state];
  return {
    backgroundColor:
      surface.backgroundColor === "var(--use-tokens-primary)"
        ? (tokenOverrides?.primary ?? surface.backgroundColor)
        : surface.backgroundColor === "var(--use-tokens-primary-pressed)"
          ? (tokenOverrides?.primaryPressed ?? tokenOverrides?.primary ?? surface.backgroundColor)
          : surface.backgroundColor,
    borderColor: surface.borderColor,
    boxShadow: surface.boxShadow,
  };
}
