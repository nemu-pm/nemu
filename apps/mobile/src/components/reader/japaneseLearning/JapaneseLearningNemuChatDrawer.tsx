import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type ScrollViewInstance,
  type TextInputInstance,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { BlurView } from "expo-blur";
import {
  nemuColorWithAlpha,
  nemuFontWeight,
  NemuPressable,
  radius,
  useNemuTheme,
} from "@/design-system";
import { JapaneseLearningText as Text } from "./JapaneseLearningText";
import {
  JapaneseLearningSurfaceFrame,
  japaneseLearningEdgeToEdgeContentStyle,
} from "./JapaneseLearningSurfaceFrame";
import { useJapaneseLearningDrawerFrame } from "./useJapaneseLearningDrawerFrame";
import type { AppLanguage } from "@/data/schema";
import type { JapaneseLearningChatThreadMessage } from "@/lib/mobileJapaneseLearningReaderHelpers";
import type { MobileStrings } from "@/lib/mobileI18n";
import { JapaneseLearningFollowUpSuggestions } from "./JapaneseLearningFollowUpSuggestions";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import {
  getJapaneseLearningChatInputSurfaces,
  JAPANESE_LEARNING_CHAT_INPUT_BAND_BLUR_INTENSITY,
  JAPANESE_LEARNING_CHAT_INPUT_TRANSITION_MS,
} from "@/lib/mobileJapaneseLearningChatTheme";
import {
  JapaneseLearningDatePill,
  JapaneseLearningMessageBubble,
} from "./JapaneseLearningMessageBubble";
import { JapaneseLearningNemuAvatar } from "./JapaneseLearningNemuAvatar";
import { JapaneseLearningTypingIndicator } from "./JapaneseLearningTypingIndicator";
import { JapaneseLearningChatMicButton } from "./JapaneseLearningChatMicButton";
import { japaneseLearningInterStyle } from "./JapaneseLearningText";
import { shouldShowMobileJapaneseLearningDictationButton } from "@/lib/mobileJapaneseLearningDictation";
import { useMobileJapaneseLearningDictation } from "@/lib/useMobileJapaneseLearningDictation";

export interface JapaneseLearningChatTtsState {
  status: "idle" | "loading" | "playing" | "error";
  source?: "sentence" | "transcript" | "chat";
  messageId?: string;
  detail?: string;
  currentTime?: number;
  duration?: number;
}

interface NemuChatDrawerProps {
  visible: boolean;
  appLanguage: AppLanguage;
  strings: MobileStrings;
  chatMessages: JapaneseLearningChatThreadMessage[];
  chatInput: string;
  /** Web store `isStreaming`: true until the last speak bubble has landed. */
  chatLoading: boolean;
  /** Web store `followUpSuggestions` (cleared by every send). */
  followUpSuggestions: string[];
  showTypingIndicator: boolean;
  ttsState: JapaneseLearningChatTtsState;
  onClose: () => void;
  onChangeInput: (text: string) => void;
  onSendInput: () => void;
  onSendSuggestion: (suggestion: string) => void;
  onToggleChatTts: (message: JapaneseLearningChatThreadMessage) => void;
  /** Web waveform scrub: seek the playing voice message (seconds). */
  onSeekChatTts?: (seconds: number) => void;
  /** Called after the surface has closed (sheet dismissal finished / dock removed). */
  onDismiss?: () => void;
  onPresentationProgress?: (progress: number) => void;
  /**
   * iOS: a sheet stacked on the chat (sign-in). A native sheet can only be
   * presented by the topmost one, so it is hosted in this content.
   */
  stackedSurface?: ReactNode;
}

/** Web drawer header: the character's name, untranslated in every locale. */
const NEMU_CHAT_TITLE = "Nemu";

/**
 * Mobile mirror of web `NemuChatDrawer` (chat/ui/drawer.tsx).
 * A separate bottom sheet (independent of the OCR result sheet) containing
 * the conversation thread, typing indicator, suggestions, and a LINE-style
 * input bar. Messages are grouped by consecutive role with avatars/tails.
 */
