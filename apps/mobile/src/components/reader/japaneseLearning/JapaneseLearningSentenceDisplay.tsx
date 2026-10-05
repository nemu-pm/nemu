import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type ViewInstance,
  type ScrollViewInstance,
} from "react-native";
import Animated, {
  Easing,
  useReducedMotion,
  withTiming,
} from "react-native-reanimated";
import {
  nemuColorWithAlpha,
  nemuFontWeight,
  spacing,
  useNemuTheme,
  NemuNativeProgressBar,
  NemuPressable,
} from "@/design-system";
import { JapaneseLearningText as Text } from "./JapaneseLearningText";
import Ionicons from "@expo/vector-icons/Ionicons";
import { JapaneseLearningWebIcon, JapaneseLearningWebSpinner } from "./JapaneseLearningWebIcon";
import { hapticPress } from "@/lib/haptics";
import type { MobileGrammarToken } from "@/lib/mobileJapaneseLearningGrammar";
import {
  classifyMobileJapaneseLearningTokenPan,
  MOBILE_GRAMMAR_TOKEN_HIT_SLOP,
  mobileGrammarTokenAtPoint,
  mobileGrammarTokenInSelection,
  mobileJapaneseLearningAnalysisErrorText,
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
  JAPANESE_LEARNING_FURIGANA_ROW_HEIGHT,
  JAPANESE_LEARNING_SERIF_FONT_FAMILY,
  mobileJapaneseLearningSurfaceColors,
} from "@/lib/mobileJapaneseLearningSurfaceTheme";
import { getMobileJapaneseLearningEnginePreference } from "@/lib/mobileJapaneseLearningEngine";
import { isMobileJapaneseLearningSignedIn } from "@/lib/mobileJapaneseLearningAuth";
import { describeMobileJapaneseLearningPackLoading } from "@/lib/mobileJapaneseLearningAnalysisPackState";
import { useMobileJapaneseLearningAnalysisPackState } from "@/lib/mobileJapaneseLearningAnalysisPackStore";
import {
  JAPANESE_LEARNING_SENTENCE_COLUMN_FRACTION,
  JAPANESE_LEARNING_SENTENCE_PANE_MAX_HEIGHT,
  JAPANESE_LEARNING_SENTENCE_PANE_MAX_HEIGHT_REGULAR,
  resolveJapaneseLearningColumnBubbleMaxHeight,
  resolveJapaneseLearningSentenceLayout,
} from "@/lib/mobileJapaneseLearningSheetLayout";
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
  /**
   * The selected bubble, when the sheet covers the page and the floating
   * popout cannot show. Stacked: above the sentence, scrolling with it.
   * Columns: the sentence column keeps only the words; the bubble takes the
   * details column at a readable size while nothing is selected
   * (`resolveJapaneseLearningColumnBubbleMaxHeight`, passed as `maxHeight`),
   * and gives the column to the details card once a word is chosen.
   */
  sentenceHeader?: ReactNode | ((maxHeight: number | undefined) => ReactNode);
}

