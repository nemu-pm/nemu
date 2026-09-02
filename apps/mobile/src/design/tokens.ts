export type NemuColorScheme = "light" | "dark";

/**
 * Mobile semantic colors aligned with web `src/index.css` `:root` / `.dark` tokens.
 */
export type NemuTokens = {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  border: string;
  tabGlass: string;
  tabBorder: string;
  sourceGlass: string;
  sourceIconGlass: string;
  coverBorder: string;
  toolbarAction: string;
  toolbarActionBorder: string;
  toolbarActionPressed: string;
  shadow: string;
  danger: string;
  success: string;
  warning: string;
  warningSoft: string;
};

export const radius = {
  sm: 6,
  md: 8,
  lg: 10,
  xl: 12,
  tab: 22,
  pill: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pageX: 16,
  pageTop: 18,
  tabBottom: 12,
} as const;

/**
 * Shared icon glyph sizes. Toolbars and sheet rows render 22/20pt SF-Symbol
 * equivalents; compact inline icons stay at 18pt.
 */
export const iconSize = {
  sm: 18,
  md: 20,
  lg: 22,
} as const;

export const nemuTokens: Record<NemuColorScheme, NemuTokens> = {
  light: {
    background: "#f8fafe",
    foreground: "#0e111b",
    card: "#fbfcff",
    cardForeground: "#0e111b",
    primary: "#5879f4",
    primaryForeground: "#f6f8ff",
    secondary: "#e7ebf6",
    secondaryForeground: "#323a50",
    muted: "#e8ebf2",
    mutedForeground: "#5e636f",
    border: "rgba(222,225,234,0.92)",
    tabGlass: "rgba(248,250,254,0.74)",
    tabBorder: "rgba(76,96,156,0.16)",
    sourceGlass: "rgba(251,252,255,0.66)",
    sourceIconGlass: "rgba(0,0,0,0.035)",
    coverBorder: "rgba(76,96,156,0.16)",
    toolbarAction: "rgba(88,121,244,0.12)",
    toolbarActionBorder: "rgba(88,121,244,0.2)",
    toolbarActionPressed: "rgba(88,121,244,0.18)",
    shadow: "rgba(38,57,176,0.14)",
    danger: "#de3b3d",
    success: "#2f8f67",
    warning: "#c2801a",
    warningSoft: "rgba(194,128,26,0.14)",
  },
  dark: {
    background: "#090a0d",
    foreground: "#e5e8ed",
    card: "#0f1014",
    cardForeground: "#e5e8ed",
    primary: "#6385fc",
    primaryForeground: "#f6f8ff",
    secondary: "#191a1e",
    secondaryForeground: "#d5d7de",
    muted: "#191b1d",
    mutedForeground: "#7e8086",
    border: "rgba(68,72,80,0.18)",
    tabGlass: "rgba(20,22,26,0.8)",
    tabBorder: "rgba(93,99,114,0.13)",
    sourceGlass: "rgba(255,255,255,0.055)",
    sourceIconGlass: "rgba(255,255,255,0.07)",
    coverBorder: "rgba(93,99,114,0.14)",
    toolbarAction: "rgba(99,133,252,0.18)",
    toolbarActionBorder: "rgba(99,133,252,0.26)",
    toolbarActionPressed: "rgba(99,133,252,0.24)",
    shadow: "rgba(0,0,0,0.36)",
    danger: "#e8575b",
    success: "#64c493",
    warning: "#f0a63a",
    warningSoft: "rgba(240,166,58,0.16)",
  },
};