export function JapaneseLearningNemuChatDrawer({
  visible,
  appLanguage,
  strings,
  chatMessages,
  chatInput,
  chatLoading,
  followUpSuggestions,
  showTypingIndicator,
  ttsState,
  onClose,
  onChangeInput,
  onSendInput,
  onSendSuggestion,
  onToggleChatTts,
  onSeekChatTts,
  onDismiss,
  onPresentationProgress,
  stackedSurface = null,
}: NemuChatDrawerProps) {
  const { reduceMotion, tokens, scheme } = useNemuTheme();
  const drawerFrame = useJapaneseLearningDrawerFrame();
  const [inputFocused, setInputFocused] = useState(false);
  const atBottomRef = useRef(true);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const inputRef = useRef<TextInputInstance>(null);

  const visibleMessages = useMemo(
    () => chatMessages.filter((m) => !m.hidden),
    [chatMessages],
  );

  // Group consecutive messages by role — mirrors web drawer.tsx
  const groups = useMemo(() => {
    const result: JapaneseLearningChatThreadMessage[][] = [];
    let currentGroup: JapaneseLearningChatThreadMessage[] = [];
    let currentRole: string | null = null;
    for (const msg of visibleMessages) {
      if (msg.role !== currentRole) {
        if (currentGroup.length) result.push(currentGroup);
        currentGroup = [msg];
        currentRole = msg.role;
      } else {
        currentGroup.push(msg);
      }
    }
    if (currentGroup.length) result.push(currentGroup);
    return result;
  }, [visibleMessages]);

  const lastVisibleMessage = visibleMessages[visibleMessages.length - 1];
  const showTypingAvatar = !lastVisibleMessage || lastVisibleMessage.role !== "assistant";

  const hasContent = visibleMessages.length > 0 || chatLoading;
  const shouldShowTypingIndicator = chatLoading && showTypingIndicator;
  const suggestions = chatLoading ? [] : followUpSuggestions;

  // Web `LineInputBar`: never disabled; send whenever there is text (a new
  // request cancels the reply in flight).
  const canSend = chatInput.trim().length > 0;
  // Web LineInputBar voice input: transcripts replace the draft, never auto-send.
  const dictation = useMobileJapaneseLearningDictation({
    active: visible,
    appLanguage,
    onTranscript: onChangeInput,
  });
  const showMic = shouldShowMobileJapaneseLearningDictationButton({
    available: dictation.available,
    input: chatInput,
  });

  // Web `ScrollToBottomOnChange`: follow every message-count change (hidden
  // ones included) 50ms later; stick-to-bottom covers dots and suggestions.
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 50);
    return () => clearTimeout(timer);
  }, [chatMessages.length, visible]);

  const handleSubmit = useCallback(() => {
    if (!canSend) return;
    // Kept beyond web: iOS delivers the final recognition result after the
    // tap, which would refill the draft that was just sent.
    dictation.abort();
    onSendInput();
    // Web `sendMessage`: clear, then refocus the input so the keyboard stays
    // up for the next message (suggestion taps opt out, as on web).
    inputRef.current?.focus();
  }, [canSend, dictation, onSendInput]);

  const inputFont = japaneseLearningInterStyle("400");

  // Web `.input-nemu` / `:focus` surfaces, cross-faded like its 250ms
  // `transition` on background, border and box-shadow.
  const inputSurfaces = getJapaneseLearningChatInputSurfaces(scheme);
  const listeningBorder = { borderColor: nemuColorWithAlpha(tokens.primary, 0.5) };
  const inputFocusProgress = useSharedValue(0);
  useEffect(() => {
    const target = inputFocused ? 1 : 0;
    inputFocusProgress.value =
      reduceMotion === true
        ? target
        : withTiming(target, {
            duration: JAPANESE_LEARNING_CHAT_INPUT_TRANSITION_MS,
            // CSS `ease`.
            easing: Easing.bezier(0.25, 0.1, 0.25, 1),
          });
  }, [inputFocusProgress, inputFocused, reduceMotion]);
  const restSurfaceStyle = useAnimatedStyle(() => ({ opacity: 1 - inputFocusProgress.value }));
  const focusSurfaceStyle = useAnimatedStyle(() => ({ opacity: inputFocusProgress.value }));

  const body = (
    <>
      {/* Web: a simple header with just the name. */}
      <View style={[styles.webHeader, { borderBottomColor: tokens.border }]}>
        <Text style={[styles.webTitle, { color: tokens.foreground }]}>{NEMU_CHAT_TITLE}</Text>
      </View>
      <ScrollView
        // Android: inside a native sheet, hand the drag to the sheet at the top.
        nestedScrollEnabled
        ref={scrollRef}
        style={styles.messagesScroll}
        contentContainerStyle={styles.messagesContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        onScroll={(event) => {
          const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
          atBottomRef.current = contentSize.height - contentOffset.y - layoutMeasurement.height < 48;
        }}
        scrollEventThrottle={32}
        // Web `use-stick-to-bottom` resize="smooth": growth while at the
        // bottom glides to the new end instead of jumping.
        onContentSizeChange={() => {
          if (atBottomRef.current) scrollRef.current?.scrollToEnd({ animated: true });
        }}
      >
        {hasContent ? (
          <JapaneseLearningDatePill
            text={strings.reader.pluginJapaneseLearningChatToday}
            tokens={tokens}
            scheme={scheme}
          />
        ) : null}

        {visibleMessages.length === 0 && !chatLoading && !showTypingIndicator ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <JapaneseLearningNemuAvatar size="md" />
            </View>
            <View style={styles.emptyCopy}>
              <Text style={[styles.emptyTitle, { color: tokens.foreground }]}>
                {strings.reader.pluginJapaneseLearningChatEmptyTitle}
              </Text>
              <Text
                style={[
                  styles.emptyDescription,
                  { color: tokens.mutedForeground },
                ]}
              >
                {strings.reader.pluginJapaneseLearningChatEmptyDescription}
              </Text>
            </View>
          </View>
        ) : null}

        {groups.map((group) => (
          <View key={group[0].id} style={styles.messageGroup}>
            {group.map((msg, i) => {
              const isUser = msg.role === "user";
              const chatTtsLoading =
                ttsState.status === "loading" &&
                ttsState.source === "chat" &&
                ttsState.messageId === msg.id;
              const chatTtsPlaying =
                ttsState.status === "playing" &&
                ttsState.source === "chat" &&
                ttsState.messageId === msg.id;
              const chatTtsDisabled =
                ttsState.status === "loading" && !chatTtsLoading;
              const chatTtsError =
                ttsState.status === "error" &&
                ttsState.source === "chat" &&
                ttsState.messageId === msg.id
                  ? ttsState.detail
                  : undefined;
              return (
                <JapaneseLearningMessageBubble
                  key={msg.id}
                  message={msg}
                  showAvatar={!isUser && i === 0}
                  showTimestamp={i === group.length - 1}
                  showTail={i === 0}
                  appLanguage={appLanguage}
                  strings={strings}
                  ttsCurrentTime={chatTtsPlaying ? ttsState.currentTime : undefined}
                  ttsDuration={chatTtsPlaying ? ttsState.duration : undefined}
                  ttsLoading={chatTtsLoading}
                  ttsPlaying={chatTtsPlaying}
                  ttsDisabled={chatTtsDisabled}
                  ttsErrorDetail={chatTtsError}
                  onVoiceAction={onToggleChatTts}
                  onVoiceSeek={chatTtsPlaying ? onSeekChatTts : undefined}
                />
              );
            })}
          </View>
        ))}

        {shouldShowTypingIndicator ? (
          <JapaneseLearningTypingIndicator showAvatar={showTypingAvatar} />
        ) : null}

        {suggestions.length > 0 ? (
          <JapaneseLearningFollowUpSuggestions
            suggestions={suggestions}
            onSelect={onSendSuggestion}
          />
        ) : null}
      </ScrollView>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        // The band (colour + top border) lives here so it also fills the
        // keyboard padding; the row's own padding sits on the inner view
        // because "padding" behaviour overwrites this view's paddingBottom.
        style={[
          styles.inputBand,
          {
            borderTopColor: tokens.border,
          },
        ]}
      >
        {/* The native sheet owns the safe area below the React host. Extend
            only the band's paint into it; keep the input's layout unchanged. */}
        {/* Web `backdrop-blur-xl` under the band's colour: the system
            material blur (iOS; Android's blur is experimental, keep colour). */}
        {Platform.OS === "ios" ? (
          <BlurView
            pointerEvents="none"
            intensity={JAPANESE_LEARNING_CHAT_INPUT_BAND_BLUR_INTENSITY}
            tint={scheme === "dark" ? "systemUltraThinMaterialDark" : "systemUltraThinMaterialLight"}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor:
                scheme === "dark"
                  ? "rgba(0,0,0,0.40)"
                  : nemuColorWithAlpha(tokens.background, 0.8),
            },
          ]}
        />
        <View
          style={[
            styles.inputBar,
            // The band runs to the sheet's bottom edge (the body extends into
            // the sheet's bottom safe area): the space under the input matches
            // its side inset, concentric with the sheet's bottom corners, plus
            // the home indicator's inset only where the sheet reaches it.
            { paddingBottom: INPUT_BAR_INSET_X + drawerFrame.bottomInset },
          ]}
        >
          {/* Web `.input-nemu`: the rest and focus surfaces cross-fade over
              250ms (bg, border, glow); the text field sits clear on top. */}
          <View
            style={[
              styles.inputShell,
              // Web: `!ring-2 !ring-primary/20` while listening.
              dictation.listening
                ? { outlineWidth: 2, outlineColor: nemuColorWithAlpha(tokens.primary, 0.2) }
                : null,
            ]}
          >
            <Animated.View
              pointerEvents="none"
              style={[
                styles.inputSurface,
                inputSurfaces.rest,
                dictation.listening ? listeningBorder : null,
                restSurfaceStyle,
              ]}
            />
            <Animated.View
              pointerEvents="none"
              style={[
                styles.inputSurface,
                inputSurfaces.focus,
                dictation.listening ? listeningBorder : null,
                focusSurfaceStyle,
              ]}
            />
            <TextInput
              ref={inputRef}
              accessibilityLabel={strings.reader.pluginJapaneseLearningChatInputPlaceholder}
              autoCapitalize="sentences"
              autoCorrect
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              onChangeText={onChangeInput}
              onSubmitEditing={handleSubmit}
              placeholder={strings.reader.pluginJapaneseLearningChatInputPlaceholder}
              placeholderTextColor={scheme === "dark" ? "rgba(255,255,255,0.35)" : "rgba(86,86,86,0.55)"}
              returnKeyType="send"
              selectionColor={tokens.primary}
              style={[styles.input, inputFont, { color: tokens.foreground }]}
              submitBehavior="submit"
              value={chatInput}
            />
          </View>
          {canSend ? (
            <NemuPressable
              accessibilityRole="button"
              accessibilityLabel={strings.reader.pluginJapaneseLearningChatSend}
              // The send path plays web's single `hapticPress`.
              hapticFeedback="none"
              minimumTouchTarget
              onPress={handleSubmit}
              pressedScale={0.9}
              style={styles.sendButton}
            >
              <SendGlyph color={tokens.primary} />
            </NemuPressable>
          ) : showMic ? (
            <JapaneseLearningChatMicButton
              accessibilityLabel={
                dictation.listening
                  ? strings.reader.pluginJapaneseLearningChatStopVoiceInput
                  : strings.reader.pluginJapaneseLearningChatVoiceInput
              }
              listening={dictation.listening}
              onPress={dictation.toggle}
            />
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </>
  );

  return (
    <JapaneseLearningSurfaceFrame
      visible={visible}
      onRequestClose={onClose}
      onDismiss={onDismiss}
      onPresentationProgress={onPresentationProgress}
      backdropOnPress={onClose}
      showDismissButton={false}
      frameMaxHeight={drawerFrame.frameMaxHeight}
      contentBottomInset={0}
      contentStyle={japaneseLearningEdgeToEdgeContentStyle(drawerFrame.contentBleed)}
    >
      {body}
      {stackedSurface}
    </JapaneseLearningSurfaceFrame>
  );
}

