import type { ColorSchemeName } from "react-native";
import type { NemuTokens } from "@/design-system";

/** Web drawer follow-up row indent: `ml-11` (44px) + inner `ml-4` (16px). */
export const JAPANESE_LEARNING_FOLLOW_UP_SUGGESTION_INDENT = 60;

/** LINE messenger green — hardcoded on web message-bubble.tsx */
export const LINE_USER_BUBBLE_COLOR = "#5ac463";
export const LINE_USER_BUBBLE_TEXT = "#000000";
export const LINE_ERROR_BUBBLE_COLOR = "#ef4444";

export type JapaneseLearningAssistantBubbleColors = {
  backgroundColor: string;
  textColor: string;
  tailColor: string;
  borderColor?: string;
};

export function getJapaneseLearningAssistantBubbleColors(
  scheme: ColorSchemeName,
  isError: boolean,
): JapaneseLearningAssistantBubbleColors {
  if (isError) {
    return scheme === "dark"
      ? {
          backgroundColor: "rgba(127, 29, 29, 0.30)",
          textColor: "#fca5a5",
          tailColor: "rgba(127, 29, 29, 0.30)",
          borderColor: "rgba(248, 113, 113, 0.50)",
        }
      : {
          backgroundColor: "#fef2f2",
          textColor: "#ef4444",
          tailColor: "#fef2f2",
          borderColor: "#fecaca",
        };
  }

  if (scheme === "dark") {
    return {
      backgroundColor: "#ffffff",
      textColor: "#111111",
      tailColor: "#ffffff",
    };
  }

  return {
    backgroundColor: "#e7ebf6",
    textColor: "#0e111b",
    tailColor: "#e7ebf6",
  };
}

/**
 * Web suggestion `Button`: `active:scale-[0.97]` over
 * `transition-all duration-200 ease-out` (the fill brightens to
 * `pressedBackgroundColor`, web's hover fill, over the same time).
 */
export const JAPANESE_LEARNING_FOLLOW_UP_SUGGESTION_PRESS = {
  scale: 0.97,
  durationMs: 200,
} as const;

export type JapaneseLearningFollowUpSuggestionColors = {
  backgroundColor: string;
  borderColor: string;
  pressedBackgroundColor: string;
  textColor: string;
  /** Web `box-shadow` of the pill, as a React Native `boxShadow` string. */
  boxShadow: string;
};

/**
 * Web `Suggestion` pills (`Button variant="outline"`): the `.btn-nemu-outline`
 * glass surface wins over the `bg-secondary/80 border-border` utilities (the
 * unlayered class beats Tailwind's utility layer), so the measured pill is
 * `oklch(0.20 0.008 269 / 0.6)` on a 0.5px `oklch(0.5 0.02 269 / 0.18)` edge
 * in dark mode — converted to sRGB here.
 */
export function getJapaneseLearningFollowUpSuggestionColors(
  scheme: ColorSchemeName,
  tokens: NemuTokens,
): JapaneseLearningFollowUpSuggestionColors {
  if (scheme === "dark") {
    return {
      backgroundColor: "rgba(20,22,26,0.6)",
      borderColor: "rgba(94,99,111,0.18)",
      pressedBackgroundColor: "rgba(28,31,37,0.7)",
      textColor: tokens.foreground,
      boxShadow:
        "0px 2px 8px 0px rgba(0,0,0,0.3), 0px 0px 1px 0px rgba(0,0,0,0.25), inset 0px 0.5px 0px 0px rgba(255,255,255,0.05)",
    };
  }
  return {
    backgroundColor: "rgba(244,248,255,0.65)",
    borderColor: "rgba(76,96,156,0.14)",
    pressedBackgroundColor: "rgba(244,248,255,0.8)",
    textColor: tokens.foreground,
    boxShadow:
      "0px 1px 4px 0px rgba(46,65,135,0.06), 0px 0px 1px 0px rgba(46,65,135,0.08), inset 0px 0.5px 0px 0px rgba(255,255,255,0.5)",
  };
}

/**
 * Web `.input-nemu` resting depth (src/index.css): light is a faint
 * `0 1px 2px / 0.03` drop plus the glass's inner top highlight and bottom
 * edge; dark keeps `0 1px 3px / 0.25`.
 */
export const JAPANESE_LEARNING_CHAT_INPUT_REST_SHADOW = {
  light:
    "0px 1px 2px 0px rgba(0,0,0,0.03), inset 0px 1px 0px 0px rgba(255,255,255,0.6), inset 0px -1px 0px 0px rgba(0,0,0,0.02)",
  dark: "0px 1px 3px 0px rgba(0,0,0,0.25)",
} as const;

/** Web `.input-nemu` `transition: … 250ms ease` (border, box-shadow, background). */
export const JAPANESE_LEARNING_CHAT_INPUT_TRANSITION_MS = 250;

export type JapaneseLearningChatInputSurface = {
  backgroundColor: string;
  borderColor: string;
  boxShadow: string;
};

/**
 * Web `.input-nemu` and `.input-nemu:focus` (src/index.css), with the
 * relative OKLCH colours resolved against `--primary` and converted to sRGB:
 * - light focus border `oklch(from primary l+0.15 c×0.6 h / 0.5)`
 *   = oklch(0.766 0.113 269) → rgb(150,176,251);
 *   glow `0 0 8px -2px oklch(from primary l+0.2 c h / 0.2)`
 *   = oklch(0.816 0.188 269) → rgb(146,186,255) (clipped to sRGB);
 * - dark focus border and glow `oklch(from primary l+0.15 c h)`
 *   = oklch(0.80 0.18 269) → rgb(143,181,255), at 0.55 / 0.35,
 *   glow `0 0 12px -3px`.
 * The inner luminosity insets are left out (spec: skip inset glow).
 */
export function getJapaneseLearningChatInputSurfaces(
  scheme: ColorSchemeName,
): { rest: JapaneseLearningChatInputSurface; focus: JapaneseLearningChatInputSurface } {
  if (scheme === "dark") {
    return {
      rest: {
        backgroundColor: "rgba(255,255,255,0.05)",
        borderColor: "rgba(255,255,255,0.1)",
        boxShadow: JAPANESE_LEARNING_CHAT_INPUT_REST_SHADOW.dark,
      },
      focus: {
        backgroundColor: "rgba(255,255,255,0.09)",
        borderColor: "rgba(143,181,255,0.55)",
        boxShadow: "0px 0px 12px -3px rgba(143,181,255,0.35), 0px 1px 4px 0px rgba(0,0,0,0.3)",
      },
    };
  }
  return {
    rest: {
      backgroundColor: "rgba(244,244,245,0.85)",
      borderColor: "rgba(0,0,0,0.08)",
      boxShadow: JAPANESE_LEARNING_CHAT_INPUT_REST_SHADOW.light,
    },
    focus: {
      backgroundColor: "rgba(252,252,252,0.95)",
      borderColor: "rgba(150,176,251,0.5)",
      boxShadow:
        "0px 0px 8px -2px rgba(146,186,255,0.2), 0px 1px 2px 0px rgba(0,0,0,0.03), inset 0px 1px 0px 0px rgba(255,255,255,0.9)",
    },
  };
}
