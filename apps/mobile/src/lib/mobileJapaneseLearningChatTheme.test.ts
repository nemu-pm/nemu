import { describe, expect, test } from "bun:test";
// eslint-disable-next-line no-restricted-imports -- test needs the runtime token values; importing from @/design-system pulls the component barrel, which loads react-native's Flow-typed index.js and breaks bun's test runner.
import { nemuTokens } from "@/design/tokens";
import {
  getJapaneseLearningAssistantBubbleColors,
  getJapaneseLearningFollowUpSuggestionColors,
  JAPANESE_LEARNING_FOLLOW_UP_SUGGESTION_INDENT,
  LINE_USER_BUBBLE_COLOR,
} from "./mobileJapaneseLearningChatTheme";

describe("mobileJapaneseLearningChatTheme", () => {
  test("uses LINE green for user bubbles", () => {
    expect(LINE_USER_BUBBLE_COLOR).toBe("#5ac463");
  });

  test("matches web assistant bubble colors in light and dark mode", () => {
    expect(getJapaneseLearningAssistantBubbleColors("light", false)).toEqual({
      backgroundColor: "#e8ebf2",
      textColor: "#0e111b",
      tailColor: "#e8ebf2",
    });
    expect(getJapaneseLearningAssistantBubbleColors("dark", false)).toEqual({
      backgroundColor: "#ffffff",
      textColor: "#111111",
      tailColor: "#ffffff",
    });
  });

  test("uses bordered error styling for assistant error bubbles", () => {
    const colors = getJapaneseLearningAssistantBubbleColors("light", true);
    expect(colors.borderColor).toBe("#fecaca");
    expect(colors.backgroundColor).toBe("#fef2f2");
  });

  test("matches web follow-up suggestion pill colors", () => {
    expect(JAPANESE_LEARNING_FOLLOW_UP_SUGGESTION_INDENT).toBe(60);
    expect(
      getJapaneseLearningFollowUpSuggestionColors("light", nemuTokens.light),
    ).toEqual({
      backgroundColor: "rgba(232,235,242,0.8)",
      borderColor: nemuTokens.light.border,
      pressedBackgroundColor: nemuTokens.light.muted,
      textColor: nemuTokens.light.foreground,
    });
  });
});
