import { useMemo } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  MobileSheetScaffold,
  nemuFontWeight,
  NemuPressable,
  radius,
  useNemuTheme,
} from "@/design-system";
import {
  mobileOcrLineKey,
  mobileOcrLabelColor,
  sortedMobileOcrLines,
} from "@/lib/mobileJapaneseLearningReaderHelpers";
import type { MobileOcrDetection, MobileJapaneseLearningOcrResult } from "@/lib/mobileJapaneseLearningOcr";
import type { MobileStrings } from "@/lib/mobileI18n";
import { formatMobileString } from "@/lib/mobileI18n";

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
  onRetryOcr: () => void;
  onSelectDetection: (detection: MobileOcrDetection) => void;
  onToggleTts: (text: string) => void;
}

/**
 * Mobile mirror of web `OcrTranscriptPopoverContent` (transcript.tsx).
 * Renders the detected text lines with colored language markers, highlights
 * the active TTS playback line, and supports per-line selection. Web uses a
 * popover anchored to a navbar icon; mobile uses a bottom sheet (popover
 * anchoring isn't available on RN without extra gesture infra).
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
  onRetryOcr,
  onSelectDetection,
  onToggleTts,
}: TranscriptSheetProps) {
  const { tokens } = useNemuTheme();

  const lines = useMemo(() => {
    if (!ocrResult) return [];
    const sorted = sortedMobileOcrLines(ocrResult);
    // Confidence filter — mirrors web transcript.tsx
    return sorted.filter((line) => line.conf >= minConfidence);
  }, [ocrResult, minConfidence]);

  const transcriptText = useMemo(
    () => lines.map((l) => l.text.trim()).filter(Boolean).join("\n"),
    [lines],
  );

  const transcriptTtsBusy =
    (ttsState.status === "loading" || ttsState.status === "playing") &&
    ttsState.source === "transcript";
  const transcriptTtsLoading =
    ttsState.status === "loading" && ttsState.source === "transcript";

  const title =
    ocrResult?.source === "source-text"
      ? strings.reader.pluginJapaneseLearningSourceText
      : strings.reader.pluginJapaneseLearningTranscript;

  return (
    <MobileSheetScaffold
      visible={visible}
      onRequestClose={onClose}
      backdropOnPress={onClose}
      frameMaxHeight={lines.length > 0 ? "70%" : "auto"}
      contentStyle={{ padding: 0, gap: 0 }}
    >
      <View style={[styles.header, { borderBottomColor: tokens.border }]}>
        <Text style={[styles.title, { color: tokens.foreground }]} numberOfLines={1}>
          {title}
        </Text>
        {transcriptText ? (
          <NemuPressable
            accessibilityRole="button"
            accessibilityLabel={
              transcriptTtsBusy
                ? strings.reader.pluginJapaneseLearningStopListening
                : strings.reader.pluginJapaneseLearningListen
            }
            accessibilityState={{ disabled: !transcriptText }}
            disabled={!transcriptText}
            onPress={() => onToggleTts(transcriptText)}
            pressedScale={0.94}
            style={[
              styles.listenButton,
              {
                backgroundColor: tokens.card,
                borderColor: tokens.border,
              },
            ]}
          >
            {transcriptTtsLoading ? (
              <ActivityIndicator size="small" color={tokens.foreground} />
            ) : (
              <Ionicons
                name={transcriptTtsBusy ? "stop-circle-outline" : "volume-high-outline"}
                size={13}
                color={tokens.foreground}
              />
            )}
            <Text style={[styles.listenText, { color: tokens.foreground }]} numberOfLines={1}>
              {transcriptTtsBusy
                ? strings.reader.pluginJapaneseLearningStopListening
                : strings.reader.pluginJapaneseLearningListen}
            </Text>
          </NemuPressable>
        ) : null}
      </View>

      {lines.length > 0 ? (
        <ScrollView
          style={styles.linesScroll}
          contentContainerStyle={styles.linesContent}
          showsVerticalScrollIndicator={false}
        >
          {lines.map((line) => {
            const selected = selectedDetectionOrder === line.order;
            const color = mobileOcrLabelColor(line.label, tokens);
            return (
              <NemuPressable
                key={mobileOcrLineKey(line)}
                accessibilityRole="button"
                accessibilityLabel={formatMobileString(
                  strings.reader.pluginJapaneseLearningLineAccessibility,
                  { text: line.text.trim() },
                )}
                accessibilityState={{ selected }}
                onPress={() => onSelectDetection(line)}
                pressedScale={0.99}
                style={[
                  styles.line,
                  {
                    backgroundColor: selected ? `${color}22` : tokens.card,
                    borderColor: selected ? color : tokens.border,
                  },
                ]}
              >
                <View style={[styles.lineMarker, { backgroundColor: color }]} />
                <Text style={[styles.lineText, { color: tokens.foreground }]}>
                  {line.text}
                </Text>
              </NemuPressable>
            );
          })}
        </ScrollView>
      ) : (
        <View style={styles.stateContent}>
          {ocrStatus === "loading" ? (
            <ActivityIndicator size="small" color={tokens.primary} />
          ) : ocrStatus === "error" ? (
            <Ionicons
              name="alert-circle-outline"
              size={24}
              color={tokens.danger}
            />
          ) : (
            <Ionicons
              name="scan-outline"
              size={24}
              color={tokens.mutedForeground}
            />
          )}
          <Text
            style={[
              styles.emptyText,
              {
                color:
                  ocrStatus === "error" ? tokens.danger : tokens.mutedForeground,
              },
            ]}
          >
            {ocrStatus === "loading"
              ? strings.reader.pluginJapaneseLearningDetectingText
              : ocrStatus === "error"
                ? ocrErrorDetail || strings.reader.pluginJapaneseLearningOcrFailed
                : ocrResult
                  ? ocrResult.text || strings.reader.pluginJapaneseLearningNoText
                  : strings.reader.pluginJapaneseLearningTranscriptHint}
          </Text>
          {ocrStatus === "error" || ocrStatus === "idle" ? (
            <NemuPressable
              accessibilityRole="button"
              accessibilityLabel={
                ocrStatus === "error"
                  ? strings.common.retry
                  : strings.reader.pluginJapaneseLearningDetectText
              }
              onPress={onRetryOcr}
              pressedScale={0.98}
              containerStyle={styles.retryButtonContainer}
              style={[styles.retryButton, { backgroundColor: tokens.primary }]}
            >
              <Ionicons
                name={
                  ocrStatus === "error" ? "refresh-outline" : "scan-outline"
                }
                size={16}
                color={tokens.primaryForeground}
              />
              <Text
                style={[styles.retryText, { color: tokens.primaryForeground }]}
              >
                {ocrStatus === "error"
                  ? strings.common.retry
                  : strings.reader.pluginJapaneseLearningDetectText}
              </Text>
            </NemuPressable>
          ) : null}
        </View>
      )}

      {ttsState.status === "error" && ttsState.source === "transcript" ? (
        <Text style={[styles.errorText, { color: tokens.danger }]}>
          {ttsState.detail}
        </Text>
      ) : null}
    </MobileSheetScaffold>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  title: {
    fontSize: 14,
    fontWeight: nemuFontWeight.semibold,
    flex: 1,
  },
  listenButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  listenText: {
    fontSize: 12,
    fontWeight: nemuFontWeight.medium,
  },
  linesScroll: {
    flex: 1,
    minHeight: 0,
  },
  linesContent: {
    padding: 12,
    gap: 4,
  },
  line: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  lineMarker: {
    width: 3,
    height: 18,
    borderRadius: 2,
  },
  lineText: {
    fontSize: 14,
    lineHeight: 19,
    flex: 1,
  },
  emptyText: {
    fontSize: 13,
    fontWeight: nemuFontWeight.medium,
    textAlign: "center",
  },
  stateContent: {
    alignItems: "center",
    gap: 10,
    // Keep dynamic-sheet sizing stable while retry transitions between the
    // error controls and the shorter loading message. Some native bottom-sheet
    // implementations interpret a large content-height collapse as dismissal.
    minHeight: 164,
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  retryButton: {
    width: "100%",
    minHeight: 40,
    borderRadius: radius.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  retryButtonContainer: {
    minWidth: 112,
  },
  retryText: {
    fontSize: 13,
    fontWeight: nemuFontWeight.semibold,
  },
  errorText: {
    fontSize: 12,
    fontWeight: nemuFontWeight.medium,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
});
