import { describe, expect, test } from "bun:test";
import {
  JAPANESE_LEARNING_SHEET_GONE,
  requestJapaneseLearningSheet,
  resolveJapaneseLearningChatDismissal,
} from "./mobileJapaneseLearningSheetPresence";

describe("chat stacked on the sentence sheet (web openChatAndSend)", () => {
  test("closing the stacked chat leaves the sentence sheet and its selection", () => {
    const closing = requestJapaneseLearningSheet(
      requestJapaneseLearningSheet(JAPANESE_LEARNING_SHEET_GONE, true),
      false,
    );
    const dismissal = resolveJapaneseLearningChatDismissal({
      presence: closing,
      returnsToSentence: false,
      sentenceWanted: true,
    });
    expect(dismissal.presentSentence).toBe(false);
    expect(dismissal.releaseSelection).toBe(false);
    expect(dismissal.resetProgress).toBe(true);
  });

  test("the reader stacks the chat in the sentence sheet on iOS instead of handing off", async () => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const screen = readFileSync(
      path.join(import.meta.dir, "..", "screens", "ReaderScreen.tsx"),
      "utf8",
    );
    expect(screen).toContain('const JAPANESE_LEARNING_CHAT_STACKS_ON_SENTENCE = Platform.OS === "ios";');
    const handoffStart = screen.indexOf("if (JAPANESE_LEARNING_CHAT_STACKS_ON_SENTENCE) {");
    const handoff = screen.slice(handoffStart, screen.indexOf("}", handoffStart));
    expect(handoff).toContain("setJapaneseLearningChatStackedOnSentence(true);");
    expect(handoff).toContain("setJapaneseLearningChatDrawerVisible(true);");
    expect(handoff).not.toContain("setJapaneseLearningOcrSheetVisible(false)");
    // The stacked chat is hosted in the sentence sheet's content.
    const sheetStart = screen.indexOf("<JapaneseLearningOcrResultSheet");
    const sheet = screen.slice(sheetStart, screen.indexOf("<JapaneseLearningTranscriptSheet", sheetStart));
    expect(sheet).toContain("renderJapaneseLearningChatDrawer(true)");
    // Closing a stacked chat does not bring the sentence back (it never left).
    const closeStart = screen.indexOf("const closeJapaneseLearningChatDrawer = useCallback(");
    const close = screen.slice(closeStart, screen.indexOf("}, [", closeStart));
    expect(close).toContain("!japaneseLearningChatStackedOnSentenceRef.current");
  });
});
