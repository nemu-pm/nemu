import { type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  nemuColorWithAlpha,
  nemuFontWeight,
  radius,
  useNemuTheme,
} from "@/design-system";
import { type MobileGrammarToken } from "@/lib/mobileJapaneseLearningGrammar";
import { type MobileStrings } from "@/lib/mobileI18n";
import { mobileGrammarTokenCategory } from "@/lib/mobileJapaneseLearningReaderHelpers";
import {
  mobileJapaneseLearningPosCategory,
  mobileJapaneseLearningPosStyle,
} from "@/lib/mobileJapaneseLearningPosStyles";

type ThemeTokens = ReturnType<typeof useNemuTheme>["tokens"];

/**
 * POS pill mirroring web `POSTag` — uses per-category color theming instead of
 * the previous primary-tinted styling. `subtle` renders a muted variant
 * (matches web `subtle` flag used for conjugation types / suffix).
 *
 * The label here is the human-readable POS string (e.g. "I-Adjective"); the
 * caller resolves the style via `mobileJapaneseLearningPosStyle`, which maps
 * the token's POS to a category color.
 */
export function JapaneseLearningPosPill({
  label,
  pos,
  subtle = false,
  tokens,
}: {
  label: string;
  pos: string;
  subtle?: boolean;
  tokens: ThemeTokens;
}) {
  if (!label.trim()) return null;
  // Resolve category color from the raw POS string (best-effort).
  const dummyToken: MobileGrammarToken = {
    word: "",
    reading: "",
    partOfSpeech: pos || label,
    meanings: [],
    conjugations: [],
    alternatives: [],
    components: [],
  };
  const category = mobileJapaneseLearningPosCategory(dummyToken);
  const posStyle = mobileJapaneseLearningPosStyle(dummyToken);
  const style =
    category === "punctuation" || category === "unknown" || category === "other"
      ? {
          bg: subtle
            ? tokens.muted
            : nemuColorWithAlpha(tokens.mutedForeground, 0.13),
          text: tokens.mutedForeground,
          border: "transparent",
        }
      : subtle
        ? { bg: tokens.muted, text: tokens.mutedForeground, border: "transparent" }
        : { bg: posStyle.bg, text: posStyle.text, border: posStyle.border };

  return (
    <View
      style={[
        styles.japaneseLearningPosPill,
        {
          backgroundColor: style.bg,
          borderColor: style.border,
        },
      ]}
    >
      <Text
        style={[
          styles.japaneseLearningPosPillText,
          { color: style.text },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

export function JapaneseLearningDetailSection({
  title,
  tokens,
  children,
}: {
  title: string;
  tokens: ThemeTokens;
  children: ReactNode;
}) {
  return (
    <View style={styles.japaneseLearningDetailSection}>
      <View style={styles.japaneseLearningDetailSectionHeader}>
        <Text
          style={[
            styles.japaneseLearningDetailSectionTitle,
            { color: tokens.mutedForeground },
          ]}
        >
          {title}
        </Text>
        <View
          style={[
            styles.japaneseLearningDetailSectionRule,
            { backgroundColor: tokens.border },
          ]}
        />
      </View>
      {children}
    </View>
  );
}

export function JapaneseLearningTokenDetails({
  token,
  strings,
  tokens,
  depth = 0,
}: {
  token: MobileGrammarToken;
  strings: MobileStrings;
  tokens: ThemeTokens;
  depth?: number;
}) {
  const shouldShowMeanings =
    token.meanings.length > 0 && mobileGrammarTokenCategory(token) !== "punctuation";
  const canNest = depth < 2;

  return (
    <View
      style={[
        depth > 0
          ? styles.japaneseLearningNestedTokenDetails
          : styles.japaneseLearningTokenDetailsBody,
        depth > 0
          ? { backgroundColor: tokens.muted, borderColor: tokens.border }
          : null,
      ]}
    >
      {depth > 0 ? (
        <>
          <Text
            style={[
              styles.japaneseLearningNestedTokenWord,
              { color: tokens.foreground },
            ]}
          >
            {token.word}
            {token.reading ? `  ${token.reading}` : ""}
          </Text>
          <View style={styles.japaneseLearningPosRow}>
            <JapaneseLearningPosPill
              label={token.partOfSpeech}
              pos={token.partOfSpeech}
              tokens={tokens}
            />
            {token.conjugationTypes?.map((conjugation, index) => (
              <JapaneseLearningPosPill
                key={`${index}-${conjugation}`}
                label={conjugation}
                pos={conjugation}
                subtle
                tokens={tokens}
              />
            ))}
          </View>
        </>
      ) : null}

      {shouldShowMeanings ? (
        <View style={styles.japaneseLearningMeaningList}>
          {token.meanings.map((meaning, index) => (
            <View
              key={`${index}-${meaning.text}`}
              style={styles.japaneseLearningMeaningRow}
            >
              <View
                style={[
                  styles.japaneseLearningMeaningNumber,
                  { backgroundColor: tokens.muted },
                ]}
              >
                <Text
                  style={[
                    styles.japaneseLearningMeaningNumberText,
                    { color: tokens.mutedForeground },
                  ]}
                >
                  {index + 1}
                </Text>
              </View>
              <View style={styles.japaneseLearningMeaningBody}>
                {meaning.partOfSpeech.length > 0 ? (
                  <View style={styles.japaneseLearningPosRow}>
                    {meaning.partOfSpeech.map((pos, posIndex) => (
                      <JapaneseLearningPosPill
                        key={`${posIndex}-${pos}`}
                        label={pos}
                        pos={pos}
                        tokens={tokens}
                      />
                    ))}
                  </View>
                ) : null}
                <Text
                  style={[
                    styles.japaneseLearningMeaningText,
                    { color: tokens.foreground },
                  ]}
                >
                  {meaning.text}
                </Text>
                {meaning.info ? (
                  <Text
                    style={[
                      styles.japaneseLearningMeaningInfo,
                      { color: tokens.mutedForeground },
                    ]}
                  >
                    {meaning.info}
                  </Text>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      ) : depth > 0 ? (
        <Text
          style={[
            styles.japaneseLearningTokenDetailsMeta,
            { color: tokens.mutedForeground },
          ]}
        >
          {strings.reader.pluginJapaneseLearningNoMeanings}
        </Text>
      ) : null}

      {token.components.length > 0 ? (
        <JapaneseLearningDetailSection
          title={strings.reader.pluginJapaneseLearningStructure}
          tokens={tokens}
        >
          <View style={styles.japaneseLearningComponentRow}>
            {token.components.map((component, index) => (
              <View
                key={`${index}-${component.word}`}
                style={styles.japaneseLearningComponentPair}
              >
                <View
                  style={[
                    styles.japaneseLearningComponentPill,
                    { backgroundColor: tokens.muted },
                  ]}
                >
                  <Text
                    style={[
                      styles.japaneseLearningComponentText,
                      { color: tokens.foreground },
                    ]}
                  >
                    {component.word}
                  </Text>
                </View>
                {index < token.components.length - 1 ? (
                  <Text
                    style={[
                      styles.japaneseLearningComponentPlus,
                      { color: tokens.mutedForeground },
                    ]}
                  >
                    +
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
          {canNest ? (
            <View style={styles.japaneseLearningNestedList}>
              {token.components.map((component, index) => (
                <JapaneseLearningTokenDetails
                  key={`${index}-${component.word}-component`}
                  token={component}
                  strings={strings}
                  tokens={tokens}
                  depth={depth + 1}
                />
              ))}
            </View>
          ) : null}
        </JapaneseLearningDetailSection>
      ) : null}

      {token.conjugations.length > 0 ? (
        <JapaneseLearningDetailSection
          title={strings.reader.pluginJapaneseLearningBaseForm}
          tokens={tokens}
        >
          <View style={styles.japaneseLearningNestedList}>
            {token.conjugations.map((conjugation, index) => (
              <JapaneseLearningTokenDetails
                key={`${index}-${conjugation.word}-conjugation`}
                token={conjugation}
                strings={strings}
                tokens={tokens}
                depth={depth + 1}
              />
            ))}
          </View>
        </JapaneseLearningDetailSection>
      ) : null}

      {token.alternatives.length > 0 ? (
        <JapaneseLearningDetailSection
          title={strings.reader.pluginJapaneseLearningAlternativeReadings}
          tokens={tokens}
        >
          <View style={styles.japaneseLearningNestedList}>
            {token.alternatives.map((alternative, index) => (
              <JapaneseLearningTokenDetails
                key={`${index}-${alternative.word}-alternative`}
                token={alternative}
                strings={strings}
                tokens={tokens}
                depth={depth + 1}
              />
            ))}
          </View>
        </JapaneseLearningDetailSection>
      ) : null}
    </View>
  );
}

// `japaneseLearningTokenDetailsMeta` is also defined in ReaderScreen's styles
// (the grammar panel uses it); kept here too so this module is self-contained.
// The two definitions are intentionally identical — consolidate when the
// remaining JL components are extracted out of ReaderScreen.
const styles = StyleSheet.create({
  japaneseLearningTokenDetailsMeta: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: nemuFontWeight.bold,
  },
  japaneseLearningTokenDetailsBody: {
    gap: 10,
  },
  japaneseLearningNestedTokenDetails: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 9,
    gap: 7,
  },
  japaneseLearningNestedTokenWord: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: nemuFontWeight.semibold,
  },
  japaneseLearningPosRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
  },
  japaneseLearningPosPill: {
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  japaneseLearningPosPillText: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: nemuFontWeight.semibold,
  },
  japaneseLearningDetailSection: {
    gap: 7,
    paddingTop: 2,
  },
  japaneseLearningDetailSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  japaneseLearningDetailSectionTitle: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: nemuFontWeight.semibold,
    textTransform: "uppercase",
  },
  japaneseLearningDetailSectionRule: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  japaneseLearningMeaningList: {
    gap: 8,
  },
  japaneseLearningMeaningRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  japaneseLearningMeaningNumber: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  japaneseLearningMeaningNumberText: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: nemuFontWeight.semibold,
  },
  japaneseLearningMeaningBody: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  japaneseLearningMeaningText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: nemuFontWeight.bold,
  },
  japaneseLearningMeaningInfo: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: nemuFontWeight.bold,
    fontStyle: "italic",
  },
  japaneseLearningComponentRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
  },
  japaneseLearningComponentPair: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  japaneseLearningComponentPill: {
    borderRadius: radius.md,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  japaneseLearningComponentText: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: nemuFontWeight.semibold,
  },
  japaneseLearningComponentPlus: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: nemuFontWeight.semibold,
  },
  japaneseLearningNestedList: {
    gap: 7,
  },
});