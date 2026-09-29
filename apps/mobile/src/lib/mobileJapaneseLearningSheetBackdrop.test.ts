import { describe, expect, test } from "bun:test";
import {
  isJapaneseLearningBubblePopoutPresented,
  JAPANESE_LEARNING_SHEET_BACKDROP,
  japaneseLearningBubblePopoutProgress,
} from "./mobileJapaneseLearningSheetBackdrop";

describe("Japanese learning bubble popout", () => {
  test("follows the sentence sheet", () => {
    expect(japaneseLearningBubblePopoutProgress(0.6, 0, false)).toBe(0.6);
    expect(japaneseLearningBubblePopoutProgress(1, 0, true)).toBe(1);
  });

  test("stays over a chat opened from the sentence (Ask), through the hand-off", () => {
    expect(japaneseLearningBubblePopoutProgress(0, 1, true)).toBe(1);
    // Sentence dismissing while the chat presents: the larger of the two.
    expect(japaneseLearningBubblePopoutProgress(0.3, 0.5, true)).toBe(0.5);
  });

  test("never floats over a chat opened from the capsule", () => {
    expect(japaneseLearningBubblePopoutProgress(0, 1, false)).toBe(0);
    expect(japaneseLearningBubblePopoutProgress(0, 0.4, false)).toBe(0);
  });

  test("is reachable by screen readers only while it is presented", () => {
    const hidden = { ocrSheetVisible: false, chatVisible: false, chatOpenedFromSentence: false };
    expect(isJapaneseLearningBubblePopoutPresented(hidden)).toBe(false);
    expect(isJapaneseLearningBubblePopoutPresented({ ...hidden, ocrSheetVisible: true })).toBe(true);
    expect(isJapaneseLearningBubblePopoutPresented({ ...hidden, chatVisible: true })).toBe(false);
    expect(
      isJapaneseLearningBubblePopoutPresented({ ...hidden, chatVisible: true, chatOpenedFromSentence: true }),
    ).toBe(true);
  });
});

describe("Japanese learning sheet backdrop", () => {
  test("matches web's bg-black/10", () => {
    expect(JAPANESE_LEARNING_SHEET_BACKDROP.dimOpacity).toBe(0.1);
    expect(JAPANESE_LEARNING_SHEET_BACKDROP.reducedTransparencyDimOpacity).toBeGreaterThan(0.1);
  });
});

describe("reader wiring of the bubble popout", () => {
  test("the popout follows its own rule and the selection ends with the sentence sheet", async () => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const screen = readFileSync(path.join(import.meta.dir, "..", "screens", "ReaderScreen.tsx"), "utf8");
    const popoutStart = screen.indexOf("<JapaneseLearningBubblePopout");
    const popout = screen.slice(popoutStart, screen.indexOf("/>", popoutStart));
    expect(popout).toContain("progress={japaneseLearningBubblePopoutPresentationProgress}");
    expect(popout).toContain("presented={japaneseLearningBubblePopoutPresented}");
    // The chat's own flag is decided when the chat presents.
    expect(screen).toContain(
      "setJapaneseLearningChatFromSentence(japaneseLearningChatReturnsToSentence);",
    );
    // A sentence sheet closed without the Ask hand-off clears the selection.
    const dismissedStart = screen.indexOf("const handleJapaneseLearningOcrSheetDismissed = useCallback(");
    const dismissed = screen.slice(dismissedStart, screen.indexOf("}, []);", dismissedStart));
    expect(dismissed).toContain("setJapaneseLearningSelectedDetectionOrder(null);");
    // A dismissed sheet's progress is 0 even if the last sampled frame was not.
    expect(dismissed).toContain("if (!japaneseLearningOcrSheetWantedRef.current) japaneseLearningOcrProgress.value = 0;");
    expect(screen).toContain("if (!japaneseLearningChatDrawerWantedRef.current) japaneseLearningChatProgress.value = 0;");
    expect(dismissed).toContain("!japaneseLearningOcrSheetWantedRef.current &&");
    expect(screen).toContain("japaneseLearningOcrSheetWantedRef.current = visible;");

    const preview = readFileSync(
      path.join(import.meta.dir, "..", "components", "reader", "japaneseLearning", "JapaneseLearningBubblePreview.tsx"),
      "utf8",
    );
    expect(preview).toContain("accessibilityElementsHidden={!presented}");
    expect(preview).toContain('importantForAccessibility={presented ? "auto" : "no-hide-descendants"}');
    expect(preview).toContain("accessible={presented}");
  });
});
