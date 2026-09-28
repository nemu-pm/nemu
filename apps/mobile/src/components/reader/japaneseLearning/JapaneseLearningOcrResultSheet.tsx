import { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  nemuColorWithAlpha,
  nemuFontWeight,
  nemuText,
  NemuPressable,
  NemuRingSpinner,
  radius,
  useNemuTheme,
} from "@/design-system";
import { JapaneseLearningSurfaceFrame } from "./JapaneseLearningSurfaceFrame";
import { mobileJapaneseLearningSentenceActionsLayout } from "@/lib/mobileJapaneseLearningTranscriptFlow";
import { describeJapaneseLearningOcrError } from "@/lib/mobileJapaneseLearningOcr";
import type { MobileStrings } from "@/lib/mobileI18n";
import type { JapaneseLearningGrammarState } from "./JapaneseLearningSentenceDisplay";
import { JapaneseLearningSentenceDisplay } from "./JapaneseLearningSentenceDisplay";
import {
  JapaneseLearningBubblePreview,
  type JapaneseLearningBubbleSource,
} from "./JapaneseLearningBubblePreview";

export interface JapaneseLearningOcrStateLike {
  status: "idle" | "loading" | "ready" | "error";
  detail?: string;
  result?: { text?: string; source?: string };
}

export interface JapaneseLearningTtsStateLike {
  status: "idle" | "loading" | "playing" | "error";
  source?: "sentence" | "transcript" | "chat";
  detail?: string;
}

interface OcrResultSheetProps {
  visible: boolean;
  /** Docked beside the page (regular width / book / notebook) instead of a sheet. */
  docked?: boolean;
  strings: MobileStrings;
  ocrState: JapaneseLearningOcrStateLike;
  grammarState: JapaneseLearningGrammarState;
  selectedTokenIndex: number | null;
  grammarActionNotice: string | null;
  ttsState: JapaneseLearningTtsStateLike;
  askDisabled: boolean;
  canActOnSentence: boolean;
  sentenceTtsBusy: boolean;
  sentenceTtsLoading: boolean;
  onClose: () => void;
  onSelectToken: (index: number | null) => void;
  onAskSelection: (text: string, kind: "word" | "words" | "sentence") => void;
  onCopySelection: (text: string) => void;
  /** Runs the sentence analysis again after it failed. */
  onRetryGrammar?: () => void;
  onPlaySentence: () => void;
  onAskSentence: () => void;
  onCopySentence: () => void;
  /** Called after the surface has closed (sheet dismissal finished / dock removed). */
  onDismiss?: () => void;
  /** The selected bubble cropped from the page (web text popout); null without a page image. */
  bubble?: JapaneseLearningBubbleSource | null;
}

/**
 * Mobile port of web `OcrResultSheet` (ocr-result-sheet.tsx): the sentence
 * analysis (raw text → furigana tokens coloured by part of speech → word
 * details) above one footer row — ghost Listen, primary "Ask about this
 * sentence", ghost Copy — exactly as web. The row stacks only when Dynamic
 * Type makes the labels too large for one line.
 */
