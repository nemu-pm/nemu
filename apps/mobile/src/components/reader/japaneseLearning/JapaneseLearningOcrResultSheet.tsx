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
  MobileSheetScaffold,
  nemuColorWithAlpha,
  nemuFontWeight,
  nemuText,
  NemuPressable,
  radius,
  useNemuTheme,
} from "@/design-system";
import { describeJapaneseLearningOcrError } from "@/lib/mobileJapaneseLearningOcr";
import type { MobileStrings } from "@/lib/mobileI18n";
import type { JapaneseLearningGrammarState } from "./JapaneseLearningSentenceDisplay";
import { JapaneseLearningSentenceDisplay } from "./JapaneseLearningSentenceDisplay";

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
  onPlaySentence: () => void;
  onAskSentence: () => void;
  onCopySentence: () => void;
}

/**
 * Mobile mirror of web `OcrResultSheet` (ocr-result-sheet.tsx).
 * Bottom sheet containing the SentenceDisplay (grammar tokens + details) plus
 * a footer action row: Listen / Ask about sentence / Copy — matching web.
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
  onPlaySentence,
  onAskSentence,
  onCopySentence,
}: OcrResultSheetProps) {
  const { tokens } = useNemuTheme();
  const { fontScale, width } = useWindowDimensions();
  const largeTextLayout = fontScale > 1.3;
  const stackFooterActions = width < 520 || largeTextLayout;
  const [diagnosticOpen, setDiagnosticOpen] = useState(false);

  const ocrErrorCopy =
    ocrState.status === "error"
      ? describeJapaneseLearningOcrError(ocrState.detail, strings)
      : null;

  return (
    <MobileSheetScaffold
      visible={visible}
      onRequestClose={onClose}
      backdropOnPress={onClose}
      frameMaxHeight={largeTextLayout ? "100%" : "70%"}
      contentStyle={{ padding: 0, gap: 0 }}
    >
      <View style={styles.sheetBody}>
        {ocrState.status === "loading" ? (
          <View style={styles.loadingState}>
            <ActivityIndicator size="large" color={tokens.primary} />
            <Text style={[styles.loadingText, { color: tokens.mutedForeground }]}>
              {strings.reader.pluginJapaneseLearningDetectingText}
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
          <JapaneseLearningSentenceDisplay
            grammarState={grammarState}
            selectedTokenIndex={selectedTokenIndex}
            actionNotice={grammarActionNotice}
            askDisabled={askDisabled}
            strings={strings}
            onSelectToken={onSelectToken}
            onAskSelection={onAskSelection}
            onCopySelection={onCopySelection}
          />
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
        style={[
          styles.footer,
          {
            backgroundColor: nemuColorWithAlpha(tokens.background, 0.9),
            borderTopColor: tokens.border,
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
              stackFooterActions
                ? styles.footerActionContainerStacked
                : null,
            ]}
            style={[
              styles.footerAction,
              styles.footerActionGhost,
              {
                borderColor: tokens.border,
                opacity: canActOnSentence ? 1 : 0.72,
              },
            ]}
          >
            {sentenceTtsLoading ? (
              <ActivityIndicator size="small" color={tokens.foreground} />
            ) : (
              <Ionicons
                name={sentenceTtsBusy ? "pause-outline" : "play-outline"}
                size={15}
                color={tokens.foreground}
              />
            )}
            <Text
              style={[styles.footerActionText, { color: tokens.foreground }]}
            >
              {sentenceTtsBusy
                ? strings.reader.pluginJapaneseLearningStopListening
                : strings.reader.pluginJapaneseLearningListen}
            </Text>
          </NemuPressable>

          <NemuPressable
            accessibilityRole="button"
            accessibilityLabel={strings.reader.pluginJapaneseLearningAskSentence}
            accessibilityState={{ disabled: !canActOnSentence || askDisabled }}
            disabled={!canActOnSentence || askDisabled}
            onPress={onAskSentence}
            pressedScale={0.96}
            containerStyle={[
              styles.footerActionContainer,
              stackFooterActions
                ? styles.footerActionContainerStacked
                : null,
            ]}
            style={[
              styles.footerAction,
              {
                backgroundColor: tokens.primary,
                borderColor: tokens.primary,
                opacity: !canActOnSentence || askDisabled ? 0.72 : 1,
              },
            ]}
          >
            <Ionicons name="chatbubble-ellipses-outline" size={15} color={tokens.primaryForeground} />
            <Text
              style={[
                styles.footerActionText,
                { color: tokens.primaryForeground },
              ]}
            >
              {strings.reader.pluginJapaneseLearningAskSentence}
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
              stackFooterActions
                ? styles.footerActionContainerStacked
                : null,
            ]}
            style={[
              styles.footerAction,
              styles.footerActionGhost,
              {
                borderColor: tokens.border,
                opacity: canActOnSentence ? 1 : 0.72,
              },
            ]}
          >
            <Ionicons name="copy-outline" size={15} color={tokens.foreground} />
            <Text
              style={[styles.footerActionText, { color: tokens.foreground }]}
            >
              {strings.reader.pluginJapaneseLearningCopySentence}
            </Text>
          </NemuPressable>
        </View>
      </View>
    </MobileSheetScaffold>
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
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
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
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 48,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  footerActionContainer: {
    flex: 1,
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
    fontSize: 12,
    fontWeight: nemuFontWeight.medium,
    textAlign: "center",
  },
});
