import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  nemuFontWeight,
  nemuText,
  NemuButton,
  NemuPressable,
  NEMU_PROMINENT_CTA_SIZE,
  useNemuTheme,
} from "@/design-system";
import { JapaneseLearningText as Text } from "./JapaneseLearningText";
import { JapaneseLearningSurfaceFrame } from "./JapaneseLearningSurfaceFrame";
import { useJapaneseLearningDrawerFrame } from "./useJapaneseLearningDrawerFrame";
import { JapaneseLearningAudioWaveform } from "./JapaneseLearningAudioWaveform";
import {
  mobileOcrLineKey,
  sortedMobileOcrLines,
} from "@/lib/mobileJapaneseLearningReaderHelpers";
import type { MobileOcrDetection, MobileJapaneseLearningOcrResult } from "@/lib/mobileJapaneseLearningOcr";
import { describeJapaneseLearningOcrError } from "@/lib/mobileJapaneseLearningOcr";
import type { MobileStrings } from "@/lib/mobileI18n";
import { formatMobileString } from "@/lib/mobileI18n";
import { findMobileTranscriptPlaybackLineOrder } from "@/lib/mobileJapaneseLearningTranscriptTiming";
import {
  JAPANESE_LEARNING_SERIF_FONT_FAMILY,
  mobileJapaneseLearningSurfaceColors,
} from "@/lib/mobileJapaneseLearningSurfaceTheme";
import { shouldAutoRunMobileJapaneseLearningTranscriptOcr } from "@/lib/mobileJapaneseLearningTranscriptFlow";

export interface JapaneseLearningTranscriptTtsStateLike {
  status: "idle" | "loading" | "playing" | "error";
  source?: "sentence" | "transcript" | "chat";
  currentTime?: number;
  duration?: number;
  detail?: string;
}

interface TranscriptSheetProps {
  visible: boolean;
  strings: MobileStrings;
  ocrStatus: "idle" | "loading" | "ready" | "error";
  ocrErrorDetail?: string;
  ocrResult: MobileJapaneseLearningOcrResult | null;
  selectedDetectionOrder: number | null;
  ttsState: JapaneseLearningTranscriptTtsStateLike;
  minConfidence: number;
  onClose: () => void;
  onDismiss?: () => void;
  onRetryOcr: () => void;
  onSelectDetection: (detection: MobileOcrDetection) => void;
  onToggleTts: (text: string) => void;
}

/** Web transcript.tsx: full-page TTS only for pages up to 500 characters. */
const TRANSCRIPT_TTS_MAX_CHARACTERS = 500;
/** Widest the transcript's column grows: about 40 characters of its 13pt serif. */
const TRANSCRIPT_MAX_MEASURE = 520;
/** How long a "no image yet" failure waits for the page before it shows. */
const NO_IMAGE_RETRY_GRACE_MS = 2500;

/**
 * Mobile port of web `OcrTranscriptPopoverContent` (transcript.tsx).
 *
 * Same flow as the web navbar action: opening the transcript runs text
 * detection for the page when it has none yet — there is no separate
 * "Detect text" step. Same content: the LINE-green page audio control, then
 * the detected lines in the textbook serif; the line open in the sentence view
 * is highlighted and the line being read aloud glows. Native adaptations: the
 * popover becomes a sheet (in every pose; the system keeps it off the fold),
 * and failures stay in place with a Retry action (web only alerts).
 */
