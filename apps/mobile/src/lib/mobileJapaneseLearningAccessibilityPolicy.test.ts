import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

function mobileSource(relativePath: string): string {
  return readFileSync(path.join(import.meta.dir, "..", relativePath), "utf8");
}

describe("Japanese learning accessibility policy", () => {
  test("offers every grammar token as a selected, actionable control", () => {
    const sentence = mobileSource(
      "components/reader/japaneseLearning/JapaneseLearningSentenceDisplay.tsx",
    );
    const token = mobileSource(
      "components/reader/japaneseLearning/JapaneseLearningTokenDisplay.tsx",
    );

    expect(sentence).toContain("onStartShouldSetResponderCapture");
    expect(sentence).toContain("onActivate={() => selectSingleToken(index)}");
    expect(sentence).toContain("extendAccessibleSelection(index)");
    expect(token).toContain('accessibilityRole="button"');
    expect(token).toContain("accessibilityState={{ selected: isHighlighted }}");
    expect(token).toContain('name: "extendSelection"');
    expect(token).toContain("onPress={onActivate}");
  });

  test("allows annotation rows to grow with Dynamic Type", () => {
    const token = mobileSource(
      "components/reader/japaneseLearning/JapaneseLearningTokenDisplay.tsx",
    );

    expect(token).toContain("minHeight: 14");
    expect(token).toContain("minHeight: 16");
    expect(token).not.toContain("height: 14");
    expect(token).not.toContain("height: 16");
  });

  test("keeps compact Japanese-learning controls on native touch targets", () => {
    // Web-sized visuals (24pt icon buttons, 32pt `sm` buttons, pills) reach
    // the 44pt native target through `hitSlop` (no layout change) or
    // NemuPressable's `minimumTouchTarget`.
    const sources = [
      "components/reader/japaneseLearning/JapaneseLearningSentenceDisplay.tsx",
      "components/reader/japaneseLearning/JapaneseLearningTokenSummary.tsx",
      "components/reader/japaneseLearning/JapaneseLearningNemuChatDrawer.tsx",
      "components/reader/japaneseLearning/JapaneseLearningAudioWaveform.tsx",
      "components/reader/japaneseLearning/JapaneseLearningFollowUpSuggestions.tsx",
      "components/reader/japaneseLearning/JapaneseLearningTranscriptSheet.tsx",
    ].map(mobileSource);
    const pressable = mobileSource(
      "design-system/components/NemuPressable.tsx",
    );

    for (const source of sources) {
      expect(source.includes("minimumTouchTarget") || source.includes("hitSlop=")).toBe(true);
    }
    expect(pressable).toContain("buttonDepth || minimumTouchTarget");
    // 32pt `sm` actions + 6pt slop, 24pt `xs` actions + 10pt slop.
    expect(sources[0]).toContain("height: 32");
    expect(sources[0]).toContain("hitSlop={6}");
    expect(sources[1]).toContain("height: 24");
    expect(sources[1]).toContain("hitSlop={10}");
    expect(sources[5]).toContain("minHeight: 48");
  });
});
