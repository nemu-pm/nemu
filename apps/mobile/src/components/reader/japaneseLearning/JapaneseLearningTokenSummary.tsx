import { useCallback } from "react";
import { Clipboard } from "react-native";
import { StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  nemuFontWeight,
  NemuPressable,
  radius,
  useNemuTheme,
} from "@/design-system";
import type { MobileGrammarToken } from "@/lib/mobileJapaneseLearningGrammar";
import {
  mobileJapaneseLearningPosCategory,
  mobileJapaneseLearningPosLabel,
  mobileJapaneseLearningPosStyle,
} from "@/lib/mobileJapaneseLearningPosStyles";
import type { MobileStrings } from "@/lib/mobileI18n";

type ThemeTokens = ReturnType<typeof useNemuTheme>["tokens"];

/** Mirrors web `TokenSummary` (token-details.tsx). Word + reading header,
 *  POS tag pills (conjugation types / suffix), and Copy / Ask actions. */
export function JapaneseLearningTokenSummary({
  token,
  strings,
  tokens,
  onAskNemu,
}: {
  token: MobileGrammarToken;
  strings: MobileStrings;
  tokens: ThemeTokens;
  onAskNemu?: () => void;
}) {
  const posStyle = mobileJapaneseLearningPosStyle(token);
  const posLabel = mobileJapaneseLearningPosLabel(token);
  const canAct =
    token.word.trim().length > 0 &&
    mobileJapaneseLearningPosCategory(token) !== "punctuation";

  const handleCopyWord = useCallback(async () => {
    if (!token.word) return;
    try {
      await Clipboard.setString(token.word);
    } catch {
      // ignore
    }
  }, [token.word]);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.wordBlock}>
          <Text
            style={[styles.word, { color: tokens.foreground }]}
            numberOfLines={2}
          >
            {token.word}
          </Text>
          {token.reading ? (
            <Text
              style={[styles.reading, { color: tokens.mutedForeground }]}
              numberOfLines={1}
            >
              {token.reading}
            </Text>
          ) : null}
        </View>
        {canAct ? (
          <View style={styles.actions}>
            <NemuPressable
              accessibilityRole="button"
              accessibilityLabel={strings.reader.pluginJapaneseLearningCopyWord}
              minimumTouchTarget
              onPress={handleCopyWord}
              pressedScale={0.94}
              style={[
                styles.iconAction,
                { backgroundColor: tokens.muted, borderColor: tokens.border },
              ]}
            >
              <Ionicons name="copy-outline" size={14} color={tokens.mutedForeground} />
            </NemuPressable>
            {onAskNemu ? (
              <NemuPressable
                accessibilityRole="button"
                accessibilityLabel={strings.reader.pluginJapaneseLearningAskWord}
                minimumTouchTarget
                onPress={onAskNemu}
                pressedScale={0.94}
                style={[
                  styles.askAction,
                  {
                    backgroundColor: tokens.primary,
                    borderColor: tokens.primary,
                  },
                ]}
              >
                <Ionicons
                  name="chatbubble-ellipses-outline"
                  size={13}
                  color={tokens.primaryForeground}
                />
                <Text
                  style={[
                    styles.askActionText,
                    { color: tokens.primaryForeground },
                  ]}
                >
                  {strings.reader.pluginJapaneseLearningAskWord}
                </Text>
              </NemuPressable>
            ) : null}
          </View>
        ) : null}
      </View>

      {/* POS tags row */}
      {posLabel ? (
        <View style={styles.posTagRow}>
          <View
            style={[
              styles.posTag,
              {
                backgroundColor: posStyle.bg,
                borderColor: posStyle.border,
              },
            ]}
          >
            <Text style={[styles.posTagText, { color: posStyle.text }]}>
              {posLabel}
            </Text>
          </View>
          {token.conjugationTypes?.map((conj, index) => (
            <View
              key={`conj-${index}-${conj}`}
              style={[
                styles.posTag,
                {
                  backgroundColor: tokens.muted,
                  borderColor: "transparent",
                },
              ]}
            >
              <Text
                style={[styles.posTagText, { color: tokens.mutedForeground }]}
              >
                {conj}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  wordBlock: {
    flex: 1,
    flexShrink: 1,
    gap: 2,
  },
  word: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: nemuFontWeight.semibold,
  },
  reading: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: nemuFontWeight.regular,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  iconAction: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  askAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 30,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  askActionText: {
    fontSize: 12,
    fontWeight: nemuFontWeight.semibold,
  },
  posTagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    alignItems: "center",
  },
  posTag: {
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  posTagText: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: nemuFontWeight.semibold,
  },
});
