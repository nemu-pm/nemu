import { Fragment } from "react";
import { StyleSheet, Text, View } from "react-native";
import { nemuFontWeight, useNemuTheme } from "@/design-system";
import type { MobileGrammarToken } from "@/lib/mobileJapaneseLearningGrammar";
import {
  mobileJapaneseLearningPosLabel,
  mobileJapaneseLearningPosStyle,
} from "@/lib/mobileJapaneseLearningPosStyles";

interface TokenDisplayProps {
  token: MobileGrammarToken;
  index: number;
  isSelected: boolean;
  isMultiSelected: boolean;
  onLayout?: (index: number, x: number, y: number, width: number, height: number) => void;
}

/**
 * Mobile mirror of web `TokenDisplay` (token-display.tsx).
 * Vertical stack: furigana → word → POS kanji label, with POS-category color
 * theming (13 categories, matching web `pos-styles.ts`).
 *
 * This View is NOT a responder. The parent SentenceDisplay is the sole
 * responder and hit-tests touches against per-token layouts reported via
 * `onLayout` using `mobileGrammarTokenAtPoint`.
 */
export function JapaneseLearningTokenDisplay({
  token,
  index,
  isSelected,
  isMultiSelected,
  onLayout,
}: TokenDisplayProps) {
  const { tokens } = useNemuTheme();
  const posStyle = mobileJapaneseLearningPosStyle(token);
  const posLabel = mobileJapaneseLearningPosLabel(token);
  const displayWord = token.word.replace(/\n/g, "");
  const displayReading = token.reading.replace(/\n/g, "");
  const hasNewline = token.word !== displayWord;
  const showFurigana = displayReading.length > 0 && displayReading !== displayWord;
  const isHighlighted = isSelected || isMultiSelected;

  return (
    <Fragment>
      <View
        style={[
          styles.token,
          {
            backgroundColor: isHighlighted ? posStyle.bgStrong : "transparent",
            borderColor: isHighlighted ? posStyle.border : "transparent",
          },
        ]}
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

        {/* Main word */}
        <Text
          style={[
            styles.word,
            { color: posStyle.text === tokens.foreground ? tokens.foreground : posStyle.text },
          ]}
        >
          {displayWord}
        </Text>

        {/* POS label row — fixed height */}
        <View style={styles.posLabelRow}>
          {posLabel ? (
            <Text
              style={[
                styles.posLabel,
                { color: posStyle.text, opacity: isHighlighted ? 1 : 0.5 },
              ]}
            >
              {posLabel}
            </Text>
          ) : null}
        </View>
      </View>
      {hasNewline ? <View style={styles.lineBreak} /> : null}
    </Fragment>
  );
}

const styles = StyleSheet.create({
  token: {
    alignItems: "center",
    borderRadius: 3,
    borderWidth: StyleSheet.hairlineWidth,
    marginHorizontal: 1,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  furiganaRow: {
    height: 14,
    justifyContent: "flex-end",
  },
  furigana: {
    fontSize: 10,
    fontWeight: nemuFontWeight.regular,
    lineHeight: 14,
  },
  word: {
    fontSize: 24,
    fontWeight: nemuFontWeight.semibold,
    lineHeight: 30,
  },
  posLabelRow: {
    height: 16,
    justifyContent: "flex-start",
    marginTop: 2,
  },
  posLabel: {
    fontSize: 9,
    fontWeight: nemuFontWeight.semibold,
    lineHeight: 12,
  },
  lineBreak: {
    width: "100%",
    height: 0,
  },
});