/**
 * lucide `Send` (lucide-react 0.562) at web's `size-6 strokeWidth={2.5}`:
 * the glyph web's composer uses (Feather's paper plane is a different,
 * thinner shape).
 */
function SendGlyph({ color, size = 24 }: { color: string; size?: number }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.112z" />
      <Path d="m21.854 2.147-10.94 10.939" />
    </Svg>
  );
}

/** The composer's side inset; also the space under the input (see `inputBar`). */
const INPUT_BAR_INSET_X = 12;

const styles = StyleSheet.create({
  webHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 1,
  },
  webTitle: { fontSize: 14, lineHeight: 20, fontWeight: nemuFontWeight.medium },
  messagesScroll: {
    flex: 1,
    minHeight: 0,
  },
  messagesContent: {
    paddingVertical: 12,
    gap: 8,
    flexGrow: 1,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingVertical: 32,
    gap: 12,
  },
  emptyIcon: {
    opacity: 1,
  },
  emptyCopy: {
    alignItems: "center",
    gap: 4,
  },
  emptyTitle: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: nemuFontWeight.medium,
    textAlign: "center",
  },
  emptyDescription: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  messageGroup: {
    gap: 6,
  },
  inputBand: {
    // Web `border-t border-border`: 1px.
    borderTopWidth: 1,
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: INPUT_BAR_INSET_X,
    paddingTop: 10,
  },
  // Web `.input-nemu rounded-full px-4 py-2.5 text-base`: 46pt tall.
  inputShell: {
    flex: 1,
    height: 46,
    borderRadius: radius.pill,
  },
  inputSurface: {
    ...StyleSheet.absoluteFill,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  input: {
    flex: 1,
    height: 46,
    // Inside the surface's 1pt border.
    paddingHorizontal: 17,
    paddingVertical: 11,
    fontSize: 16,
  },
  sendButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
});