export function JapaneseLearningTranscriptSheet({
  visible,
  strings,
  ocrStatus,
  ocrErrorDetail,
  ocrResult,
  selectedDetectionOrder,
  ttsState,
  minConfidence,
  onClose,
  onDismiss,
  onRetryOcr,
  onSelectDetection,
  onToggleTts,
}: TranscriptSheetProps) {
  const { tokens, scheme } = useNemuTheme();
  const colors = mobileJapaneseLearningSurfaceColors(scheme === "dark" ? "dark" : "light");
  const [diagnosticOpen, setDiagnosticOpen] = useState(false);
  const [playedTranscript, setPlayedTranscript] = useState<string | null>(null);

  // Web flow: the transcript action detects the visible page when it has no
  // transcript yet. The page's detector identity (`onRetryOcr`) changes with
  // the page and once its image is measurable, which also retries a
  // "no image yet" failure from opening before the page finished loading.
  const autoRunCallbackRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (
      !shouldAutoRunMobileJapaneseLearningTranscriptOcr({
        visible,
        ocrStatus,
        ocrErrorDetail,
        noImageDetail: strings.reader.pluginJapaneseLearningNoImage,
        detectorChanged: autoRunCallbackRef.current !== onRetryOcr,
      })
    ) {
      return;
    }
    autoRunCallbackRef.current = onRetryOcr;
    onRetryOcr();
  }, [ocrErrorDetail, ocrStatus, onRetryOcr, strings, visible]);

  // A "no image yet" failure right after opening is usually the page still
  // loading; the auto-run above retries it, so keep showing the detecting
  // state for a moment before surfacing the error.
  const noImageError =
    ocrStatus === "error" && ocrErrorDetail === strings.reader.pluginJapaneseLearningNoImage;
  const [noImageErrorVisible, setNoImageErrorVisible] = useState(false);
  useEffect(() => {
    if (!noImageError) return;
    const timer = setTimeout(() => setNoImageErrorVisible(true), NO_IMAGE_RETRY_GRACE_MS);
    return () => {
      clearTimeout(timer);
      setNoImageErrorVisible(false);
    };
  }, [noImageError, onRetryOcr]);

  const ocrErrorCopy =
    ocrStatus === "error"
      ? describeJapaneseLearningOcrError(ocrErrorDetail, strings)
      : null;

  const lines = useMemo(() => {
    if (!ocrResult) return [];
    const sorted = sortedMobileOcrLines(ocrResult);
    // Confidence filter — mirrors web transcript.tsx
    return sorted.filter((line) => line.conf >= minConfidence && line.text.trim().length > 0);
  }, [ocrResult, minConfidence]);

  const transcriptText = useMemo(
    () => lines.map((l) => l.text.trim()).filter(Boolean).join("\n"),
    [lines],
  );

  const transcriptTtsActive =
    (ttsState.status === "loading" || ttsState.status === "playing") &&
    ttsState.source === "transcript";
  const transcriptTtsLoading =
    ttsState.status === "loading" && ttsState.source === "transcript";
  const transcriptTtsPlaying =
    ttsState.status === "playing" && ttsState.source === "transcript";
  const readingOrder = transcriptTtsPlaying
    ? findMobileTranscriptPlaybackLineOrder(
        lines,
        ttsState.currentTime ?? 0,
        ttsState.duration ?? 0,
      )
    : null;

  const drawerFrame = useJapaneseLearningDrawerFrame();
  const waiting =
    ocrStatus === "idle" || ocrStatus === "loading" || (noImageError && !noImageErrorVisible);

  return (
    <JapaneseLearningSurfaceFrame
      visible={visible}
      onRequestClose={onClose}
      backdropOnPress={onClose}
      onDismiss={onDismiss}
      showDismissButton={false}
      // Web's half-height transcript; on a horizontal fold, exactly the half below it.
      frameMaxHeight={drawerFrame.horizontalFold ? drawerFrame.frameMaxHeight : "50%"}
      // Even 12pt padding all round, the bottom included (the list extends
      // into the sheet's bottom safe area), plus the home indicator's inset
      // only where the sheet reaches it.
      contentBottomInset={drawerFrame.bottomInset}
      contentStyle={styles.frameContent}
    >
      {lines.length > 0 ? (
        <View style={styles.column}>
          {transcriptText ? (
            <View style={styles.audioRow}>
              <JapaneseLearningAudioWaveform
                seed={transcriptText}
                loading={transcriptTtsLoading}
                playing={transcriptTtsPlaying}
                showWaveform={transcriptTtsActive || playedTranscript === transcriptText}
                currentTime={ttsState.currentTime}
                duration={ttsState.duration}
                accessibilityLabel={
                  transcriptTtsActive
                    ? strings.reader.pluginJapaneseLearningStopListening
                    : strings.reader.pluginJapaneseLearningListen
                }
                onToggle={() => {
                  if (!transcriptTtsActive && transcriptText.length <= TRANSCRIPT_TTS_MAX_CHARACTERS) {
                    setPlayedTranscript(transcriptText);
                  }
                  onToggleTts(transcriptText);
                }}
              />
            </View>
          ) : null}
          <ScrollView
            // Android: inside a native sheet, hand the drag to the sheet at the top.
            nestedScrollEnabled
            style={styles.linesScroll}
            contentContainerStyle={styles.linesContent}
            showsVerticalScrollIndicator={false}
          >
            {lines.map((line) => {
              const selected = selectedDetectionOrder === line.order;
              const reading = !selected && readingOrder === line.order;
              return (
                <NemuPressable
                  key={mobileOcrLineKey(line)}
                  accessibilityRole="button"
                  accessibilityLabel={formatMobileString(
                    strings.reader.pluginJapaneseLearningLineAccessibility,
                    { text: line.text.trim() },
                  )}
                  accessibilityLanguage="ja"
                  accessibilityState={{ selected }}
                  hapticFeedback="selection"
                  hitSlop={{ top: 3, bottom: 3 }}
                  onPress={() => onSelectDetection(line)}
                  pressedScale={0.985}
                  // The touch-target wrapper centres its child; lines span the column.
                  containerStyle={styles.lineContainer}
                  style={[
                    styles.line,
                    selected
                      ? {
                          backgroundColor: colors.transcriptLineActiveBackground,
                          borderColor: colors.transcriptLineActiveBorder,
                        }
                      : reading
                        ? {
                            backgroundColor: colors.transcriptLineReadingBackground,
                            borderColor: colors.transcriptLineReadingBorder,
                          }
                        : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.lineText,
                      {
                        color: selected
                          ? colors.transcriptLineActiveText
                          : reading
                            ? colors.transcriptLineReadingText
                            : colors.transcriptLineText,
                      },
                    ]}
                  >
                    {line.text}
                  </Text>
                </NemuPressable>
              );
            })}
          </ScrollView>
        </View>
      ) : waiting ? (
        <View
          accessibilityLiveRegion="polite"
          accessibilityLabel={strings.reader.pluginJapaneseLearningDetectingText}
          style={styles.stateContent}
        >
          <ActivityIndicator size="small" color={tokens.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.transcriptEmptyText }]}>
            {strings.reader.pluginJapaneseLearningDetectingText}
          </Text>
        </View>
      ) : ocrStatus === "error" && ocrErrorCopy ? (
        <View style={styles.stateContent}>
          <Ionicons
            name={
              ocrErrorCopy.kind === "unavailable"
                ? "cloud-offline-outline"
                : ocrErrorCopy.kind === "signIn"
                  ? "person-circle-outline"
                  : "alert-circle-outline"
            }
            size={22}
            color={tokens.mutedForeground}
          />
          <Text
            accessibilityLiveRegion="assertive"
            accessibilityRole="alert"
            style={[styles.stateTitle, { color: tokens.foreground }]}
          >
            {ocrErrorCopy.title}
          </Text>
          <Text style={[styles.stateDescription, { color: tokens.mutedForeground }]}>
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
                  name={diagnosticOpen ? "chevron-down-outline" : "chevron-forward-outline"}
                  size={12}
                  color={tokens.mutedForeground}
                />
                <Text style={[nemuText.caption, { color: tokens.mutedForeground }]}>
                  {strings.feedback.technicalDetails}
                </Text>
              </NemuPressable>
              {diagnosticOpen ? (
                <Text
                  selectable
                  style={[
                    styles.diagnosticBody,
                    styles.diagnosticMono,
                    { backgroundColor: tokens.secondary, color: tokens.mutedForeground },
                  ]}
                >
                  {ocrErrorCopy.diagnostic}
                </Text>
              ) : null}
            </View>
          ) : null}
          <NemuButton
            accessibilityLabel={strings.common.retry}
            icon="refresh"
            label={strings.common.retry}
            containerStyle={styles.retryCtaContainer}
            onPress={onRetryOcr}
            size={NEMU_PROMINENT_CTA_SIZE}
            variant="default"
          />
        </View>
      ) : (
        // Web `.transcript-empty`: "No text detected", 2rem below the top.
        <View style={[styles.stateContent, styles.emptyStateContent]}>
          <Text style={[styles.emptyText, styles.emptyTextItalic, { color: colors.transcriptEmptyText }]}>
            {strings.reader.pluginJapaneseLearningTranscriptNoText}
          </Text>
        </View>
      )}

      {ttsState.status === "error" && ttsState.source === "transcript" ? (
        <Text
          accessibilityLiveRegion="assertive"
          accessibilityRole="alert"
          style={[styles.errorText, { color: tokens.danger }]}
        >
          {ttsState.detail}
        </Text>
      ) : null}
    </JapaneseLearningSurfaceFrame>
  );
}

