import { useState } from "react";
import {
  Platform,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  nemuColorWithAlpha,
  nemuFontWeight,
  nemuText,
  NemuPressable,
  NemuRingSpinner,
  useNemuTheme,
} from "@/design-system";
import { JapaneseLearningText as Text } from "./JapaneseLearningText";
import {
  JapaneseLearningSurfaceFrame,
  japaneseLearningEdgeToEdgeContentStyle,
} from "./JapaneseLearningSurfaceFrame";
import { useJapaneseLearningDrawerFrame } from "./useJapaneseLearningDrawerFrame";
import { JapaneseLearningWebIcon, JapaneseLearningWebSpinner } from "./JapaneseLearningWebIcon";
import { describeJapaneseLearningOcrError } from "@/lib/mobileJapaneseLearningOcr";
import type { MobileStrings } from "@/lib/mobileI18n";
import type { JapaneseLearningGrammarState } from "./JapaneseLearningSentenceDisplay";
import { JapaneseLearningSentenceDisplay } from "./JapaneseLearningSentenceDisplay";
import {
  JAPANESE_LEARNING_FOOTER_GAP,
  resolveJapaneseLearningFooterLayout,
} from "@/lib/mobileJapaneseLearningSheetLayout";
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
  onPresentationProgress?: (progress: number) => void;
  /**
   * The selected bubble cropped from the page (web text popout); null without
   * a page image. Shown above the sentence only when the sheet covers the
   * whole window (compact height), where the floating popout cannot be seen.
   */
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
  onPresentationProgress,
  bubble = null,
}: OcrResultSheetProps) {
  const { tokens } = useNemuTheme();
  const { fontScale } = useWindowDimensions();
  const largeTextLayout = fontScale > 1.3;
  const drawerFrame = useJapaneseLearningDrawerFrame();
  const insets = useSafeAreaInsets();
  // Match the web footer: three equally sized, labelled actions. At large
  // accessibility sizes, stack to keep every action readable and reachable.
  const stackFooterActions = largeTextLayout;
  const listenLabel = sentenceTtsBusy
    ? strings.reader.pluginJapaneseLearningStopListening
    : strings.reader.pluginJapaneseLearningListen;
  const askLabel = strings.reader.pluginJapaneseLearningAskAboutThisSentence;
  const copyLabel = strings.reader.pluginJapaneseLearningCopySelection;
  const [footerWidth, setFooterWidth] = useState(0);
  const [labelWidths, setLabelWidths] = useState<Partial<Record<"listen" | "ask" | "copy", number>>>({});
  const footerLayout = resolveJapaneseLearningFooterLayout({
    availableWidth:
      labelWidths.listen && labelWidths.ask && labelWidths.copy ? footerWidth : 0,
    listenLabelWidth: labelWidths.listen ?? 0,
    askLabelWidth: labelWidths.ask ?? 0,
    copyLabelWidth: labelWidths.copy ?? 0,
  });
  const ghostIconOnly = !stackFooterActions && footerLayout.ghostIconOnly;
  const ghostContainerStyle = stackFooterActions
    ? null
    : footerLayout.equalWidths
      ? styles.footerActionEqual
      : ghostIconOnly
        ? { width: footerLayout.ghostIconOnlyWidth }
        : styles.footerActionNatural;
  const primaryContainerStyle = stackFooterActions
    ? null
    : footerLayout.equalWidths || footerLayout.primaryScalesDown
      ? styles.footerActionEqual
      : styles.footerActionNatural;
  const ghostPaddingStyle = ghostIconOnly
    ? { paddingHorizontal: 0 }
    : { paddingHorizontal: footerLayout.ghostPaddingX };
  const [diagnosticOpen, setDiagnosticOpen] = useState(false);

  const ocrErrorCopy =
    ocrState.status === "error"
      ? describeJapaneseLearningOcrError(ocrState.detail, strings)
      : null;

  return (
    <JapaneseLearningSurfaceFrame
      showDismissButton={false}
      visible={visible}
      onRequestClose={onClose}
      onDismiss={onDismiss}
      onPresentationProgress={onPresentationProgress}
      backdropOnPress={onClose}
      frameMaxHeight={largeTextLayout ? "100%" : drawerFrame.frameMaxHeight}
      contentBottomInset={0}
      contentStyle={japaneseLearningEdgeToEdgeContentStyle(
        largeTextLayout ? 0 : drawerFrame.contentBleed,
      )}
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
          <JapaneseLearningSentenceDisplay
            sentenceHeader={
              // The floating popout is hidden behind a full-window sheet.
              bubble && drawerFrame.fullScreen
                ? (columnMaxHeight) => (
                    <JapaneseLearningBubblePreview
                      // Columns: centred in the empty details column; stacked: over the sentence.
                      embedded={columnMaxHeight == null}
                      centered={columnMaxHeight != null}
                      maxHeight={columnMaxHeight ?? IN_SHEET_BUBBLE_MAX_HEIGHT}
                      source={bubble}
                      accessibilityLabel={strings.reader.pluginJapaneseLearningSelectedText}
                    />
                  )
                : null
            }
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
        onLayout={(event) => {
          const next = Math.round(event.nativeEvent.layout.width) - FOOTER_PADDING * 2;
          setFooterWidth((current) => (current === next ? current : next));
        }}
        style={[
          styles.footer,
          // The footer band runs to the sheet's bottom edge with even
          // padding (the body extends into the sheet's bottom safe area),
          // plus the home indicator's inset only where the sheet reaches it.
          {
            paddingBottom:
              FOOTER_PADDING +
              // Large text opens the sheet at its largest detent, where iOS
              // attaches it to the bottom edge and the home indicator.
              (largeTextLayout && Platform.OS === "ios" ? insets.bottom : drawerFrame.bottomInset),
          },
          {
            backgroundColor: nemuColorWithAlpha(tokens.background, 0.8),
            borderTopColor: nemuColorWithAlpha(tokens.border, 0.5),
          },
        ]}
      >
        {/* Natural label widths, measured off-screen, pick the footer layout. */}
        {stackFooterActions ? null : (
          <View
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={styles.footerMeasure}
          >
            {(["listen", "ask", "copy"] as const).map((key) => (
              <Text
                key={key}
                numberOfLines={1}
                onLayout={(event) => {
                  const width = Math.ceil(event.nativeEvent.layout.width);
                  setLabelWidths((current) => (current[key] === width ? current : { ...current, [key]: width }));
                }}
                style={styles.footerActionText}
              >
                {key === "listen" ? listenLabel : key === "ask" ? askLabel : copyLabel}
              </Text>
            ))}
          </View>
        )}
        <View
          style={[
            styles.footerActions,
            stackFooterActions ? styles.footerActionsStacked : null,
          ]}
        >
          <NemuPressable
            accessibilityRole="button"
            accessibilityLabel={listenLabel}
            accessibilityState={{ disabled: !canActOnSentence }}
            disabled={!canActOnSentence}
            onPress={onPlaySentence}
            pressedScale={0.97}
            containerStyle={[ghostContainerStyle, stackFooterActions ? styles.footerActionContainerStacked : null]}
            style={[
              styles.footerAction,
              styles.footerActionGhost,
              ghostPaddingStyle,
              { opacity: canActOnSentence ? 1 : 0.5 },
            ]}
          >
            {sentenceTtsLoading ? (
              <JapaneseLearningWebSpinner size={16} color={tokens.mutedForeground} />
            ) : (
              <JapaneseLearningWebIcon
                name={sentenceTtsBusy ? "pause" : "play"}
                size={14}
                color={tokens.mutedForeground}
              />
            )}
            {ghostIconOnly ? null : (
              <Text numberOfLines={1} style={[styles.footerActionText, { color: tokens.mutedForeground }]}>
                {listenLabel}
              </Text>
            )}
          </NemuPressable>

          <NemuPressable
            accessibilityRole="button"
            accessibilityLabel={askLabel}
            accessibilityState={{ disabled: !canActOnSentence || askDisabled }}
            disabled={!canActOnSentence || askDisabled}
            onPress={onAskSentence}
            pressedScale={0.97}
            containerStyle={[primaryContainerStyle, stackFooterActions ? styles.footerActionContainerStacked : null]}
            style={[
              styles.footerAction,
              styles.footerActionPrimary,
              {
                backgroundColor: tokens.primary,
                paddingHorizontal: footerLayout.primaryPaddingX,
                opacity: !canActOnSentence || askDisabled ? 0.5 : 1,
              },
            ]}
          >
            <JapaneseLearningWebIcon name="ask" size={14} color={tokens.primaryForeground} />
            <Text
              // Web keeps every label on one line (`whitespace-nowrap`).
              numberOfLines={stackFooterActions ? undefined : 1}
              adjustsFontSizeToFit={!stackFooterActions && footerLayout.primaryScalesDown}
              minimumFontScale={0.8}
              style={[
                styles.footerActionText,
                footerLayout.primaryScalesDown || stackFooterActions ? styles.footerActionTextShrink : null,
                { color: tokens.primaryForeground },
              ]}
            >
              {askLabel}
            </Text>
          </NemuPressable>

          <NemuPressable
            accessibilityRole="button"
            accessibilityLabel={strings.reader.pluginJapaneseLearningCopySentence}
            accessibilityState={{ disabled: !canActOnSentence }}
            disabled={!canActOnSentence}
            onPress={onCopySentence}
            pressedScale={0.97}
            containerStyle={[ghostContainerStyle, stackFooterActions ? styles.footerActionContainerStacked : null]}
            style={[
              styles.footerAction,
              styles.footerActionGhost,
              ghostPaddingStyle,
              { opacity: canActOnSentence ? 1 : 0.5 },
            ]}
          >
            <JapaneseLearningWebIcon name="copy" size={14} color={tokens.mutedForeground} />
            {ghostIconOnly ? null : (
              <Text numberOfLines={1} style={[styles.footerActionText, { color: tokens.mutedForeground }]}>
                {copyLabel}
              </Text>
            )}
          </NemuPressable>
        </View>
      </View>
    </JapaneseLearningSurfaceFrame>
  );
}

