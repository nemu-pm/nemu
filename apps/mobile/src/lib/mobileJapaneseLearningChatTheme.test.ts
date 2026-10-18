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
      backgroundColor: "#e7ebf6",
      textColor: "#0e111b",
      tailColor: "#e7ebf6",
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

  test("matches the measured web follow-up pill (.btn-nemu-outline)", () => {
    expect(JAPANESE_LEARNING_FOLLOW_UP_SUGGESTION_INDENT).toBe(60);
    const dark = getJapaneseLearningFollowUpSuggestionColors("dark", nemuTokens.dark);
    expect(dark.backgroundColor).toBe("rgba(20,22,26,0.6)");
    expect(dark.borderColor).toBe("rgba(94,99,111,0.18)");
    expect(dark.textColor).toBe(nemuTokens.dark.foreground);
    expect(dark.boxShadow).toContain("0px 2px 8px 0px rgba(0,0,0,0.3)");
    const light = getJapaneseLearningFollowUpSuggestionColors("light", nemuTokens.light);
    expect(light.backgroundColor).toBe("rgba(244,248,255,0.65)");
    expect(light.borderColor).toBe("rgba(76,96,156,0.14)");
  });
});