export function JapaneseLearningOcrResultSheet({
  visible,
  strings,
  ocrState,
  grammarState,
  selectedTokenIndex,
  grammarActionNotice,
  ttsState,
  askDisabled,
  canActOnSentence,
  sentenceTtsBusy,
  sentenceTtsLoading,
  onClose,
  onSelectToken,
  onAskSelection,
  onCopySelection,
  onRetryGrammar,
  onPlaySentence,
  onAskSentence,
  onCopySentence,
  onDismiss,
  bubble = null,
  docked = false,
}: OcrResultSheetProps) {
  const { tokens } = useNemuTheme();
  const { fontScale } = useWindowDimensions();
  const largeTextLayout = fontScale > 1.3;
  // Web keeps the three actions on one row at every width; the footer's own
  // width (sheet, docked panel or study desk) decides only for Dynamic Type.
  const [footerWidth, setFooterWidth] = useState(0);
  const footerLayout = mobileJapaneseLearningSentenceActionsLayout({
    fontScale,
    footerWidth,
  });
  const stackFooterActions = footerLayout === "stacked";
  const compactFooterActions = footerLayout === "compact";
  // Wide footers use web's three equal buttons; narrower ones give the
  // primary label the room so it stays on one line.
  const equalFooterActions = footerLayout === "row" && footerWidth >= 520;
  const [diagnosticOpen, setDiagnosticOpen] = useState(false);

  const ocrErrorCopy =
    ocrState.status === "error"
      ? describeJapaneseLearningOcrError(ocrState.detail, strings)
      : null;

  return (
    <JapaneseLearningSurfaceFrame
      docked={docked}
      closeLabel={strings.reader.closeLearningPanel}
      visible={visible}
      onRequestClose={onClose}
      onDismiss={onDismiss}
      backdropOnPress={onClose}
      frameMaxHeight={largeTextLayout ? "100%" : "70%"}
      contentStyle={{ padding: 0, gap: 0 }}
    >
      <View style={styles.sheetBody}>
        {ocrState.status === "loading" ? (
          // Web: a 48pt primary ring over "Extracting text from image…".
          <View accessibilityLiveRegion="polite" style={styles.loadingState}>
            <NemuRingSpinner
              size={48}
              thickness={2}
              color={tokens.primary}
              trackColor={nemuColorWithAlpha(tokens.primary, 0.3)}
            />
            <Text style={[styles.loadingText, { color: tokens.mutedForeground }]}>
              {strings.reader.pluginJapaneseLearningExtractingText}
            </Text>
          </View>
        ) : ocrState.status === "error" && ocrErrorCopy ? (
          <View style={styles.errorState}>
            <Ionicons
              name={
                ocrErrorCopy.kind === "unavailable"
                  ? "cloud-offline-outline"
                  : "alert-circle-outline"
              }
              size={24}
              color={tokens.mutedForeground}
            />
            <Text
              accessibilityLiveRegion="assertive"
              accessibilityRole="alert"
              style={[styles.errorTitle, { color: tokens.foreground }]}
            >
              {ocrErrorCopy.title}
            </Text>
            <Text
              style={[
                styles.errorDescription,
                { color: tokens.mutedForeground },
              ]}
            >
              {ocrErrorCopy.description}
            </Text>
            {ocrErrorCopy.diagnostic ? (
              <View style={styles.diagnostic}>
                <NemuPressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: diagnosticOpen }}
                  accessibilityLabel={strings.feedback.technicalDetails}
                  hapticFeedback="selection"
                  pressProfile="row"
                  onPress={() => setDiagnosticOpen((open) => !open)}
                  style={styles.diagnosticToggle}
                >
                  <Ionicons
                    name={
                      diagnosticOpen
                        ? "chevron-down-outline"
                        : "chevron-forward-outline"
                    }
                    size={12}
                    color={tokens.mutedForeground}
                  />
                  <Text
                    style={[nemuText.caption, { color: tokens.mutedForeground }]}
                  >
                    {strings.feedback.technicalDetails}
                  </Text>
                </NemuPressable>
                {diagnosticOpen ? (
                  <Text
                    selectable
                    style={[
                      styles.diagnosticBody,
                      styles.diagnosticMono,
                      {
                        backgroundColor: tokens.secondary,
                        color: tokens.mutedForeground,
                      },
                    ]}
                  >
                    {ocrErrorCopy.diagnostic}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
        ) : (
          <>
          {bubble ? (
            <JapaneseLearningBubblePreview
              source={bubble}
              accessibilityLabel={strings.reader.pluginJapaneseLearningSelectedText}
            />
          ) : null}
          <JapaneseLearningSentenceDisplay
            grammarState={grammarState}
            selectedTokenIndex={selectedTokenIndex}
            actionNotice={grammarActionNotice}
            askDisabled={askDisabled}
            strings={strings}
            onSelectToken={onSelectToken}
            onAskSelection={onAskSelection}
            onCopySelection={onCopySelection}
            onRetry={onRetryGrammar}
          />
          </>
        )}
      </View>

      {ttsState.status === "error" &&
      ttsState.source === "sentence" &&
      ocrState.status !== "error" ? (
        <Text
          accessibilityLiveRegion="assertive"
          accessibilityRole="alert"
          style={[styles.ttsErrorText, { color: tokens.danger }]}
        >
          {ttsState.detail}
        </Text>
      ) : null}

      <View
        onLayout={(event) => setFooterWidth(event.nativeEvent.layout.width)}
        style={[
          styles.footer,
          {
            backgroundColor: nemuColorWithAlpha(tokens.background, 0.8),
            borderTopColor: nemuColorWithAlpha(tokens.mutedForeground, 0.14),
          },
        ]}
      >
        <View
          style={[
            styles.footerActions,
            stackFooterActions ? styles.footerActionsStacked : null,
          ]}
        >
          <NemuPressable
            accessibilityRole="button"
            accessibilityLabel={
              sentenceTtsBusy
                ? strings.reader.pluginJapaneseLearningStopListening
                : strings.reader.pluginJapaneseLearningListen
            }
            accessibilityState={{ disabled: !canActOnSentence }}
            disabled={!canActOnSentence}
            onPress={onPlaySentence}
            pressedScale={0.96}
            containerStyle={[
              styles.footerActionContainer,
              equalFooterActions ? styles.footerActionContainerEqual : null,
              stackFooterActions
                ? styles.footerActionContainerStacked
                : null,
            ]}
            style={[
              styles.footerAction,
              styles.footerActionGhost,
              { opacity: canActOnSentence ? 1 : 0.5 },
            ]}
          >
            {sentenceTtsLoading ? (
              <ActivityIndicator size="small" color={tokens.foreground} />
            ) : (
              <Ionicons
                name={sentenceTtsBusy ? "pause-outline" : "play-outline"}
                size={14}
                color={tokens.foreground}
              />
            )}
            {compactFooterActions ? null : (
              <Text
                style={[styles.footerActionText, { color: tokens.foreground }]}
              >
                {sentenceTtsBusy
                  ? strings.reader.pluginJapaneseLearningStopListening
                  : strings.reader.pluginJapaneseLearningListen}
              </Text>
            )}
          </NemuPressable>

          <NemuPressable
            accessibilityRole="button"
            accessibilityLabel={strings.reader.pluginJapaneseLearningAskAboutThisSentence}
            accessibilityState={{ disabled: !canActOnSentence || askDisabled }}
            disabled={!canActOnSentence || askDisabled}
            onPress={onAskSentence}
            pressedScale={0.96}
            containerStyle={[
              styles.footerActionContainer,
              equalFooterActions ? styles.footerActionContainerEqual : null,
              styles.footerActionContainerPrimary,
              stackFooterActions
                ? styles.footerActionContainerStacked
                : null,
            ]}
            style={[
              styles.footerAction,
              {
                backgroundColor: tokens.primary,
                borderColor: tokens.primary,
                opacity: !canActOnSentence || askDisabled ? 0.5 : 1,
              },
            ]}
          >
            <Ionicons name="chatbubbles-outline" size={14} color={tokens.primaryForeground} />
            <Text
              style={[
                styles.footerActionText,
                { color: tokens.primaryForeground },
              ]}
            >
              {strings.reader.pluginJapaneseLearningAskAboutThisSentence}
            </Text>
          </NemuPressable>

          <NemuPressable
            accessibilityRole="button"
            accessibilityLabel={strings.reader.pluginJapaneseLearningCopySentence}
            accessibilityState={{ disabled: !canActOnSentence }}
            disabled={!canActOnSentence}
            onPress={onCopySentence}
            pressedScale={0.96}
            containerStyle={[
              styles.footerActionContainer,
              equalFooterActions ? styles.footerActionContainerEqual : null,
              stackFooterActions
                ? styles.footerActionContainerStacked
                : null,
            ]}
            style={[
              styles.footerAction,
              styles.footerActionGhost,
              { opacity: canActOnSentence ? 1 : 0.5 },
            ]}
          >
            <Ionicons name="copy-outline" size={14} color={tokens.foreground} />
            {compactFooterActions ? null : (
              <Text
                style={[styles.footerActionText, { color: tokens.foreground }]}
              >
                {strings.reader.pluginJapaneseLearningCopySelection}
              </Text>
            )}
          </NemuPressable>
        </View>
      </View>
    </JapaneseLearningSurfaceFrame>
  );
}

const styles = StyleSheet.create({
  sheetBody: {
    flex: 1,
    minHeight: 0,
  },
  loadingState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 64,
    gap: 16,
  },
  loadingText: {
    fontSize: 13,
    fontWeight: nemuFontWeight.medium,
  },
  errorState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  errorTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: nemuFontWeight.semibold,
    textAlign: "center",
  },
  errorDescription: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
  diagnostic: {
    alignSelf: "stretch",
    alignItems: "center",
    gap: 4,
  },
  diagnosticToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  diagnosticBody: {
    alignSelf: "stretch",
    padding: 10,
    borderRadius: 8,
  },
  diagnosticMono: {
    fontFamily: Platform.select({
      ios: "Menlo",
      android: "monospace",
      default: "monospace",
    }),
    fontSize: 11,
    lineHeight: 15,
  },
  ttsErrorText: {
    fontSize: 12,
    fontWeight: nemuFontWeight.medium,
    paddingHorizontal: 16,
    paddingVertical: 10,
    textAlign: "center",
  },
  // Web `DrawerFooter`: p-4, hairline top border, translucent background.
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 14,
  },
  footerActions: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
  },
  footerActionsStacked: {
    flexDirection: "column",
  },
  footerAction: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "transparent",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  // Ghost actions take their content width; the primary label (the longest)
  // gets the rest, so it stays on one line the way web's wide drawer shows it.
  footerActionContainer: {
    flexGrow: 0,
    flexShrink: 0,
    minWidth: 48,
  },
  // Web: three equal `flex-1` buttons whenever the labels fit.
  footerActionContainerEqual: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
  },
  footerActionContainerPrimary: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  footerActionContainerStacked: {
    flex: 0,
    width: "100%",
  },
  footerActionGhost: {
    backgroundColor: "transparent",
  },
  footerActionText: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: nemuFontWeight.medium,
    textAlign: "center",
  },
});
