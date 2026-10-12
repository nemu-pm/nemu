import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

function mobileSource(relativePath: string): string {
  return readFileSync(path.join(import.meta.dir, "..", relativePath), "utf8");
}

describe("mobile Japanese-learning TTS error surfaces", () => {
  test("retains the originating surface on every TTS failure", () => {
    const screen = mobileSource("screens/ReaderScreen.tsx");
    const stateStart = screen.indexOf("type JapaneseLearningTtsState =");
    const stateEnd = screen.indexOf(
      "const EMPTY_READER_SOURCE_LANGUAGES",
      stateStart,
    );
    const state = screen.slice(stateStart, stateEnd);

    expect(state).toMatch(
      /status: "error";[\s\S]*?source: "sentence" \| "transcript" \| "chat";[\s\S]*?messageId\?: string;/,
    );

    const sentenceStart = screen.indexOf(
      "const toggleJapaneseLearningTts = useCallback",
    );
    const transcriptStart = screen.indexOf(
      "const toggleJapaneseLearningTranscriptTts = useCallback",
      sentenceStart,
    );
    const chatStart = screen.indexOf(
      "const playJapaneseLearningChatTts = useCallback",
      transcriptStart,
    );
    const chatEnd = screen.indexOf(
      "useEffect(() => {\n    playJapaneseLearningChatTtsRef.current",
      chatStart,
    );
    const sentence = screen.slice(sentenceStart, transcriptStart);
    const transcript = screen.slice(transcriptStart, chatStart);
    const chat = screen.slice(chatStart, chatEnd);

    expect(
      sentence.match(/status: "error",\s*source: "sentence"/g),
    ).toHaveLength(3);
    expect(
      transcript.match(/status: "error",\s*source: "transcript"/g),
    ).toHaveLength(3);
    expect(chat).toMatch(
      /status: "error",\s*source: "chat",\s*messageId: message\.id,/,
    );
  });

  test("routes sentence and transcript failures to accessible inline alerts", () => {
    const screen = mobileSource("screens/ReaderScreen.tsx");
    const ocr = mobileSource(
      "components/reader/japaneseLearning/JapaneseLearningOcrResultSheet.tsx",
    );
    const transcript = mobileSource(
      "components/reader/japaneseLearning/JapaneseLearningTranscriptSheet.tsx",
    );

    expect(screen).toContain("<JapaneseLearningOcrResultSheet");
    expect(screen).toMatch(
      /japaneseLearningTtsState\.status !== "idle"\s*\? japaneseLearningTtsState\.source/,
    );
    expect(ocr).toMatch(
      /ttsState\.status === "error" &&\s*ttsState\.source === "sentence" &&\s*ocrState\.status !== "error"/,
    );
    expect(transcript).toContain(
      'ttsState.status === "error" && ttsState.source === "transcript"',
    );

    for (const surface of [ocr, transcript]) {
      expect(surface).toContain('accessibilityRole="alert"');
      expect(surface).toContain('accessibilityLiveRegion="assertive"');
      expect(surface).toContain("{ttsState.detail}");
    }
  });

  test("stops sentence audio when its OCR surface closes", () => {
    const screen = mobileSource("screens/ReaderScreen.tsx");
    const closeStart = screen.indexOf(
      "const closeJapaneseLearningOcrSheet = useCallback",
    );
    const closeEnd = screen.indexOf(
      "const toggleJapaneseLearningTts = useCallback",
      closeStart,
    );
    const close = screen.slice(closeStart, closeEnd);

    expect(close).toContain('japaneseLearningTtsState.status !== "idle"');
    expect(close).toContain('japaneseLearningTtsState.source === "sentence"');
    expect(close).toContain("stopJapaneseLearningTts();");
    expect(close).toContain("setJapaneseLearningOcrSheetVisible(false);");
    expect(screen).toContain("onClose={closeJapaneseLearningOcrSheet}");
  });

  test("adapts OCR sentence actions without truncating their labels", () => {
    const ocr = mobileSource(
      "components/reader/japaneseLearning/JapaneseLearningOcrResultSheet.tsx",
    );
    const footerStart = ocr.indexOf("<View\n          style={[\n            styles.footerActions");
    const footerEnd = ocr.indexOf("</JapaneseLearningSurfaceFrame>", footerStart);
    const footer = ocr.slice(footerStart, footerEnd);

    expect(footerStart).toBeGreaterThan(0);
    expect(ocr).toContain("const { fontScale } = useWindowDimensions();");
    expect(ocr).toContain("const largeTextLayout = fontScale > 1.3;");
    // Web keeps one action row; only large Dynamic Type stacks it.
    expect(ocr).toContain("const stackFooterActions = largeTextLayout;");
    // Web's 70vh drawer top (see resolveJapaneseLearningDrawerDetent).
    expect(ocr).toContain("const drawerFrame = useJapaneseLearningDrawerFrame();");
    expect(ocr).toContain(
      'frameMaxHeight={largeTextLayout ? "100%" : drawerFrame.frameMaxHeight}',
    );
    expect(footer).toContain("styles.footerActionsStacked");
    expect(footer.match(/styles\.footerActionContainerStacked/g)).toHaveLength(
      3,
    );
    // Every label stays on one line (web `whitespace-nowrap`): the measured
    // layout gives up ghost padding, then ghost labels, before the primary
    // label may scale down; nothing truncates. Stacked rows wrap freely.
    expect(ocr).toContain("resolveJapaneseLearningFooterLayout(");
    expect(footer).toContain("numberOfLines={stackFooterActions ? undefined : 1}");
    expect(footer).toContain("adjustsFontSizeToFit={!stackFooterActions && footerLayout.primaryScalesDown}");
    expect(footer).not.toContain("ellipsizeMode");
    expect(ocr).toContain("minHeight: 36");
    expect(ocr).toContain("footerActionTextShrink: { flexShrink: 1 }");
    expect(ocr).toContain('textAlign: "center"');
  });

  test("attaches a chat failure only to its originating message bubble", () => {
    const screen = mobileSource("screens/ReaderScreen.tsx");
    const drawer = mobileSource(
      "components/reader/japaneseLearning/JapaneseLearningNemuChatDrawer.tsx",
    );
    const bubble = mobileSource(
      "components/reader/japaneseLearning/JapaneseLearningMessageBubble.tsx",
    );

    expect(screen).toMatch(
      /japaneseLearningTtsState\.status !== "idle"\s*\? japaneseLearningTtsState\.messageId/,
    );
    expect(drawer).toMatch(
      /ttsState\.status === "error" &&\s*ttsState\.source === "chat" &&\s*ttsState\.messageId === msg\.id/,
    );
    expect(drawer).toContain("ttsErrorDetail={chatTtsError}");
    expect(bubble).toContain("{ttsErrorDetail ? (");
    expect(bubble).toContain('accessibilityRole="alert"');
    expect(bubble).toContain('accessibilityLiveRegion="assertive"');
  });
});