/** Web `DrawerFooter` `p-4`. */
const FOOTER_PADDING = 16;
/** The bubble inside a full-window sheet: a glance, not a second page. */
const IN_SHEET_BUBBLE_MAX_HEIGHT = 112;

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
    fontSize: 16,
    lineHeight: 24,
    fontWeight: nemuFontWeight.regular,
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
  // Web `DrawerFooter`: p-4, 1px `border-border/50` top edge, `bg-background/80`.
  footer: {
    borderTopWidth: 1,
    padding: FOOTER_PADDING,
  },
  footerMeasure: {
    position: "absolute",
    left: 0,
    top: 0,
    opacity: 0,
    flexDirection: "row",
  },
  footerActions: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: JAPANESE_LEARNING_FOOTER_GAP,
  },
  footerActionsStacked: {
    flexDirection: "column",
  },
  // Web button `h-9 gap-1.5 px-4 rounded-[10px]` with a 0.5px edge.
  footerAction: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 36,
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: "transparent",
    paddingHorizontal: 16,
  },
  footerActionEqual: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
  },
  footerActionNatural: {
    flexGrow: 1,
    flexShrink: 0,
    flexBasis: "auto",
  },
  footerActionContainerStacked: {
    flex: 0,
    width: "100%",
  },
  footerActionGhost: {
    backgroundColor: "transparent",
  },
  // `.dark .btn-nemu-primary`: lighter 0.5px edge and a soft drop shadow.
  footerActionPrimary: {
    borderColor: "rgba(143,181,255,0.25)",
    boxShadow: "0px 2px 8px 0px rgba(0,0,0,0.35), 0px 0px 1px 0px rgba(0,0,0,0.3)",
  },
  footerActionTextShrink: { flexShrink: 1 },
  footerActionText: {
    flexShrink: 0,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: nemuFontWeight.medium,
    textAlign: "center",
  },
});
