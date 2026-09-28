import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type ViewInstance,
} from "react-native";
import {
  nemuColorWithAlpha,
  nemuFontWeight,
  radius,
  useNemuTheme,
  NemuNativeProgressBar,
  NemuPressable,
} from "@/design-system";
import Ionicons from "@expo/vector-icons/Ionicons";
import { hapticPress } from "@/lib/haptics";
import type { MobileGrammarToken } from "@/lib/mobileJapaneseLearningGrammar";
import {
  mobileGrammarTokenAtPoint,
  mobileGrammarTokenInSelection,
  selectedMobileGrammarText,
  type JapaneseLearningTokenLayout,
} from "@/lib/mobileJapaneseLearningReaderHelpers";
import {
  mobileJapaneseLearningTokenCanAct,
} from "@/lib/mobileJapaneseLearningPosStyles";
import { formatMobileString, type MobileStrings } from "@/lib/mobileI18n";
import {
  MOBILE_JAPANESE_LEARNING_QA_TIMELINE,
  mobileJapaneseLearningQaTimeline,
} from "@/lib/mobileJapaneseLearningQa";
import {
  JAPANESE_LEARNING_SERIF_FONT_FAMILY,
  mobileJapaneseLearningSurfaceColors,
} from "@/lib/mobileJapaneseLearningSurfaceTheme";
import { getMobileJapaneseLearningEnginePreference } from "@/lib/mobileJapaneseLearningEngine";
import { describeMobileJapaneseLearningPackLoading } from "@/lib/mobileJapaneseLearningAnalysisPackState";
import { useMobileJapaneseLearningAnalysisPackState } from "@/lib/mobileJapaneseLearningAnalysisPackStore";
import { JapaneseLearningTokenDisplay } from "./JapaneseLearningTokenDisplay";
import { JapaneseLearningTokenDetails } from "./JapaneseLearningTokenDetails";

export type JapaneseLearningGrammarState =
  | { status: "idle" }
  | { status: "loading"; text: string; stage: "normalizing" | "tokenizing" }
  | { status: "ready"; text: string; result: { tokens: MobileGrammarToken[] } }
  | { status: "error"; text: string; detail: string };

interface SentenceDisplayProps {
  grammarState: JapaneseLearningGrammarState;
  selectedTokenIndex: number | null;
  actionNotice: string | null;
  askDisabled: boolean;
  strings: MobileStrings;
  onSelectToken: (index: number | null) => void;
  onAskSelection: (text: string, kind: "word" | "words" | "sentence") => void;
  onCopySelection: (text: string) => void;
  /** Runs the analysis again after an error (e.g. the dictionary download failed). */
  onRetry?: () => void;
}

/**
 * Mobile mirror of web `SentenceDisplay` (sentence-display.tsx).
 * Two panes: a capped sentence/token pane (scrollable, ~3 rows) and a details
 * pane that fills remaining space (scrollable), showing either multi-selection
 * actions, a single token's summary + details, or an empty-state hint.
 *
 * Token selection uses the RN responder system with onLayout-measured rects and
 * `mobileGrammarTokenAtPoint` hit-testing — the same approach the previous
 * inline grammar panel used, now encapsulated here.
 */
