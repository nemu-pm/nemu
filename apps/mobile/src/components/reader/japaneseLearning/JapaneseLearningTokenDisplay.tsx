import { Fragment } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { nemuFontWeight, useNemuTheme } from "@/design-system";
import { JapaneseLearningText as Text } from "./JapaneseLearningText";
import type { MobileGrammarToken } from "@/lib/mobileJapaneseLearningGrammar";
import {
  mobileJapaneseLearningMultiSelectPalette,
  mobileJapaneseLearningPosLabel,
  mobileJapaneseLearningTokenPalette,
} from "@/lib/mobileJapaneseLearningPosStyles";
import { JAPANESE_LEARNING_SERIF_FONT_FAMILY } from "@/lib/mobileJapaneseLearningSurfaceTheme";

interface TokenDisplayProps {
  token: MobileGrammarToken;
  index: number;
  isSelected: boolean;
  regularWidth?: boolean;
  isMultiSelected: boolean;
  accessibilityLabel: string;
  accessibilityExtendLabel: string;
  onActivate: () => void;
  onExtendSelection: () => void;
  onLayout?: (index: number, x: number, y: number, width: number, height: number) => void;
}

/**
 * Mobile port of web `TokenDisplay` (token-display.tsx) with the
 * `.textbook-token` look from `src/index.css`: furigana above, the word on a
 * POS-tinted wash with a 2pt POS rule underneath, the POS kanji label below.
 * Selected tokens deepen the wash and switch the rule to the POS border colour;
 * a multi-selection paints one primary highlight across the range.
 *
 * This View is NOT a responder. The parent SentenceDisplay is the sole
 * responder and hit-tests touches against per-token layouts reported via
 * `onLayout` using `mobileGrammarTokenAtPoint`.
 */
export function JapaneseLearningTokenDisplay({
  token,
  index,
  isSelected,
  regularWidth = false,
  isMultiSelected,
  accessibilityLabel,
  accessibilityExtendLabel,
  onActivate,
  onExtendSelection,
  onLayout,
}: TokenDisplayProps) {
  const { tokens, scheme } = useNemuTheme();
  const paletteScheme = scheme === "dark" ? "dark" : "light";
  const palette = mobileJapaneseLearningTokenPalette(token, paletteScheme);
  const multi = mobileJapaneseLearningMultiSelectPalette(paletteScheme);
  const posLabel = mobileJapaneseLearningPosLabel(token);
  const displayWord = token.word.replace(/\n/g, "");
  // Ichiran readings can carry a zero-width non-joiner (e.g. "‌へ").
  const displayReading = token.reading.replace(/\n/g, "").replace(/\u200c/g, "");
  const hasNewline = token.word !== displayWord;
  const showFurigana = displayReading.length > 0 && displayReading !== displayWord;
  const isHighlighted = isSelected || isMultiSelected;

  const chipBackground = isMultiSelected
    ? multi.background
    : isSelected
      ? palette.selectedBackground
      : palette.background;
  const chipRule = isMultiSelected
    ? multi.underline
    : isSelected
      ? palette.selectedUnderline
      : palette.underline;

  return (
    <Fragment>
      <Pressable
        accessible
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityLanguage="ja"
        accessibilityState={{ selected: isHighlighted }}
        accessibilityActions={[
          {
            name: "extendSelection",
            label: accessibilityExtendLabel,
          },
        ]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === "extendSelection") {
            onExtendSelection();
          }
        }}
        onPress={onActivate}
        style={styles.token}
        onLayout={(event) => {
          if (!onLayout) return;
          const { x, y, width, height } = event.nativeEvent.layout;
          onLayout(index, x, y, width, height);
        }}
      >
        {/* Furigana row — fixed height for vertical alignment across tokens */}
        <View style={styles.furiganaRow}>
          {showFurigana ? (
            <Text
              style={[
                styles.furigana,
                regularWidth ? styles.furiganaRegular : null,
                {
                  color: tokens.mutedForeground,
                  opacity: isHighlighted ? 1 : 0.7,
                },
              ]}
              numberOfLines={1}
            >
              {displayReading}
            </Text>
          ) : null}
        </View>

        {/* Main word — `.textbook-token` */}
        <View
          style={[
            styles.wordChip,
            {
              backgroundColor: chipBackground,
              borderBottomColor: chipRule,
              boxShadow: `inset 0 0.5px 0 rgba(255,255,255,${scheme === "dark" ? 0.08 : 0.65})`,
            },
            isSelected && !isMultiSelected
              ? { boxShadow: scheme === "dark"
                ? "inset 0 0.5px 0 rgba(255,255,255,0.08), 0 10px 26px rgba(0,0,0,0.35)"
                : "inset 0 0.5px 0 rgba(255,255,255,0.7), 0 8px 18px rgba(0,0,0,0.08)" }
              : null,
          ]}
        >
          <Text style={[styles.word, regularWidth ? styles.wordRegular : null, { color: palette.text }]}>{displayWord}</Text>
        </View>

        {/* POS label row — fixed height */}
        <View style={styles.posLabelRow}>
          {posLabel ? (
            <Text
              style={[
                styles.posLabel,
                regularWidth ? styles.posLabelRegular : null,
                { color: palette.text, opacity: isHighlighted ? 1 : 0.4 },
              ]}
            >
              {posLabel}
            </Text>
          ) : null}
        </View>
      </Pressable>
      {hasNewline ? <View style={styles.lineBreak} /> : null}
    </Fragment>
  );
}

const styles = StyleSheet.create({
  // Web: `inline-flex flex-col items-center mx-[1px]`.
  token: {
    alignItems: "center",
    marginHorizontal: 1,
  },
  // Web: `h-[0.9rem]` furigana row, `text-[0.6rem] tracking-wide`
  // (= JAPANESE_LEARNING_FURIGANA_ROW_HEIGHT; a minimum, so Dynamic Type grows it).
  furiganaRow: {
    minHeight: 14.4,
    justifyContent: "flex-end",
  },
  furigana: {
    fontSize: 9.6,
    fontWeight: nemuFontWeight.regular,
    lineHeight: 9.6,
    letterSpacing: 0.25,
  },
  // Web: `rounded-[3px] px-1 py-0.5` + 2px bottom rule.
  wordChip: {
    borderRadius: 3,
    borderBottomWidth: 2,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  // Web: `.ja-textbook text-[1.4rem]`.
  word: {
    fontFamily: Platform.select(JAPANESE_LEARNING_SERIF_FONT_FAMILY),
    fontSize: 22.4,
    lineHeight: 33.6,
  },
  // Web: `h-[1rem] mt-0.5`, label `text-[0.5rem] font-medium`.
  posLabelRow: {
    minHeight: 16,
    justifyContent: "flex-start",
    marginTop: 2,
  },
  posLabel: {
    fontSize: 8,
    fontWeight: nemuFontWeight.medium,
    lineHeight: 8,
  },
  wordRegular: { fontSize: 25.6, lineHeight: 38.4 },
  furiganaRegular: { fontSize: 10.4, lineHeight: 10.4 },
  posLabelRegular: { fontSize: 8.8, lineHeight: 8.8 },
  lineBreak: {
    width: "100%",
    height: 0,
  },
});
