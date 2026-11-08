import { Fragment, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { nemuColorWithAlpha, nemuFontWeight, useNemuTheme } from "@/design-system";
import { JapaneseLearningText as Text } from "./JapaneseLearningText";
import type { MobileGrammarToken } from "@/lib/mobileJapaneseLearningGrammar";
import type { MobileStrings } from "@/lib/mobileI18n";
import { mobileJapaneseLearningPosCategory } from "@/lib/mobileJapaneseLearningPosStyles";
import { mobileJapaneseLearningSurfaceColors } from "@/lib/mobileJapaneseLearningSurfaceTheme";
import { JapaneseLearningPosTag, JapaneseLearningTokenSummary } from "./JapaneseLearningTokenSummary";

/** Web `SectionHeader`: tiny uppercase label followed by a hairline rule. */
function SectionHeader({ children }: { children: ReactNode }) {
  const { tokens } = useNemuTheme();
  return (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, { color: tokens.mutedForeground }]}>{children}</Text>
      <View style={[styles.sectionRule, { backgroundColor: nemuColorWithAlpha(tokens.mutedForeground, 0.18) }]} />
    </View>
  );
}

/** Web `TokenMeanings`: numbered senses, each with its POS tags, gloss and note. */
function TokenMeanings({
  meanings,
  strings,
}: {
  meanings: MobileGrammarToken["meanings"];
  strings: MobileStrings;
}) {
  const { tokens } = useNemuTheme();
  if (meanings.length === 0) return null;
  return (
    <View style={styles.meaningList}>
      {meanings.map((meaning, index) => (
        <View key={`${index}-${meaning.text}`} style={styles.meaningRow}>
          <View style={[styles.meaningNumber, { backgroundColor: nemuColorWithAlpha(tokens.muted, 0.8) }]}>
            <Text style={[styles.meaningNumberText, { color: tokens.mutedForeground }]}>{index + 1}</Text>
          </View>
          <View style={styles.meaningBody}>
            {meaning.partOfSpeech.length > 0 ? (
              <View style={styles.meaningTags}>
                {meaning.partOfSpeech.map((pos, posIndex) => (
                  <JapaneseLearningPosTag key={`${posIndex}-${pos}`} pos={pos} strings={strings} />
                ))}
              </View>
            ) : null}
            <Text selectable style={[styles.meaningText, { color: nemuColorWithAlpha(tokens.foreground, 0.9) }]}>
              {meaning.text}
            </Text>
            {meaning.info ? (
              <Text selectable style={[styles.meaningInfo, { color: tokens.mutedForeground }]}>
                {meaning.info}
              </Text>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * Mobile port of web `TokenDetails` (token-details.tsx): the details card for
 * the selected word — summary, numbered meanings, then Structure (compound
 * parts), Base form (conjugation source) and Alternative readings, each nested
 * entry rendered as the same card in its inset style.
 */
export function JapaneseLearningTokenDetails({
  token,
  strings,
  isNested = false,
  regularWidth = false,
  onAskNemu,
  onCopy,
}: {
  token: MobileGrammarToken;
  strings: MobileStrings;
  isNested?: boolean;
  regularWidth?: boolean;
  onAskNemu?: () => void;
  onCopy?: (text: string) => void;
}) {
  const { tokens, scheme } = useNemuTheme();
  const colors = mobileJapaneseLearningSurfaceColors(scheme === "dark" ? "dark" : "light");
  const shouldShowMeanings =
    token.components.length === 0 &&
    token.meanings.length > 0 &&
    mobileJapaneseLearningPosCategory(token) !== "punctuation";

  return (
    <View
      style={[
        styles.card,
        isNested
          ? {
              padding: 12,
              backgroundColor: nemuColorWithAlpha(tokens.muted, 0.3),
              borderColor: nemuColorWithAlpha(tokens.mutedForeground, 0.14),
            }
          : {
              padding: regularWidth ? 20 : 16,
              backgroundColor: colors.detailsCard,
              borderColor: colors.detailsCardBorder,
              boxShadow: scheme === "dark"
                ? "0 2px 12px rgba(0,0,0,0.25), 0 8px 32px rgba(0,0,0,0.2), inset 0 0.5px 0 rgba(255,255,255,0.06), inset 0 -0.5px 0 rgba(0,0,0,0.15)"
                : "0 2px 8px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.06), inset 0 0.5px 0 rgba(255,255,255,0.8), inset 0 -0.5px 0 rgba(0,0,0,0.02)",
            },
      ]}
    >
      <JapaneseLearningTokenSummary
        token={token}
        strings={strings}
        regularWidth={regularWidth}
        onAskNemu={isNested ? undefined : onAskNemu}
        onCopy={onCopy}
      />

      {shouldShowMeanings ? (
        <View style={styles.meaningsBlock}>
          <TokenMeanings meanings={token.meanings} strings={strings} />
        </View>
      ) : null}

      {token.components.length > 0 ? (
        <View style={styles.section}>
          <SectionHeader>{strings.reader.pluginJapaneseLearningStructure}</SectionHeader>
          <View style={styles.componentRow}>
            {token.components.map((component, index) => (
              <Fragment key={`${index}-${component.word}`}>
                <View style={[styles.componentChip, { backgroundColor: nemuColorWithAlpha(tokens.secondary, 0.8) }]}>
                  <Text selectable style={[styles.componentText, { color: tokens.foreground }]}>
                    {component.word}
                  </Text>
                </View>
                {index < token.components.length - 1 ? (
                  <Text style={[styles.componentPlus, { color: nemuColorWithAlpha(tokens.mutedForeground, 0.5) }]}>+</Text>
                ) : null}
              </Fragment>
            ))}
          </View>
          <View style={styles.nestedList}>
            {token.components.map((component, index) => (
              <JapaneseLearningTokenDetails
                key={`${index}-${component.word}-component`}
                token={component}
                strings={strings}
                isNested
                regularWidth={regularWidth}
                onCopy={onCopy}
              />
            ))}
          </View>
        </View>
      ) : null}

      {token.conjugations.length > 0 ? (
        <View style={styles.section}>
          <SectionHeader>
            {token.hasConjugationVia
              ? strings.reader.pluginJapaneseLearningConjugationPath
              : strings.reader.pluginJapaneseLearningBaseForm}
          </SectionHeader>
          <View style={styles.nestedList}>
            {token.conjugations.map((conjugation, index) => (
              <JapaneseLearningTokenDetails
                key={`${index}-${conjugation.word}-conjugation`}
                token={conjugation}
                strings={strings}
                isNested
                regularWidth={regularWidth}
                onCopy={onCopy}
              />
            ))}
          </View>
        </View>
      ) : null}

      {token.alternatives.length > 0 ? (
        <View style={styles.section}>
          <SectionHeader>{strings.reader.pluginJapaneseLearningAlternativeReadings}</SectionHeader>
          <View style={styles.nestedList}>
            {token.alternatives.map((alternative, index) => (
              <JapaneseLearningTokenDetails
                key={`${index}-${alternative.word}-alternative`}
                token={alternative}
                strings={strings}
                isNested
                regularWidth={regularWidth}
                onCopy={onCopy}
              />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Web: `rounded-xl` (radius + 4px), `space-y-4`.
  card: {
    borderRadius: 14,
    borderWidth: 0.5,
    overflow: "hidden",
    gap: 16,
  },
  meaningsBlock: {
    paddingTop: 4,
  },
  meaningList: {
    gap: 12,
  },
  meaningRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  // Web: `w-5 h-5 rounded-full bg-muted/80 text-[0.65rem] font-medium mt-0.5`.
  meaningNumber: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  meaningNumberText: {
    fontSize: 10.4,
    lineHeight: 14.86,
    fontWeight: nemuFontWeight.medium,
  },
  meaningBody: {
    flex: 1,
    minWidth: 0,
  },
  meaningTags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginBottom: 6,
  },
  // Web: `text-sm leading-relaxed`.
  meaningText: {
    fontSize: 14,
    lineHeight: 22.75,
  },
  // Web: `text-xs text-muted-foreground mt-1 italic`.
  meaningInfo: {
    fontSize: 12,
    lineHeight: 16,
    fontStyle: "italic",
    marginTop: 4,
  },
  section: {
    paddingTop: 8,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  // Web: `text-[0.65rem] font-semibold uppercase tracking-widest`.
  sectionTitle: {
    fontSize: 10.4,
    lineHeight: 14.86,
    fontWeight: nemuFontWeight.semibold,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  sectionRule: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  componentRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
  },
  // Web: `px-2.5 py-1 rounded-lg bg-secondary/80 text-sm font-medium`.
  componentChip: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  // Web: plain `text-sm font-medium` (not `.ja-textbook`).
  componentText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: nemuFontWeight.medium,
  },
  componentPlus: {
    fontSize: 12,
    lineHeight: 16,
  },
  nestedList: {
    gap: 8,
  },
});