export function JapaneseLearningSentenceDisplay({
  grammarState,
  selectedTokenIndex,
  actionNotice,
  askDisabled,
  strings,
  onSelectToken,
  onAskSelection,
  onCopySelection,
  onRetry,
}: SentenceDisplayProps) {
  const { tokens, scheme } = useNemuTheme();
  const colors = mobileJapaneseLearningSurfaceColors(scheme === "dark" ? "dark" : "light");
  // First on-device analysis: the dictionary pack downloads before the
  // sentence can be analyzed — show its progress instead of a silent spinner.
  const packState = useMobileJapaneseLearningAnalysisPackState();
  const packLoading =
    grammarState.status === "loading"
      ? describeMobileJapaneseLearningPackLoading(packState, strings)
      : null;
  const tokenLayoutsRef = useRef<Array<JapaneseLearningTokenLayout | undefined>>([]);
  // Touch `locationX/Y` is relative to the touched child (a word's text), not
  // to the token row, so hit-testing uses page coordinates minus the row's
  // page origin, measured when a gesture starts (the pane may have scrolled).
  const tokenWrapRef = useRef<ViewInstance | null>(null);
  const tokenWrapOriginRef = useRef<{ x: number; y: number } | null>(null);
  const pendingTokenEventsRef = useRef<Array<(origin: { x: number; y: number }) => void>>([]);
  const dragStartIndexRef = useRef<number | null>(null);
  const draggingSelectionRef = useRef(false);
  const [selectionStart, setSelectionStart] = useState<number | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<number | null>(null);
  const [selectionKey, setSelectionKey] = useState("");
  const [, setIsDraggingSelection] = useState(false);
  const [multiCardWidth, setMultiCardWidth] = useState(0);
  const [lastSeenTokensKey, setLastSeenTokensKey] = useState("");

  const grammarTokens = useMemo<MobileGrammarToken[]>(
    () =>
      grammarState.status === "ready"
        ? grammarState.result.tokens
        : [],
    [grammarState],
  );

  const selectedToken =
    selectedTokenIndex == null ? null : grammarTokens[selectedTokenIndex] ?? null;

  const tokensKey = useMemo(
    () =>
      grammarTokens
        .map((t) => `${t.word}\u0000${t.partOfSpeech}`)
        .join("\u0001"),
    [grammarTokens],
  );

  // Clear selection when token set changes — derived during render to avoid
  // a synchronous setState-in-effect (react-hooks/set-state-in-effect).
  if (tokensKey !== lastSeenTokensKey) {
    setLastSeenTokensKey(tokensKey);
    setSelectionStart(null);
    setSelectionEnd(null);
    setSelectionKey("");
  }
  // Refs cannot be updated during render — clear in an effect instead.
  useEffect(() => {
    tokenLayoutsRef.current = [];
  }, [tokensKey]);

  const activeSelectionStart = selectionKey === tokensKey ? selectionStart : null;
  const activeSelectionEnd = selectionKey === tokensKey ? selectionEnd : null;
  const multiSelectionActive =
    activeSelectionStart != null &&
    activeSelectionEnd != null &&
    activeSelectionStart !== activeSelectionEnd;
  const selectedRangeText = multiSelectionActive
    ? selectedMobileGrammarText(
        grammarTokens,
        activeSelectionStart,
        activeSelectionEnd,
      )
    : "";

  const clearRangeSelection = useCallback(() => {
    draggingSelectionRef.current = false;
    dragStartIndexRef.current = null;
    setSelectionStart(null);
    setSelectionEnd(null);
    setSelectionKey("");
    setIsDraggingSelection(false);
  }, []);

  const selectSingleToken = useCallback(
    (index: number) => {
      clearRangeSelection();
      if (selectedTokenIndex === index) {
        onSelectToken(null);
        return;
      }
      onSelectToken(index);
      void hapticPress();
    },
    [clearRangeSelection, onSelectToken, selectedTokenIndex],
  );

  const updateRangeSelection = useCallback(
    (index: number) => {
      const start = dragStartIndexRef.current;
      if (start == null || start === index) return;
      draggingSelectionRef.current = true;
      setIsDraggingSelection(true);
      setSelectionStart(Math.min(start, index));
      setSelectionEnd(Math.max(start, index));
      setSelectionKey(tokensKey);
      if (selectedTokenIndex != null) onSelectToken(null);
    },
    [onSelectToken, selectedTokenIndex, tokensKey],
  );

  const extendAccessibleSelection = useCallback(
    (index: number) => {
      const anchor = activeSelectionStart ?? selectedTokenIndex ?? index;
      if (anchor === index) {
        clearRangeSelection();
        if (selectedTokenIndex !== index) onSelectToken(index);
        return;
      }
      draggingSelectionRef.current = false;
      dragStartIndexRef.current = null;
      setIsDraggingSelection(false);
      setSelectionStart(Math.min(anchor, index));
      setSelectionEnd(Math.max(anchor, index));
      setSelectionKey(tokensKey);
      if (selectedTokenIndex != null) onSelectToken(null);
      void hapticPress();
    },
    [
      activeSelectionStart,
      clearRangeSelection,
      onSelectToken,
      selectedTokenIndex,
      tokensKey,
    ],
  );

  const beginTokenGesture = useCallback(
    (x: number, y: number) => {
      const index = mobileGrammarTokenAtPoint(
        tokenLayoutsRef.current,
        x,
        y,
        grammarTokens.length,
      );
      dragStartIndexRef.current = index;
      draggingSelectionRef.current = false;
      setIsDraggingSelection(false);
    },
    [grammarTokens.length],
  );

  const moveTokenGesture = useCallback(
    (x: number, y: number) => {
      const index = mobileGrammarTokenAtPoint(
        tokenLayoutsRef.current,
        x,
        y,
        grammarTokens.length,
      );
      if (index != null) updateRangeSelection(index);
    },
    [grammarTokens.length, updateRangeSelection],
  );

  const endTokenGesture = useCallback(
    (x: number, y: number) => {
      const start = dragStartIndexRef.current;
      const index =
        mobileGrammarTokenAtPoint(
          tokenLayoutsRef.current,
          x,
          y,
          grammarTokens.length,
        ) ?? start;

      if (draggingSelectionRef.current) {
        if (index != null) updateRangeSelection(index);
        void hapticPress();
      } else if (index != null) {
        selectSingleToken(index);
      }

      dragStartIndexRef.current = null;
      draggingSelectionRef.current = false;
      setIsDraggingSelection(false);
    },
    [grammarTokens.length, selectSingleToken, updateRangeSelection],
  );

  const cancelTokenGesture = useCallback(() => {
    dragStartIndexRef.current = null;
    draggingSelectionRef.current = false;
    setIsDraggingSelection(false);
  }, []);

  // QA builds only (EXPO_PUBLIC_JL_QA_TIMELINE): walk the selection states.
  const qaActionsRef = useRef({ onSelectToken, onAskSelection, tokensKey });
  useEffect(() => {
    qaActionsRef.current = { onSelectToken, onAskSelection, tokensKey };
  });
  useEffect(() => {
    if (!MOBILE_JAPANESE_LEARNING_QA_TIMELINE || grammarTokens.length === 0) return;
    const timers = mobileJapaneseLearningQaTimeline(grammarTokens.length).map((step) =>
      setTimeout(() => {
        const actions = qaActionsRef.current;
        if (step.kind === "token") {
          actions.onSelectToken(step.index);
        } else if (step.kind === "range") {
          actions.onSelectToken(null);
          setSelectionStart(step.start);
          setSelectionEnd(step.end);
          setSelectionKey(actions.tokensKey);
        } else {
          actions.onAskSelection(
            selectedMobileGrammarText(grammarTokens, 1, 3),
            "words",
          );
        }
      }, step.atMs),
    );
    return () => timers.forEach(clearTimeout);
  }, [grammarTokens]);

  /** Runs a gesture step with the touch in token-row coordinates (queued until the row is measured). */
  const withTokenPoint = useCallback(
    (event: GestureResponderEvent, run: (x: number, y: number) => void) => {
      const { pageX, pageY } = event.nativeEvent;
      const apply = (origin: { x: number; y: number }) => run(pageX - origin.x, pageY - origin.y);
      const origin = tokenWrapOriginRef.current;
      if (origin) apply(origin);
      else pendingTokenEventsRef.current.push(apply);
    },
    [],
  );

  const handleAskSingleWord = useCallback(() => {
    if (selectedToken && mobileJapaneseLearningTokenCanAct(selectedToken)) {
      onAskSelection(selectedToken.word, "word");
    }
  }, [onAskSelection, selectedToken]);

  const rawText = grammarState.status === "idle" ? "" : grammarState.text.trim();
  const hasTokens = grammarTokens.length > 0;

  return (
    <View style={styles.container}>
      {/* Sentence pane — content-sized, capped to ~3 token rows, scrollable (web max-h-[14rem]) */}
      <View style={styles.sentencePane}>
        <ScrollView
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.sentenceScrollContent}
        >
          {hasTokens ? (
            <View
              onStartShouldSetResponderCapture={() =>
                grammarTokens.length > 0
              }
              onMoveShouldSetResponder={() => grammarTokens.length > 0}
              ref={tokenWrapRef}
              onResponderGrant={(e) => {
                tokenWrapOriginRef.current = null;
                pendingTokenEventsRef.current = [];
                withTokenPoint(e, beginTokenGesture);
                tokenWrapRef.current?.measure((_x, _y, _width, _height, pageX, pageY) => {
                  const origin = { x: pageX, y: pageY };
                  tokenWrapOriginRef.current = origin;
                  const pending = pendingTokenEventsRef.current;
                  pendingTokenEventsRef.current = [];
                  for (const run of pending) run(origin);
                });
              }}
              onResponderMove={(e) => withTokenPoint(e, moveTokenGesture)}
              onResponderRelease={(e) => withTokenPoint(e, endTokenGesture)}
              onResponderTerminate={() => {
                pendingTokenEventsRef.current = [];
                cancelTokenGesture();
              }}
              style={styles.tokenWrap}
            >
              {grammarTokens.map((token, index) => (
                <JapaneseLearningTokenDisplay
                  key={`${index}-${token.word}-${token.partOfSpeech}`}
                  token={token}
                  index={index}
                  isSelected={selectedTokenIndex === index}
                  isMultiSelected={mobileGrammarTokenInSelection(
                    index,
                    activeSelectionStart,
                    activeSelectionEnd,
                  )}
                  accessibilityLabel={[
                    formatMobileString(
                      strings.reader.pluginJapaneseLearningTokenAccessibility,
                      { word: token.word.replace(/\n/g, "") },
                    ),
                    token.reading && token.reading.replace(/\u200c/g, "") !== token.word
                      ? token.reading.replace(/\n/g, "").replace(/\u200c/g, "")
                      : null,
                    token.partOfSpeech || null,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                  accessibilityExtendLabel={formatMobileString(
                    strings.reader
                      .pluginJapaneseLearningTokenExtendAccessibility,
                    { word: token.word.replace(/\n/g, "") },
                  )}
                  onActivate={() => selectSingleToken(index)}
                  onExtendSelection={() =>
                    extendAccessibleSelection(index)
                  }
                  onLayout={(i, x, y, width, height) => {
                    tokenLayoutsRef.current[i] = { x, y, width, height };
                  }}
                />
              ))}
            </View>
          ) : (
            // Web: the raw OCR text shows immediately; analysis runs below it.
            <View style={styles.rawLayer}>
              {rawText ? (
                <Text selectable accessibilityLanguage="ja" style={[styles.rawText, { color: tokens.foreground }]}>
                  {rawText}
                </Text>
              ) : null}
              {grammarState.status === "error" ? (
                <View style={styles.errorBlock}>
                  <Text
                    accessibilityRole="alert"
                    accessibilityLiveRegion="assertive"
                    style={[styles.errorText, { color: nemuColorWithAlpha(colors.destructive, 0.9) }]}
                  >
                    {packState.kind === "failed" &&
                    // Automatic falls back to the cloud, so its errors are not the pack's.
                    getMobileJapaneseLearningEnginePreference() === "onDevice"
                      ? strings.japaneseLearningDictionary.analysisDownloadFailed
                      : strings.reader.pluginJapaneseLearningGrammarFailed}
                  </Text>
                  {onRetry ? (
                    <NemuPressable
                      accessibilityRole="button"
                      accessibilityLabel={strings.japaneseLearningDictionary.retry}
                      minimumTouchTarget
                      onPress={onRetry}
                      pressedScale={0.96}
                      style={styles.ghostAction}
                    >
                      <Ionicons name="refresh" size={14} color={tokens.primary} />
                      <Text style={[styles.actionText, { color: tokens.primary }]}>
                        {strings.japaneseLearningDictionary.retry}
                      </Text>
                    </NemuPressable>
                  ) : null}
                </View>
              ) : grammarState.status === "loading" && packLoading ? (
                <View accessibilityLiveRegion="polite" style={styles.packLoading}>
                  <Text style={[styles.analyzingText, { color: nemuColorWithAlpha(tokens.mutedForeground, 0.8) }]}>
                    {packLoading.label}
                  </Text>
                  <NemuNativeProgressBar
                    accessibilityLabel={strings.japaneseLearningDictionary.progressAccessibility}
                    value={packLoading.progress}
                  />
                </View>
              ) : grammarState.status === "loading" ? (
                <View accessibilityLiveRegion="polite" style={styles.analyzing}>
                  <Text style={[styles.analyzingText, { color: nemuColorWithAlpha(tokens.mutedForeground, 0.8) }]}>
                    {strings.reader.pluginJapaneseLearningAnalyzingSentenceProgress}
                  </Text>
                  <ActivityIndicator size="small" color={tokens.primary} />
                </View>
              ) : grammarState.status === "idle" ? (
                // Study desk "Sentence" view before a line is chosen.
                <Text style={[styles.emptyHintText, styles.idleHint, { color: nemuColorWithAlpha(tokens.mutedForeground, 0.7) }]}>
                  {strings.reader.pluginJapaneseLearningGrammarHint}
                </Text>
              ) : null}
            </View>
          )}
        </ScrollView>
      </View>

      {/* Details pane — fills remaining space, scrollable */}
      <View style={styles.detailsPane}>
        <ScrollView
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.detailsScrollContent}
        >
          {hasTokens ? (
            multiSelectionActive ? (
              <View
                onLayout={(event) => setMultiCardWidth(event.nativeEvent.layout.width)}
                style={[
                  styles.multiSelectionCard,
                  // Web's header row; narrow panes put the actions under the text.
                  multiCardWidth > 0 && multiCardWidth < 460 ? styles.multiSelectionCardStacked : null,
                  { backgroundColor: colors.detailsCard, borderColor: colors.detailsCardBorder },
                ]}
              >
                <View style={[styles.multiSelectionTextBlock, multiCardWidth >= 460 ? styles.multiSelectionTextBlockRow : null]}>
                  <Text style={[styles.multiSelectionLabel, { color: tokens.foreground }]}>
                    {strings.reader.pluginJapaneseLearningSelectedText}
                  </Text>
                  <Text
                    numberOfLines={1}
                    selectable
                    style={[styles.multiSelectionValue, { color: tokens.foreground }]}
                  >
                    {selectedRangeText}
                  </Text>
                </View>
                <View style={styles.multiSelectionActions}>
                  <NemuPressable
                    accessibilityRole="button"
                    accessibilityLabel={strings.reader.pluginJapaneseLearningCopySelection}
                    minimumTouchTarget
                    onPress={() => onCopySelection(selectedRangeText)}
                    pressedScale={0.96}
                    style={styles.ghostAction}
                  >
                    <Ionicons name="copy-outline" size={14} color={tokens.mutedForeground} />
                    <Text style={[styles.actionText, { color: tokens.mutedForeground }]}>
                      {strings.reader.pluginJapaneseLearningCopySelection}
                    </Text>
                  </NemuPressable>
                  <NemuPressable
                    accessibilityRole="button"
                    accessibilityLabel={strings.reader.pluginJapaneseLearningAskAboutTheseWords}
                    accessibilityState={{ disabled: askDisabled }}
                    minimumTouchTarget
                    disabled={askDisabled}
                    onPress={() => onAskSelection(selectedRangeText, "words")}
                    pressedScale={0.96}
                    containerStyle={styles.primaryActionContainer}
                    style={[
                      styles.primaryAction,
                      { backgroundColor: tokens.primary, opacity: askDisabled ? 0.5 : 1 },
                    ]}
                  >
                    <Ionicons name="chatbubbles-outline" size={14} color={tokens.primaryForeground} />
                    <Text style={[styles.actionText, { color: tokens.primaryForeground }]}>
                      {strings.reader.pluginJapaneseLearningAskAboutTheseWords}
                    </Text>
                  </NemuPressable>
                </View>
              </View>
            ) : selectedToken ? (
              <JapaneseLearningTokenDetails
                key={`details-${selectedTokenIndex}`}
                token={selectedToken}
                strings={strings}
                onAskNemu={
                  mobileJapaneseLearningTokenCanAct(selectedToken) && !askDisabled
                    ? handleAskSingleWord
                    : undefined
                }
                onCopy={onCopySelection}
              />
            ) : (
              <View style={styles.emptyHint}>
                <Text style={[styles.emptyHintText, { color: nemuColorWithAlpha(tokens.mutedForeground, 0.7) }]}>
                  {strings.reader.pluginJapaneseLearningTapAnyWordHint}
                </Text>
                <Text style={[styles.emptyHintText, { color: nemuColorWithAlpha(tokens.mutedForeground, 0.6) }]}>
                  {strings.reader.pluginJapaneseLearningDragOnWordsHint}
                </Text>
              </View>
            )
          ) : null}
          {actionNotice ? (
            <Text
              accessibilityLiveRegion="polite"
              style={[styles.actionNotice, { color: tokens.mutedForeground }]}
            >
              {actionNotice}
            </Text>
          ) : null}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
  },
  // Web: `max-h-[14rem]` sentence pane.
  sentencePane: {
    flexShrink: 0,
    maxHeight: 224,
    overflow: "hidden",
  },
  // Web: `px-4 pt-3 pb-3`.
  sentenceScrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  tokenWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-end",
    rowGap: 6,
  },
  rawLayer: {
    gap: 8,
  },
  // Web: `.ja-textbook text-[1.4rem] leading-relaxed whitespace-pre-wrap`.
  rawText: {
    fontFamily: Platform.select(JAPANESE_LEARNING_SERIF_FONT_FAMILY),
    fontSize: 22,
    lineHeight: 36,
  },
  analyzing: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingTop: 12,
  },
  analyzingText: {
    fontSize: 12,
    lineHeight: 16,
  },
  errorText: {
    fontSize: 12,
    lineHeight: 16,
  },
  errorBlock: {
    alignItems: "flex-start",
    gap: 4,
  },
  packLoading: {
    alignSelf: "stretch",
    alignItems: "center",
    gap: 10,
    paddingTop: 12,
    paddingHorizontal: 8,
  },
  detailsPane: {
    flex: 1,
    minHeight: 0,
  },
  // Web: `px-4 pt-1 pb-4`.
  detailsScrollContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 16,
  },
  // Web: `rounded-xl p-4 token-details-card`, header row with the actions.
  multiSelectionCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  multiSelectionCardStacked: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: 12,
  },
  multiSelectionTextBlockRow: {
    flex: 1,
  },
  multiSelectionTextBlock: {
    flexShrink: 1,
    minWidth: 0,
    gap: 4,
  },
  multiSelectionLabel: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: nemuFontWeight.medium,
  },
  multiSelectionValue: {
    fontFamily: Platform.select(JAPANESE_LEARNING_SERIF_FONT_FAMILY),
    fontSize: 18,
    lineHeight: 26,
  },
  multiSelectionActions: {
    flexDirection: "row",
    gap: 6,
    flexShrink: 1,
  },
  // Web: ghost `sm` button.
  ghostAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 32,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
  },
  primaryActionContainer: {
    flexShrink: 1,
    minWidth: 0,
  },
  // Web: default `sm` button.
  primaryAction: {
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 32,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
  },
  actionText: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: nemuFontWeight.medium,
  },
  // Web: `py-6 text-center`, `text-xs text-muted-foreground/70` + `/60 mt-1`.
  emptyHint: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 24,
    gap: 4,
  },
  idleHint: {
    paddingVertical: 24,
  },
  emptyHintText: {
    fontSize: 12,
    lineHeight: 16,
    textAlign: "center",
  },
  actionNotice: {
    fontSize: 12,
    fontWeight: nemuFontWeight.medium,
    paddingTop: 8,
    textAlign: "center",
  },
});
