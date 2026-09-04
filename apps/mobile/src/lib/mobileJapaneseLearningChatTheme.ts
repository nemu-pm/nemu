import type { ColorSchemeName } from "react-native";
import type { NemuTokens } from "@/design-system";
// eslint-disable-next-line no-restricted-imports -- pure color helper; importing from @/design-system pulls the component barrel, which loads react-native's Flow-typed index.js and breaks bun's test runner.
import { nemuColorWithAlpha } from "@/design/colorAlpha";

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
    backgroundColor: "#e8ebf2",
    textColor: "#0e111b",
    tailColor: "#e8ebf2",
  };
}

export type JapaneseLearningFollowUpSuggestionColors = {
  backgroundColor: string;
  borderColor: string;
  pressedBackgroundColor: string;
  textColor: string;
};

/** Mirrors web `Suggestion` pills: `text-xs bg-secondary/80 border-border`. */
export function getJapaneseLearningFollowUpSuggestionColors(
  scheme: ColorSchemeName,
  tokens: NemuTokens,
): JapaneseLearningFollowUpSuggestionColors {
  if (scheme === "dark") {
    return {
      backgroundColor: "rgba(255,255,255,0.08)",
      borderColor: tokens.border,
      pressedBackgroundColor: "rgba(255,255,255,0.12)",
      textColor: tokens.foreground,
    };
  }

  return {
    backgroundColor: nemuColorWithAlpha(tokens.muted, 0.8),
    borderColor: tokens.border,
    pressedBackgroundColor: tokens.muted,
    textColor: tokens.foreground,
  };
}
