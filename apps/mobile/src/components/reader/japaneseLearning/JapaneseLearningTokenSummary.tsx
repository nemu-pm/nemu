import { Platform, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  nemuFontWeight,
  NemuPressable,
  radius,
  useNemuTheme,
} from "@/design-system";
import type { MobileGrammarToken } from "@/lib/mobileJapaneseLearningGrammar";
import {
  mobileJapaneseLearningPosTagStyle,
  mobileJapaneseLearningTokenCanAct,
} from "@/lib/mobileJapaneseLearningPosStyles";
import { JAPANESE_LEARNING_SERIF_FONT_FAMILY } from "@/lib/mobileJapaneseLearningSurfaceTheme";
import type { MobileStrings } from "@/lib/mobileI18n";

/** Web `POSTag` label: conjugation name, else POS name, else the raw label. */
export function japaneseLearningPosTagLabel(pos: string, strings: MobileStrings): string {
  return (
    strings.japaneseLearningGrammar.conjugationNames[pos] ??
    strings.japaneseLearningGrammar.posNames[pos] ??
    pos
  );
}

/** Web `POSTag` (token-details.tsx): category-coloured pill, or muted when `subtle`. */
export function JapaneseLearningPosTag({
  pos,
  subtle = false,
  strings,
}: {
  pos: string;
  subtle?: boolean;
  strings: MobileStrings;
}) {
  const { tokens, scheme } = useNemuTheme();
  if (!pos.trim()) return null;
  const tag = mobileJapaneseLearningPosTagStyle(pos, scheme === "dark" ? "dark" : "light");
  return (
    <View
      style={[
        styles.posTag,
        subtle
          ? { backgroundColor: tokens.muted, borderColor: "transparent" }
          : { backgroundColor: tag.background, borderColor: tag.border },
      ]}
    >
      <Text style={[styles.posTagText, { color: subtle ? tokens.mutedForeground : tag.text }]}>
        {japaneseLearningPosTagLabel(pos, strings)}
      </Text>
    </View>
  );
}

/**
 * Web `TokenSummary` (token-details.tsx): the word in the textbook serif with
 * its reading, the Copy / Ask actions, then the POS tags row (the POS itself
 * only when there is nothing else to show, plus conjugation types).
 */
export function JapaneseLearningTokenSummary({
  token,
  strings,
  onAskNemu,
  onCopy,
  nested = false,
}: {
  token: MobileGrammarToken;
  strings: MobileStrings;
  onAskNemu?: () => void;
  onCopy?: (text: string) => void;
  nested?: boolean;
}) {
  const { tokens } = useNemuTheme();
  const showActions = mobileJapaneseLearningTokenCanAct(token);
  const shouldShowPosOnly =
    token.components.length === 0 &&
    token.meanings.length === 0 &&
    token.alternatives.length === 0 &&
    token.conjugations.length === 0 &&
    token.partOfSpeech.length > 0;
  const conjugationTypes = token.conjugationTypes ?? [];
  const cleanReading = token.reading.replace(/\u200c/g, "");
  const reading = cleanReading === token.word ? "" : cleanReading;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.wordBlock}>
          <Text
            selectable
            style={[styles.word, nested ? styles.wordNested : null, { color: tokens.foreground }]}
          >
            {token.word}
          </Text>
          {reading ? (
            <Text selectable style={[styles.reading, { color: tokens.mutedForeground }]}>
              {reading}
            </Text>
          ) : null}
        </View>
        {showActions ? (
          <View style={styles.actions}>
            {onCopy ? (
              <NemuPressable
                accessibilityRole="button"
                accessibilityLabel={strings.reader.pluginJapaneseLearningCopyWord}
                minimumTouchTarget
                onPress={() => onCopy(token.word)}
                pressedScale={0.94}
                style={styles.iconAction}
              >
                <Ionicons name="copy-outline" size={14} color={tokens.mutedForeground} />
              </NemuPressable>
            ) : null}
            {onAskNemu ? (
              <NemuPressable
                accessibilityRole="button"
                accessibilityLabel={strings.reader.pluginJapaneseLearningAskWord}
                minimumTouchTarget
                onPress={onAskNemu}
                pressedScale={0.94}
                style={[styles.askAction, { backgroundColor: tokens.primary }]}
              >
                <Ionicons
                  name="chatbubbles-outline"
                  size={13}
                  color={tokens.primaryForeground}
                />
                <Text style={[styles.askActionText, { color: tokens.primaryForeground }]}>
                  {strings.reader.pluginJapaneseLearningAskWord}
                </Text>
              </NemuPressable>
            ) : null}
          </View>
        ) : null}
      </View>

      {shouldShowPosOnly || conjugationTypes.length > 0 ? (
        <View style={styles.posTagRow}>
          {shouldShowPosOnly ? <JapaneseLearningPosTag pos={token.partOfSpeech} strings={strings} /> : null}
          {conjugationTypes.map((conjugation, index) => (
            <JapaneseLearningPosTag
              key={`conj-${index}-${conjugation}`}
              pos={conjugation}
              subtle
              strings={strings}
            />
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
  // Web: `flex items-baseline gap-3 flex-wrap`.
  wordBlock: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    columnGap: 12,
  },
  // Web: `.ja-textbook text-2xl font-semibold tracking-tight`.
  word: {
    fontFamily: Platform.select(JAPANESE_LEARNING_SERIF_FONT_FAMILY),
    fontSize: 24,
    lineHeight: 32,
    fontWeight: nemuFontWeight.semibold,
    letterSpacing: -0.4,
  },
  wordNested: {
    fontSize: 22,
    lineHeight: 30,
  },
  // Web: `text-base text-muted-foreground`.
  reading: {
    fontSize: 16,
    lineHeight: 22,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  // Web: ghost `icon-xs` button.
  iconAction: {
    width: 30,
    minHeight: 30,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  // Web: primary `xs` button with icon.
  askAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 30,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
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
  // Web `POSTag`: `px-2 py-0.5 rounded-md text-[0.65rem] font-medium tracking-wide border`.
  posTag: {
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  posTagText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: nemuFontWeight.medium,
    letterSpacing: 0.25,
  },
});
