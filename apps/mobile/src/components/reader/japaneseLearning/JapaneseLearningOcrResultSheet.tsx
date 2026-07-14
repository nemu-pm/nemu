import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  MobileSheetScaffold,
  nemuFontWeight,
  NemuPressable,
  radius,
  useNemuTheme,
} from "@/design-system";
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

  return (
    <MobileSheetScaffold
      visible={visible}
      onRequestClose={onClose}
      backdropOnPress={onClose}
      frameMaxHeight="70%"
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
        ) : ocrState.status === "error" ? (
          <View style={styles.errorState}>
            <Text style={[styles.errorText, { color: tokens.danger }]}>
              {ocrState.detail ?? strings.reader.pluginJapaneseLearningOcrFailed}
            </Text>
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

      <View
        style={[
          styles.footer,
          {
            backgroundColor: `${tokens.background}E6`,
            borderTopColor: tokens.border,
          },
        ]}
      >
        <View style={styles.footerActions}>
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
            <Text style={[styles.footerActionText, { color: tokens.foreground }]} numberOfLines={1}>
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
            <Text style={[styles.footerActionText, { color: tokens.primaryForeground }]} numberOfLines={1}>
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
            <Text style={[styles.footerActionText, { color: tokens.foreground }]} numberOfLines={1}>
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
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  errorText: {
    fontSize: 14,
    fontWeight: nemuFontWeight.medium,
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
    gap: 8,
  },
  footerAction: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 38,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  footerActionGhost: {
    backgroundColor: "transparent",
  },
  footerActionText: {
    fontSize: 12,
    fontWeight: nemuFontWeight.medium,
  },
});