/**
 * Mobile mirror of web `SentenceDisplay` (sentence-display.tsx): the sentence
 * (raw text, then furigana tokens) and the details (multi-selection actions,
 * a single token's summary + details, or an empty-state hint), each in its
 * own scroll pane. Stacked as on web — a content-sized sentence pane over the
 * details — unless the body is wide and short, where the two sit side by side
 * (`resolveJapaneseLearningSentenceLayout`). No fades over the text.
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
  sentenceHeader: sentenceHeaderProp,
}: SentenceDisplayProps) {
  const { tokens, scheme } = useNemuTheme();
  const reduceMotion = useReducedMotion();

  const detailsScrollRef = useRef<ScrollViewInstance>(null);
  const [bodySize, setBodySize] = useState({ width: 0, height: 0 });
  // Wide and short bodies put the sentence and the details side by side.
  const columns = resolveJapaneseLearningSentenceLayout(bodySize) === "columns";
  // Web `sm:` sizes (≥640pt) for the stacked drawer; a column is phone-sized.
  const regularWidth = !columns && bodySize.width >= 640;
  // Sentence column: its height and its content's, to tell when the words
  // overflow it. Details column: its height, for the bubble shown there.
  const sentenceColumnRef = useRef<ScrollViewInstance>(null);
  const [sentenceColumnHeight, setSentenceColumnHeight] = useState(0);
  const [sentenceColumnContentHeight, setSentenceColumnContentHeight] = useState(0);
  const [detailsColumnHeight, setDetailsColumnHeight] = useState(0);
  const renderSentenceHeader = (maxHeight: number | undefined) =>
    typeof sentenceHeaderProp === "function" ? sentenceHeaderProp(maxHeight) : sentenceHeaderProp;
  const sentenceHeader = columns ? null : renderSentenceHeader(undefined);
  const columnBubble = columns
    ? renderSentenceHeader(
        resolveJapaneseLearningColumnBubbleMaxHeight({
          columnHeight: detailsColumnHeight,
          chrome: DETAILS_COLUMN_BUBBLE_CHROME,
        }),
      )
    : null;
  // A sentence still taller than its column scrolls: flash the indicator
  // once it overflows so the rows below the edge read as more, not as cut.
  const sentenceColumnOverflows =
    columns &&
    sentenceColumnHeight > 0 &&
    sentenceColumnContentHeight > sentenceColumnHeight + 1;
  useEffect(() => {
    if (!sentenceColumnOverflows) return;
    const timer = setTimeout(() => sentenceColumnRef.current?.flashScrollIndicators(), 350);
    return () => clearTimeout(timer);
  }, [sentenceColumnOverflows, sentenceColumnContentHeight]);
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
  // Where a drag on the words started and what it turned into
  // (`classifyMobileJapaneseLearningTokenPan`); the pane holds still while a
  // drag selects.
  const tokenPanStartRef = useRef<{ x: number; y: number } | null>(null);
  const tokenPanModeRef = useRef<"pending" | "select" | "scroll">("pending");
  const [tokenDragSelecting, setTokenDragSelecting] = useState(false);
  const draggingSelectionRef = useRef(false);
  const [selectionStart, setSelectionStart] = useState<number | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<number | null>(null);
  const [selectionKey, setSelectionKey] = useState("");
  const [lastSeenTokensKey, setLastSeenTokensKey] = useState("");
  const [multiCardInnerWidth, setMultiCardInnerWidth] = useState(0);
  const [multiActionsWidth, setMultiActionsWidth] = useState(0);
  // The multi-selection actions drop Copy's label only when both labelled
  // actions cannot share one line inside the card (narrow windows).
  const multiCopyIconOnly =
    multiCardInnerWidth > 0 && multiActionsWidth > multiCardInnerWidth;
  // Natural single-line width of the "Selected text" label and the selection.
  const [multiTextWidth, setMultiTextWidth] = useState(0);
  // Web's row (text beside the actions) only when the whole selection fits
  // there on one line; otherwise the selection gets its own full-width line
  // and the actions sit under it on the trailing edge.
  const multiSelectionRow =
    multiCardInnerWidth > 0 &&
    multiActionsWidth > 0 &&
    multiTextWidth > 0 &&
    multiTextWidth + 8 + multiActionsWidth <= multiCardInnerWidth;

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
  // Word rects are never cleared when the words change. Fabric dispatches a
  // view's onLayout only when its frame changes, and the rects of a new
  // sentence can arrive before a passive effect would run, so clearing them
  // there sometimes left every word without a rect and every tap dead. A word
  // that mounts or moves reports again; one that kept its key and frame keeps
  // a rect that is still right; indexes past the new count are ignored.

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

  // Select a sole token automatically.
  const autoSelectedTokensRef = useRef<MobileGrammarToken[] | null>(null);
  useEffect(() => {
    if (autoSelectedTokensRef.current === grammarTokens) return;
    autoSelectedTokensRef.current = grammarTokens;
    if (grammarTokens.length === 1) onSelectToken(0);
  }, [grammarTokens, onSelectToken]);
  // Web: a new selection shows its details from the top.
  const detailsSignature = multiSelectionActive
    ? `range:${activeSelectionStart}-${activeSelectionEnd}`
    : `token:${selectedTokenIndex}`;
  useEffect(() => {
    detailsScrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [detailsSignature, tokensKey]);
  const clearRangeSelection = useCallback(() => {
    draggingSelectionRef.current = false;
    dragStartIndexRef.current = null;
    setSelectionStart(null);
    setSelectionEnd(null);
    setSelectionKey("");
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
        MOBILE_GRAMMAR_TOKEN_HIT_SLOP,
      );
      dragStartIndexRef.current = index;
      draggingSelectionRef.current = false;
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
        MOBILE_GRAMMAR_TOKEN_HIT_SLOP,
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
          MOBILE_GRAMMAR_TOKEN_HIT_SLOP,
        ) ?? start;

      if (draggingSelectionRef.current) {
        if (index != null) updateRangeSelection(index);
        void hapticPress();
      } else if (index != null) {
        selectSingleToken(index);
      }

      dragStartIndexRef.current = null;
      draggingSelectionRef.current = false;
    },
    [grammarTokens.length, selectSingleToken, updateRangeSelection],
  );

  const cancelTokenGesture = useCallback(() => {
    dragStartIndexRef.current = null;
    draggingSelectionRef.current = false;
  }, []);

  // QA builds only (EXPO_PUBLIC_JL_QA_TIMELINE): walk the selection states.
  const qaActionsRef = useRef({ onSelectToken, onAskSelection, tokensKey });
  useEffect(() => {
    qaActionsRef.current = { onSelectToken, onAskSelection, tokensKey };
  });
  useEffect(() => {
    if (!MOBILE_JAPANESE_LEARNING_QA_TIMELINE || grammarTokens.length === 0) return;
    const conjugatedIndex = grammarTokens.findIndex((token) => token.conjugations.length > 0);
    const longestIndex = grammarTokens.reduce(
      (best, token, index) => (token.meanings.length > (grammarTokens[best]?.meanings.length ?? 0) ? index : best),
      0,
    );
    const timers = mobileJapaneseLearningQaTimeline(grammarTokens.length, conjugatedIndex, longestIndex).map((step) =>
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
          // Web refs 08/09 ask about the whole sentence.
          if (grammarState.status === "ready") actions.onAskSelection(grammarState.text.trim(), "sentence");
        }
      }, step.atMs),
    );
    return () => timers.forEach(clearTimeout);
  }, [grammarState, grammarTokens]);

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

  // The analysis status (error / dictionary download / analyzing): under the
  // raw text when stacked (web), centred in the details column beside it.
  const statusBlock = grammarState.status === "error" ? (
    <View style={styles.errorBlock}>
      <Text
        accessibilityRole="alert"
        accessibilityLiveRegion="assertive"
        style={[styles.errorText, { color: nemuColorWithAlpha(colors.destructive, 0.9) }]}
      >
        {mobileJapaneseLearningAnalysisErrorText({
          detail: grammarState.detail,
          packFailed: packState.kind === "failed",
          preference: getMobileJapaneseLearningEnginePreference(),
          signedIn: isMobileJapaneseLearningSignedIn(),
          strings,
        })}
      </Text>
      {onRetry ? (
        <NemuPressable
          accessibilityRole="button"
          accessibilityLabel={strings.japaneseLearningDictionary.retry}
          hitSlop={6}
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
      <JapaneseLearningWebSpinner size={24} color={tokens.primary} />
    </View>
  ) : null;

  const sentenceContent = hasTokens ? (
    <View
      onStartShouldSetResponderCapture={() =>
        grammarTokens.length > 0
      }
      onMoveShouldSetResponder={() => grammarTokens.length > 0}
      ref={tokenWrapRef}
      onResponderGrant={(e) => {
        tokenPanStartRef.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
        tokenPanModeRef.current = "pending";
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
      onResponderMove={(e) => {
        // A predominantly vertical pan scrolls the pane (natively) and never
        // selects; a flatter one drags a selection with the pane held still.
        if (tokenPanModeRef.current === "pending") {
          const start = tokenPanStartRef.current;
          const mode = start
            ? classifyMobileJapaneseLearningTokenPan(e.nativeEvent.pageX - start.x, e.nativeEvent.pageY - start.y)
            : "select";
          if (mode === "pending") return;
          tokenPanModeRef.current = mode;
          if (mode === "scroll") {
            pendingTokenEventsRef.current = [];
            cancelTokenGesture();
            return;
          }
          setTokenDragSelecting(true);
        }
        if (tokenPanModeRef.current === "scroll") return;
        withTokenPoint(e, moveTokenGesture);
      }}
      onResponderRelease={(e) => {
        const mode = tokenPanModeRef.current;
        tokenPanModeRef.current = "pending";
        setTokenDragSelecting(false);
        if (mode === "scroll") return;
        withTokenPoint(e, endTokenGesture);
      }}
      onResponderTerminate={() => {
        tokenPanModeRef.current = "pending";
        setTokenDragSelecting(false);
        pendingTokenEventsRef.current = [];
        cancelTokenGesture();
      }}
      style={styles.tokenWrap}
    >
      {grammarTokens.map((token, index) => (
        <JapaneseLearningTokenDisplay
          key={`${index}-${token.word}-${token.partOfSpeech}`}
          token={token}
          regularWidth={regularWidth}
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
        <Text selectable accessibilityLanguage="ja" style={[styles.rawText, regularWidth ? styles.rawTextRegular : null, { color: tokens.foreground }]}>
          {rawText}
        </Text>
      ) : null}
      {columns ? null : statusBlock}
      {grammarState.status === "idle" ? (
        // The sentence view before a line is chosen.
        <Text style={[styles.emptyHintText, styles.idleHint, { color: nemuColorWithAlpha(tokens.mutedForeground, 0.7) }]}>
          {strings.reader.pluginJapaneseLearningGrammarHint}
        </Text>
      ) : null}
    </View>
  );

  // Web animates each details swap in (framer-motion): the word card rises
  // 12pt from 98%, the selection card 8pt, the hint fades. Reduce Motion: none.
  const detailsEntering = reduceMotion
    ? undefined
    : multiSelectionActive
      ? riseIn(8, 1, 200)
      : selectedToken
        ? riseIn(12, 0.98, 250)
        : riseIn(0, 1, 200);

  const detailsContent = (
    <>
      {hasTokens ? (
        <Animated.View
          key={detailsSignature}
          entering={detailsEntering}
          style={columns && !multiSelectionActive && !selectedToken ? styles.emptyHintColumn : null}
        >
        {multiSelectionActive ? (
          <View
            onLayout={(event) => {
              const next = Math.round(event.nativeEvent.layout.width) - MULTI_CARD_PADDING * 2;
              setMultiCardInnerWidth((current) => (current === next ? current : next));
            }}
            style={[
              styles.multiSelectionCard,
              multiSelectionRow ? styles.multiSelectionCardRow : null,
              { backgroundColor: colors.detailsCard, borderColor: colors.detailsCardBorder },
            ]}
          >
            <View
              pointerEvents="none"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              onLayout={(event) => {
                const next = Math.ceil(event.nativeEvent.layout.width);
                setMultiTextWidth((current) => (current === next ? current : next));
              }}
              style={styles.multiSelectionMeasure}
            >
              <Text numberOfLines={1} style={styles.multiSelectionLabel}>
                {strings.reader.pluginJapaneseLearningSelectedText}
              </Text>
              <Text numberOfLines={1} style={styles.multiSelectionValue}>
                {selectedRangeText}
              </Text>
            </View>
            {/* Web truncates the selection beside the actions; here the
                whole selection wraps on its own line and the actions wrap
                below it, right-aligned, when they do not fit beside it. */}
            <View style={multiSelectionRow ? styles.multiSelectionTextBlockRow : styles.multiSelectionTextBlock}>
              <Text numberOfLines={1} style={[styles.multiSelectionLabel, { color: tokens.foreground }]}>
                {strings.reader.pluginJapaneseLearningSelectedText}
              </Text>
              <Text
                selectable
                accessibilityLanguage="ja"
                style={[styles.multiSelectionValue, { color: tokens.foreground }]}
              >
                {selectedRangeText}
              </Text>
            </View>
            <View
              onLayout={(event) => {
                if (multiCopyIconOnly) return;
                const next = Math.ceil(event.nativeEvent.layout.width);
                setMultiActionsWidth((current) => (current === next ? current : next));
              }}
              style={[
                styles.multiSelectionActions,
                multiSelectionRow ? styles.multiSelectionActionsRow : null,
                multiCopyIconOnly ? styles.multiSelectionActionsShrink : null,
              ]}
            >
              <NemuPressable
                accessibilityRole="button"
                accessibilityLabel={strings.reader.pluginJapaneseLearningCopySelection}
                hitSlop={6}
                onPress={() => onCopySelection(selectedRangeText)}
                pressedScale={0.97}
                style={[styles.ghostAction, multiCopyIconOnly ? styles.ghostActionIconOnly : null]}
              >
                <JapaneseLearningWebIcon name="copy" color={tokens.mutedForeground} />
                {multiCopyIconOnly ? null : (
                  <Text numberOfLines={1} style={[styles.actionText, { color: tokens.mutedForeground }]}>
                    {strings.reader.pluginJapaneseLearningCopySelection}
                  </Text>
                )}
              </NemuPressable>
              <NemuPressable
                accessibilityRole="button"
                accessibilityLabel={strings.reader.pluginJapaneseLearningAskAboutTheseWords}
                accessibilityState={{ disabled: askDisabled }}
                hitSlop={6}
                disabled={askDisabled}
                onPress={() => onAskSelection(selectedRangeText, "words")}
                pressedScale={0.97}
                containerStyle={multiCopyIconOnly ? styles.primaryActionContainerShrink : null}
                style={[
                  styles.primaryAction,
                  { backgroundColor: tokens.primary, opacity: askDisabled ? 0.5 : 1 },
                ]}
              >
                <JapaneseLearningWebIcon name="ask" color={tokens.primaryForeground} />
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit={multiCopyIconOnly}
                  minimumFontScale={0.8}
                  style={[
                    styles.actionText,
                    multiCopyIconOnly ? styles.actionTextShrink : null,
                    { color: tokens.primaryForeground },
                  ]}
                >
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
            regularWidth={regularWidth}
            onAskNemu={
              mobileJapaneseLearningTokenCanAct(selectedToken) && !askDisabled
                ? handleAskSingleWord
                : undefined
            }
            onCopy={onCopySelection}
          />
        ) : (
          <View style={[styles.emptyHint, columns ? styles.emptyHintColumn : null]}>
            {columnBubble}
            <View style={styles.emptyHintLines}>
              <Text style={[styles.emptyHintText, { color: nemuColorWithAlpha(tokens.mutedForeground, 0.7) }]}>
                {strings.reader.pluginJapaneseLearningTapAnyWordHint}
              </Text>
              <Text style={[styles.emptyHintText, { color: nemuColorWithAlpha(tokens.mutedForeground, 0.6) }]}>
                {strings.reader.pluginJapaneseLearningDragOnWordsHint}
              </Text>
            </View>
          </View>
        )}
        </Animated.View>
      ) : columns && (statusBlock || columnBubble) ? (
        <View style={styles.columnStatus}>
          {columnBubble}
          {statusBlock}
        </View>
      ) : null}
      {actionNotice ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[styles.actionNotice, { color: tokens.mutedForeground }]}
        >
          {actionNotice}
        </Text>
      ) : null}
    </>
  );

  return (
    <View
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setBodySize((current) =>
          current.width === width && current.height === height ? current : { width, height },
        );
      }}
      style={[styles.container, columns ? styles.containerColumns : null]}
    >
      {columns ? (
        <>
          <ScrollView
            ref={sentenceColumnRef}
            style={[
              styles.sentenceColumn,
              { width: Math.round(bodySize.width * JAPANESE_LEARNING_SENTENCE_COLUMN_FRACTION) },
            ]}
            contentContainerStyle={styles.sentenceColumnContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
            scrollEnabled={!tokenDragSelecting}
            onLayout={(event) => {
              const next = event.nativeEvent.layout.height;
              setSentenceColumnHeight((current) => (Math.abs(current - next) < 0.5 ? current : next));
            }}
            onContentSizeChange={(_width, height) => {
              setSentenceColumnContentHeight((current) => (Math.abs(current - height) < 0.5 ? current : height));
            }}
          >
            {sentenceContent}
          </ScrollView>
          <ScrollView
            ref={detailsScrollRef}
            style={styles.detailsColumn}
            contentContainerStyle={[
              styles.detailsColumnContent,
              // The card's top edge meets the first token chip's (below its
              // furigana row); the bubble and hint centre in the whole column.
              hasTokens && (multiSelectionActive || selectedToken || !columnBubble)
                ? { paddingTop: spacing.md + JAPANESE_LEARNING_FURIGANA_ROW_HEIGHT }
                : null,
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
            onLayout={(event) => {
              const next = event.nativeEvent.layout.height;
              setDetailsColumnHeight((current) => (Math.abs(current - next) < 0.5 ? current : next));
            }}
          >
            {detailsContent}
          </ScrollView>
        </>
      ) : (
        <>
          {/* Web sentence pane: content-sized, scrolls past ~3 token rows. */}
          <ScrollView
            style={[
              styles.sentencePane,
              {
                maxHeight: regularWidth
                  ? JAPANESE_LEARNING_SENTENCE_PANE_MAX_HEIGHT_REGULAR
                  : JAPANESE_LEARNING_SENTENCE_PANE_MAX_HEIGHT,
              },
            ]}
            contentContainerStyle={styles.sentencePaneContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
            scrollEnabled={!tokenDragSelecting}
          >
            {sentenceHeader}
            {sentenceContent}
          </ScrollView>
          {/* Web details pane: fills the rest and scrolls on its own. */}
          <ScrollView
            ref={detailsScrollRef}
            style={styles.detailsPane}
            contentContainerStyle={styles.detailsPaneContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
          >
            {detailsContent}
          </ScrollView>
        </>
      )}
    </View>
  );
}

/** Web details card `p-4`. */
const MULTI_CARD_PADDING = 16;

/**
 * Everything in the details column besides the bubble shown there while
 * nothing is selected: the column's vertical padding (`detailsColumnContent`),
 * the gap under the bubble (`emptyHint`) and the two hint lines.
 */
const DETAILS_COLUMN_BUBBLE_CHROME = spacing.md + spacing.lg + spacing.lg + 2 * 16 + 4;

/** Web's details entrance (`initial={{ opacity: 0, y, scale }}`, ease-out-quint). */
function riseIn(fromY: number, fromScale: number, durationMs: number) {
  return () => {
    "worklet";
    const config = { duration: durationMs, easing: Easing.bezier(0.22, 1, 0.36, 1) };
    return {
      initialValues: { opacity: 0, transform: [{ translateY: fromY }, { scale: fromScale }] },
      animations: {
        opacity: withTiming(1, config),
        transform: [{ translateY: withTiming(0, config) }, { scale: withTiming(1, config) }],
      },
    };
  };
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
  },
  containerColumns: {
    flexDirection: "row",
  },
  // Web sentence pane `shrink-0 max-h-[14rem]` (the cap is set inline).
  sentencePane: {
    flexGrow: 0,
    flexShrink: 0,
  },
  // Web: `px-4 pt-3 pb-3`.
  sentencePaneContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  // Web details pane `flex-1 min-h-0`.
  detailsPane: {
    flex: 1,
    minHeight: 0,
  },
  // Web: `px-4 pt-1 pb-4`.
  detailsPaneContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 16,
  },
  // The sentence column's width is set from the measured body
  // (`JAPANESE_LEARNING_SENTENCE_COLUMN_FRACTION`); the details take the rest.
  sentenceColumn: {
    flexGrow: 0,
    flexShrink: 0,
  },
  detailsColumn: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
  },
  // One grid: the sheet's 16pt page gutter at both outer edges and between
  // the columns (half on each side, so selection shadows are not clipped at
  // the column edge), web's 12pt sentence inset at the top, 16pt at the end.
  sentenceColumnContent: {
    paddingLeft: spacing.lg,
    paddingRight: spacing.lg / 2,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  detailsColumnContent: {
    flexGrow: 1,
    paddingLeft: spacing.lg / 2,
    paddingRight: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  // Analysis status beside the raw text: centred in the details column.
  columnStatus: {
    flexGrow: 1,
    justifyContent: "center",
    gap: spacing.lg,
  },
  tokenWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-end",
    rowGap: 0,
  },
  rawLayer: {
    gap: 8,
  },
  // Web: `.ja-textbook text-[1.4rem] leading-relaxed whitespace-pre-wrap`.
  rawText: {
    fontFamily: Platform.select(JAPANESE_LEARNING_SERIF_FONT_FAMILY),
    fontSize: 22.4,
    lineHeight: 36.4,
  },
  rawTextRegular: { fontSize: 25.6, lineHeight: 41.6 },
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
  // Web: `rounded-xl p-4 token-details-card`.
  multiSelectionCard: {
    borderRadius: 14.4,
    borderWidth: 0.5,
    padding: MULTI_CARD_PADDING,
    gap: 12,
  },
  // Web: `flex items-center justify-between gap-2`.
  multiSelectionCardRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  multiSelectionMeasure: {
    position: "absolute",
    left: 0,
    top: 0,
    opacity: 0,
    alignItems: "flex-start",
  },
  // Web: `space-y-1`, the selection wrapping over the full card width.
  multiSelectionTextBlock: {
    alignSelf: "stretch",
    gap: 4,
  },
  // Web: `space-y-1 min-w-0 flex-1`.
  multiSelectionTextBlockRow: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  // Web: `text-sm font-medium`.
  multiSelectionLabel: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: nemuFontWeight.medium,
  },
  // Web: `text-lg ja-textbook`.
  multiSelectionValue: {
    fontFamily: Platform.select(JAPANESE_LEARNING_SERIF_FONT_FAMILY),
    fontSize: 18,
    lineHeight: 28,
  },
  // Web: `flex gap-1.5 flex-shrink-0`, pushed to the trailing edge when wrapped.
  multiSelectionActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
    alignSelf: "flex-end",
  },
  multiSelectionActionsRow: { alignSelf: "center" },
  multiSelectionActionsShrink: { flexShrink: 1, minWidth: 0 },
  // Web: ghost `sm` button (`h-8 px-3 gap-1.5 rounded-lg`).
  ghostAction: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 32,
    borderRadius: 10.4,
    paddingHorizontal: 12,
  },
  ghostActionIconOnly: { width: 32, paddingHorizontal: 0 },
  primaryActionContainerShrink: {
    flexShrink: 1,
    minWidth: 0,
  },
  // Web: default `sm` button with the `.btn-nemu-primary` edge and shadow.
  primaryAction: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 32,
    borderRadius: 10.4,
    borderWidth: 0.5,
    borderColor: "rgba(143,181,255,0.25)",
    boxShadow: "0px 2px 8px 0px rgba(0,0,0,0.35), 0px 0px 1px 0px rgba(0,0,0,0.3)",
    paddingHorizontal: 12,
  },
  actionText: {
    flexShrink: 0,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: nemuFontWeight.medium,
  },
  actionTextShrink: { flexShrink: 1 },
  // A small inline hint, not a reserved pane below the sentence.
  emptyHint: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    gap: spacing.lg,
  },
  emptyHintLines: {
    alignItems: "center",
    gap: 4,
  },
  // Nothing selected yet: the hint centred in the empty details column.
  emptyHintColumn: {
    flexGrow: 1,
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
