import { Platform, StyleSheet, View } from "react-native";
import { JapaneseLearningWebIcon } from "./JapaneseLearningWebIcon";
import {
  nemuFontWeight,
  nemuColorWithAlpha,
  NemuPressable,
  useNemuTheme,
} from "@/design-system";
import { JapaneseLearningText as Text } from "./JapaneseLearningText";
import type { MobileGrammarToken } from "@/lib/mobileJapaneseLearningGrammar";
import {
  mobileJapaneseLearningPosTagStyle,
  mobileJapaneseLearningTokenCanAct,
} from "@/lib/mobileJapaneseLearningPosStyles";
import { JAPANESE_LEARNING_SERIF_SEMIBOLD_FONT_FAMILY } from "@/lib/mobileJapaneseLearningSurfaceTheme";
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
          ? { backgroundColor: nemuColorWithAlpha(tokens.muted, 0.5), borderColor: "transparent" }
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
  regularWidth = false,
}: {
  token: MobileGrammarToken;
  strings: MobileStrings;
  onAskNemu?: () => void;
  onCopy?: (text: string) => void;
  regularWidth?: boolean;
}) {
  const { tokens } = useNemuTheme();
  const showActions = mobileJapaneseLearningTokenCanAct(token);
  const shouldShowPosOnly =
    token.components.length === 0 &&
    token.meanings.length === 0 &&
    token.alternatives.length === 0 &&
    token.conjugations.length === 0 &&
    token.partOfSpeech.length > 0 &&
    !token.isSuffix;
  const conjugationTypes = token.conjugationTypes ?? [];
  const cleanReading = token.reading.replace(/\u200c/g, "");
  const reading = cleanReading === token.word ? "" : cleanReading;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.wordBlock}>
          <Text
            selectable
            style={[styles.word, regularWidth ? styles.wordRegular : null, { color: tokens.foreground }]}
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
                hitSlop={10}
                onPress={() => onCopy(token.word)}
                pressedScale={0.94}
                style={styles.iconAction}
              >
                <JapaneseLearningWebIcon name="copy" color={tokens.mutedForeground} />
              </NemuPressable>
            ) : null}
            {onAskNemu ? (
              <NemuPressable
                accessibilityRole="button"
                accessibilityLabel={strings.reader.pluginJapaneseLearningAskWord}
                hitSlop={10}
                onPress={onAskNemu}
                pressedScale={0.94}
                style={[styles.askAction, { backgroundColor: tokens.primary }]}
              >
                <JapaneseLearningWebIcon
                  name="ask"
                  size={14}
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

      {shouldShowPosOnly || conjugationTypes.length > 0 || token.suffix ? (
        <View style={styles.posTagRow}>
          {shouldShowPosOnly ? <JapaneseLearningPosTag pos={token.partOfSpeech} strings={strings} /> : null}
          {token.suffix ? <JapaneseLearningPosTag pos={token.suffix} strings={strings} subtle /> : null}
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
  // Web: `items-start` with the actions `mt-1`, which centres the 24pt
  // actions on the headword's 32pt line. Centring the row does the same
  // without depending on the serif's line box.
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
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
    // The SemiBold face carries the weight; no synthesized bold on top.
    fontFamily: Platform.select(JAPANESE_LEARNING_SERIF_SEMIBOLD_FONT_FAMILY),
    fontSize: 24,
    lineHeight: 32,
    fontWeight: "normal",
    letterSpacing: -0.6,
  },
  wordRegular: {
    fontSize: 30,
    lineHeight: 36,
  },
  // Web: `text-base text-muted-foreground`.
  reading: {
    fontSize: 16,
    lineHeight: 24,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  // Web: ghost `icon-xs` button (24pt, `rounded-md`).
  iconAction: {
    width: 24,
    height: 24,
    borderRadius: 8.4,
    alignItems: "center",
    justifyContent: "center",
  },
  // Web: primary `xs` button with icon (24pt, `px-2 gap-1 rounded-md`,
  // `.btn-nemu-primary` edge and shadow).
  askAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 24,
    borderRadius: 8.4,
    borderWidth: 0.5,
    borderColor: "rgba(143,181,255,0.25)",
    boxShadow: "0px 2px 8px 0px rgba(0,0,0,0.35), 0px 0px 1px 0px rgba(0,0,0,0.3)",
    paddingHorizontal: 8,
  },
  askActionText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: nemuFontWeight.medium,
  },
  posTagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    alignItems: "center",
  },
  // Web `POSTag`: `px-2 py-0.5 rounded-md text-[0.65rem] font-medium tracking-wide border`.
  // Measured: 20.85pt tall (14.86 line + 2 + 2 padding + two 1px borders).
  posTag: {
    borderRadius: 8.4,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  posTagText: {
    fontSize: 10.4,
    lineHeight: 14.86,
    fontWeight: nemuFontWeight.medium,
    letterSpacing: 0.26,
  },
});