const styles = StyleSheet.create({
  // Web `.transcript-popover-content` (p-3 popover + 0.75rem/0.5rem).
  frameContent: {
    gap: 0,
    paddingHorizontal: 8,
    paddingTop: 12,
    paddingBottom: 12,
  },
  // Web's transcript is a narrow popover list; a wide sheet (a phone in
  // landscape, an unfolded foldable) keeps the lines at a readable measure,
  // centred, instead of stretching the pills across the window.
  column: {
    flex: 1,
    minHeight: 0,
    width: "100%",
    maxWidth: TRANSCRIPT_MAX_MEASURE,
    alignSelf: "center",
  },
  audioRow: {
    paddingHorizontal: 4,
    paddingBottom: 8,
  },
  linesScroll: {
    flex: 1,
    minHeight: 0,
  },
  linesContent: {
    paddingHorizontal: 4,
    paddingVertical: 4,
    gap: 2,
  },
  lineContainer: {
    alignItems: "stretch",
  },
  // Web `.transcript-line`: transparent pill, serif 0.8125rem / 1.7.
  line: {
    minHeight: 39,
    justifyContent: "center",
    alignItems: "stretch",
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "transparent",
    paddingHorizontal: 6,
    paddingVertical: 8,
  },
  lineText: {
    textAlign: "left",
    fontFamily: Platform.select(JAPANESE_LEARNING_SERIF_FONT_FAMILY),
    fontSize: 13,
    lineHeight: 22,
    letterSpacing: 0.26,
  },
  // Web `.transcript-empty`.
  emptyText: {
    fontSize: 12,
    lineHeight: 16,
    textAlign: "center",
  },
  emptyTextItalic: {
    fontStyle: "italic",
  },
  stateTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: nemuFontWeight.semibold,
    textAlign: "center",
  },
  stateDescription: {
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
  stateContent: {
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    // Keep dynamic-sheet sizing stable between the loading, empty and error
    // states. Some native bottom-sheet implementations interpret a large
    // content-height collapse as dismissal.
    minHeight: 164,
    paddingHorizontal: 16,
    paddingVertical: 32,
  },
  emptyStateContent: {
    justifyContent: "flex-start",
  },
  retryCtaContainer: {
    alignSelf: "stretch",
    minHeight: 48,
  },
  errorText: {
    width: "100%",
    maxWidth: TRANSCRIPT_MAX_MEASURE,
    alignSelf: "center",
    fontSize: 12,
    fontWeight: nemuFontWeight.medium,
    paddingHorizontal: 8,
    paddingTop: 8,
  },
});
