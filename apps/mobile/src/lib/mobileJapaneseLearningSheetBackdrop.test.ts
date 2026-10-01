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
    // A sentence sheet closed without the Ask hand-off releases the selection
    // (web closeOcrSheet), and a dismissed sheet's overlay ends at 0 whatever
    // the last sample that reached JS said (mobileJapaneseLearningSheetPresence).
    const dismissedStart = screen.indexOf("const handleJapaneseLearningOcrSheetDismissed = useCallback(");
    const dismissed = screen.slice(
      dismissedStart,
      screen.indexOf("const handleJapaneseLearningChatDismissed = useCallback(", dismissedStart),
    );
    expect(dismissed).toContain("resolveJapaneseLearningSentenceSheetDismissal({");
    expect(dismissed).toContain("if (dismissal.resetProgress) japaneseLearningOcrProgress.value = 0;");
    expect(dismissed).toContain("if (dismissal.releaseSelection) releaseJapaneseLearningSentenceSelection();");
    const releaseStart = screen.indexOf("const releaseJapaneseLearningSentenceSelection = useCallback(");
    const release = screen.slice(releaseStart, screen.indexOf("}, []);", releaseStart));
    expect(release).toContain("setJapaneseLearningSelectedDetectionOrder(null);");
    expect(release).toContain('japaneseLearningLifecycleRef.current?.abort("grammar");');
    expect(screen).toContain("if (dismissal.resetProgress) japaneseLearningChatProgress.value = 0;");
    // Samples that arrive after the dismissal was reported never move the overlay.
    for (const [handler, presence] of [
      ["handleJapaneseLearningOcrProgress", "japaneseLearningOcrSheetPresenceRef"],
      ["handleJapaneseLearningChatProgress", "japaneseLearningChatDrawerPresenceRef"],
    ]) {
      const start = screen.indexOf(`const ${handler} = useCallback(`);
      const body = screen.slice(start, screen.indexOf("}, [", start));
      expect(body).toContain(`japaneseLearningSheetProgressSample(\n      ${presence}.current,`);
      expect(body).toContain("if (sample === null) return;");
    }
    expect(screen).toContain("japaneseLearningOcrSheetPresenceRef.current = requestJapaneseLearningSheet(");
    expect(screen).toContain("japaneseLearningChatDrawerPresenceRef.current = requestJapaneseLearningSheet(");

    const preview = readFileSync(
      path.join(import.meta.dir, "..", "components", "reader", "japaneseLearning", "JapaneseLearningBubblePreview.tsx"),
      "utf8",
    );
    expect(preview).toContain("accessibilityElementsHidden={!presented}");
    expect(preview).toContain('importantForAccessibility={presented ? "auto" : "no-hide-descendants"}');
    expect(preview).toContain("accessible={presented}");
  });
});
