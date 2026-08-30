import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { nemuFontWeight, radius, useNemuTheme, NemuPressable } from "@/design-system";
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
import { JapaneseLearningTokenDisplay } from "./JapaneseLearningTokenDisplay";
import { JapaneseLearningTokenSummary } from "./JapaneseLearningTokenSummary";
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
}: SentenceDisplayProps) {
  const { tokens } = useNemuTheme();
  const tokenLayoutsRef = useRef<Array<JapaneseLearningTokenLayout | undefined>>([]);
  const dragStartIndexRef = useRef<number | null>(null);
  const draggingSelectionRef = useRef(false);
  const [selectionStart, setSelectionStart] = useState<number | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<number | null>(null);
  const [selectionKey, setSelectionKey] = useState("");
  const [isDraggingSelection, setIsDraggingSelection] = useState(false);
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

  const handleAskSingleWord = useCallback(() => {
    if (selectedToken && mobileJapaneseLearningTokenCanAct(selectedToken)) {
      onAskSelection(selectedToken.word, "word");
    }
  }, [onAskSelection, selectedToken]);

  return (
    <View style={styles.container}>
      {/* Sentence pane — capped height, scrollable */}
      <View style={[styles.sentencePane, { maxHeight: 230 }]}>
        <ScrollView
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.sentenceScrollContent}
        >
          {grammarState.status === "loading" ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={tokens.primary} />
              <Text style={[styles.loadingText, { color: tokens.mutedForeground }]}>
                {grammarState.stage === "normalizing"
                  ? strings.reader.pluginJapaneseLearningNormalizingSentence
                  : strings.reader.pluginJapaneseLearningAnalyzingSentence}
              </Text>
            </View>
          ) : grammarState.status === "error" ? (
            <Text
              accessibilityRole="alert"
              accessibilityLiveRegion="assertive"
              style={[styles.errorText, { color: tokens.danger }]}
            >
              {strings.reader.pluginJapaneseLearningGrammarFailed}
            </Text>
          ) : grammarTokens.length > 0 ? (
            <View
              onStartShouldSetResponderCapture={() =>
                grammarTokens.length > 0
              }
              onMoveShouldSetResponder={() => grammarTokens.length > 0}
              onResponderGrant={(e) =>
                beginTokenGesture(e.nativeEvent.locationX, e.nativeEvent.locationY)
              }
              onResponderMove={(e) =>
                moveTokenGesture(e.nativeEvent.locationX, e.nativeEvent.locationY)
              }
              onResponderRelease={(e) =>
                endTokenGesture(e.nativeEvent.locationX, e.nativeEvent.locationY)
              }
              onResponderTerminate={cancelTokenGesture}
              style={[
                styles.tokenWrap,
                {
                  opacity:
                    isDraggingSelection && !selectedTokenIndex ? 0.85 : 1,
                },
              ]}
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
                    token.reading && token.reading !== token.word
                      ? token.reading.replace(/\n/g, "")
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
          ) : null}
        </ScrollView>
      </View>

      {/* Details pane — fills remaining space */}
      <View style={styles.detailsPane}>
        <ScrollView
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.detailsScrollContent}
        >
          {grammarTokens.length > 0 ? (
            multiSelectionActive ? (
              <View
                style={[
                  styles.multiSelectionCard,
                  { backgroundColor: tokens.card, borderColor: tokens.border },
                ]}
              >
                <View style={styles.multiSelectionHeader}>
                  <View style={styles.multiSelectionTextBlock}>
                    <Text
                      style={[
                        styles.multiSelectionLabel,
                        { color: tokens.mutedForeground },
                      ]}
                    >
                      {strings.reader.pluginJapaneseLearningSelectedText}
                    </Text>
                    <Text
                      numberOfLines={2}
                      style={[
                        styles.multiSelectionValue,
                        { color: tokens.foreground },
                      ]}
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
                      containerStyle={styles.actionButtonContainer}
                      style={[
                        styles.actionButton,
                        {
                          backgroundColor: tokens.muted,
                          borderColor: tokens.border,
                        },
                      ]}
                    >
                      <Ionicons name="copy-outline" size={14} color={tokens.foreground} />
                      <Text style={[styles.actionText, { color: tokens.foreground }]}>
                        {strings.reader.pluginJapaneseLearningCopySelection}
                      </Text>
                    </NemuPressable>
                    <NemuPressable
                      accessibilityRole="button"
                      accessibilityLabel={strings.reader.pluginJapaneseLearningAskWords}
                      accessibilityState={{ disabled: askDisabled }}
                      minimumTouchTarget
                      disabled={askDisabled}
                      onPress={() => onAskSelection(selectedRangeText, "words")}
                      pressedScale={0.96}
                      containerStyle={styles.actionButtonContainer}
                      style={[
                        styles.actionButton,
                        {
                          backgroundColor: tokens.primary,
                          borderColor: tokens.primary,
                          opacity: askDisabled ? 0.72 : 1,
                        },
                      ]}
                    >
                      <Ionicons
                        name="chatbubble-ellipses-outline"
                        size={14}
                        color={tokens.primaryForeground}
                      />
                      <Text
                        style={[
                          styles.actionText,
                          { color: tokens.primaryForeground },
                        ]}
                      >
                        {strings.reader.pluginJapaneseLearningAskWords}
                      </Text>
                    </NemuPressable>
                  </View>
                </View>
              </View>
            ) : selectedToken && mobileJapaneseLearningTokenCanAct(selectedToken) ? (
              <View
                style={[
                  styles.tokenDetailsCard,
                  { backgroundColor: tokens.card, borderColor: tokens.border },
                ]}
              >
                <JapaneseLearningTokenSummary
                  token={selectedToken}
                  strings={strings}
                  tokens={tokens}
                  onAskNemu={handleAskSingleWord}
                />
                <JapaneseLearningTokenDetails
                  token={selectedToken}
                  strings={strings}
                  tokens={tokens}
                />
              </View>
            ) : (
              <View style={styles.emptyHint}>
                <Text
                  style={[styles.emptyHintText, { color: tokens.mutedForeground }]}
                >
                  {strings.reader.pluginJapaneseLearningTapTokenHint}
                </Text>
                <Text
                  style={[
                    styles.emptyHintSubtext,
                    { color: tokens.mutedForeground, opacity: 0.7 },
                  ]}
                >
                  {strings.reader.pluginJapaneseLearningDragWordsHint}
                </Text>
              </View>
            )
          ) : null}
          {actionNotice ? (
            <Text
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
  sentencePane: {
    flexShrink: 0,
    overflow: "hidden",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sentenceScrollContent: {
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  tokenWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-end",
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 16,
  },
  loadingText: {
    fontSize: 13,
    fontWeight: nemuFontWeight.medium,
  },
  errorText: {
    fontSize: 13,
    fontWeight: nemuFontWeight.medium,
    paddingVertical: 16,
  },
  detailsPane: {
    flex: 1,
    minHeight: 0,
  },
  detailsScrollContent: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    paddingBottom: 20,
  },
  multiSelectionCard: {
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
  },
  multiSelectionHeader: {
    gap: 10,
  },
  multiSelectionTextBlock: {
    gap: 4,
  },
  multiSelectionLabel: {
    fontSize: 13,
    fontWeight: nemuFontWeight.semibold,
  },
  multiSelectionValue: {
    fontSize: 18,
    fontWeight: nemuFontWeight.semibold,
  },
  multiSelectionActions: {
    flexDirection: "row",
    gap: 8,
  },
  actionButton: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    minHeight: 32,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 6,
  },
  actionButtonContainer: {
    flex: 1,
    minWidth: 0,
  },
  actionText: {
    fontSize: 12,
    fontWeight: nemuFontWeight.semibold,
  },
  tokenDetailsCard: {
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 12,
  },
  emptyHint: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 24,
    gap: 4,
  },
  emptyHintText: {
    fontSize: 12,
    fontWeight: nemuFontWeight.medium,
  },
  emptyHintSubtext: {
    fontSize: 12,
  },
  actionNotice: {
    fontSize: 12,
    fontWeight: nemuFontWeight.medium,
    paddingTop: 8,
  },
});
