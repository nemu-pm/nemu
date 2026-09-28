/**
 * Japanese Learning surface colours, generated from the web theme
 * (`src/index.css`): the transcript popover (`.reader-settings-popup`,
 * `.transcript-line*`, `.transcript-empty`, `.transcript-column-divider`), the
 * details card (`.token-details-card`) and the base `:root` / `.dark` tokens.
 * OKLCH values are converted to sRGB; nothing here is picked by eye.
 */
export type JapaneseLearningSurfaceColors = {
  popover: string;
  popoverBorder: string;
  transcriptLineText: string;
  transcriptLineActiveBackground: string;
  transcriptLineActiveBorder: string;
  transcriptLineActiveText: string;
  transcriptLineReadingBackground: string;
  transcriptLineReadingBorder: string;
  transcriptLineReadingText: string;
  transcriptEmptyText: string;
  columnDivider: string;
  detailsCard: string;
  detailsCardBorder: string;
  background: string;
  foreground: string;
  mutedForeground: string;
  muted: string;
  secondary: string;
  border: string;
  card: string;
  primary: string;
  destructive: string;
};

const SURFACES: Record<"light" | "dark", JapaneseLearningSurfaceColors> = {
  light: {
    popover: "rgba(248,248,248,0.92)",
    popoverBorder: "rgba(0,0,0,0.12)",
    transcriptLineText: "#161616",
    transcriptLineActiveBackground: "rgba(249,252,255,0.95)",
    transcriptLineActiveBorder: "rgba(71,94,167,0.2)",
    transcriptLineActiveText: "#080b14",
    transcriptLineReadingBackground: "rgba(221,233,255,0.9)",
    transcriptLineReadingBorder: "rgba(139,161,223,0.3)",
    transcriptLineReadingText: "#273879",
    transcriptEmptyText: "rgba(99,99,99,0.6)",
    columnDivider: "rgba(0,0,0,0.08)",
    detailsCard: "rgba(254,253,252,0.85)",
    detailsCardBorder: "rgba(0,0,0,0.06)",
    background: "#f8fafe",
    foreground: "#0e111b",
    mutedForeground: "#5e636f",
    muted: "#e8ebf2",
    secondary: "#e7ebf6",
    border: "#dee1ea",
    card: "#fbfcff",
    primary: "#5879f4",
    destructive: "#de3b3d"
  },
  dark: {
    popover: "rgba(9,9,9,0.92)",
    popoverBorder: "rgba(255,255,255,0.12)",
    transcriptLineText: "#e4e4e4",
    transcriptLineActiveBackground: "rgba(28,31,39,0.9)",
    transcriptLineActiveBorder: "rgba(90,110,172,0.35)",
    transcriptLineActiveText: "#f7f8fc",
    transcriptLineReadingBackground: "rgba(149,166,214,0.35)",
    transcriptLineReadingBorder: "rgba(146,171,243,0.4)",
    transcriptLineReadingText: "#e1fdff",
    transcriptEmptyText: "rgba(158,158,158,0.5)",
    columnDivider: "rgba(255,255,255,0.1)",
    detailsCard: "rgba(13,13,15,0.75)",
    detailsCardBorder: "rgba(255,255,255,0.08)",
    background: "#090a0d",
    foreground: "#e5e8ed",
    mutedForeground: "#7e8086",
    muted: "#191b1d",
    secondary: "#191a1e",
    border: "rgba(68,72,80,0.18)",
    card: "#0f1014",
    primary: "#6385fc",
    destructive: "#e8575b"
  }
};

export function mobileJapaneseLearningSurfaceColors(
  scheme: "light" | "dark",
): JapaneseLearningSurfaceColors {
  return SURFACES[scheme];
}

/** Web `.ja-textbook` / `.transcript-line`: Noto Serif JP, with the platform Mincho as the native equivalent. */
export const JAPANESE_LEARNING_SERIF_FONT_FAMILY = {
  ios: "Hiragino Mincho ProN",
  android: "serif",
} as const;

/** Web LINE-style audio control (`audio-waveform.tsx`). */
export const JAPANESE_LEARNING_AUDIO_COLORS = {
  button: "#5ac463",
  progress: "#5ac463",
  wave: { light: "#c8c8c8", dark: "#6b6b6b" },
} as const;
