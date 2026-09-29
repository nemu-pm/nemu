import type { ColorSchemeName } from "react-native";
import type { NemuTokens } from "@/design-system";

/** Web drawer follow-up row indent: `ml-11` (44px) + inner `ml-4` (16px). */
export const JAPANESE_LEARNING_FOLLOW_UP_SUGGESTION_INDENT = 60;

/** LINE messenger green — hardcoded on web message-bubble.tsx */
export const LINE_USER_BUBBLE_COLOR = "#5ac463";
export const LINE_USER_BUBBLE_TEXT = "#000000";
export const LINE_WAVE_COLOR = "#5ac463";
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
