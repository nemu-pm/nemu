import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  MobileSheetScaffold,
  nemuColorWithAlpha,
  nemuFontWeight,
  NemuPressable,
  radius,
  useNemuTheme,
} from "@/design-system";
import type { AppLanguage } from "@/data/schema";
import type { JapaneseLearningChatThreadMessage } from "@/lib/mobileJapaneseLearningReaderHelpers";
import {
  canRunMobileJapaneseLearningChatAction,
  canSendMobileJapaneseLearningChatInput,
} from "@/lib/mobileJapaneseLearningChat";
import type { MobileStrings } from "@/lib/mobileI18n";
import { getJapaneseLearningAssistantBubbleColors } from "@/lib/mobileJapaneseLearningChatTheme";
import { JapaneseLearningFollowUpSuggestions } from "./JapaneseLearningFollowUpSuggestions";
import {
  JapaneseLearningDatePill,
  JapaneseLearningMessageBubble,
} from "./JapaneseLearningMessageBubble";
import { JapaneseLearningNemuAvatar } from "./JapaneseLearningNemuAvatar";
import { JapaneseLearningTypingIndicator } from "./JapaneseLearningTypingIndicator";

export interface JapaneseLearningChatTtsState {
  status: "idle" | "loading" | "playing" | "error";
  source?: "sentence" | "transcript" | "chat";
  messageId?: string;
  detail?: string;
}

interface NemuChatDrawerProps {
  visible: boolean;
  appLanguage: AppLanguage;
  strings: MobileStrings;
  chatMessages: JapaneseLearningChatThreadMessage[];
  chatInput: string;
  chatLoading: boolean;
  chatStreamingMessageId?: string;
  showTypingIndicator: boolean;
  ttsState: JapaneseLearningChatTtsState;
  onClose: () => void;
  onChangeInput: (text: string) => void;
  onSendInput: () => void;
  onSendSuggestion: (suggestion: string) => void;
  onToggleChatTts: (message: JapaneseLearningChatThreadMessage) => void;
}

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
  chatStreamingMessageId,
  showTypingIndicator,
  ttsState,
  onClose,
  onChangeInput,
  onSendInput,
  onSendSuggestion,
  onToggleChatTts,
}: NemuChatDrawerProps) {
  const { tokens, scheme } = useNemuTheme();
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);

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

  const suggestions = chatLoading
    ? []
    : visibleMessages
        .slice()
        .reverse()
        .find((m) => m.role === "assistant" && m.suggestions?.length)?.suggestions ?? [];

  const canRunChat = canRunMobileJapaneseLearningChatAction(chatLoading, false);
  const canSend = canSendMobileJapaneseLearningChatInput(chatInput, canRunChat);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 60);
    return () => clearTimeout(timer);
  }, [visibleMessages.length, chatLoading, visible, suggestions.length]);

  const handleSubmit = useCallback(() => {
    if (!canSend) return;
    onSendInput();
  }, [canSend, onSendInput]);

  const assistantColors = getJapaneseLearningAssistantBubbleColors(scheme, false);

  return (
    <MobileSheetScaffold
      visible={visible}
      onRequestClose={onClose}
      backdropOnPress={onClose}
      title="Nemu"
      frameMaxHeight="70%"
      contentStyle={{ padding: 0, gap: 0 }}
    >
      <ScrollView
        ref={scrollRef}
        style={styles.messagesScroll}
        contentContainerStyle={styles.messagesContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
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
                  ttsLoading={chatTtsLoading}
                  ttsPlaying={chatTtsPlaying}
                  ttsDisabled={chatTtsDisabled}
                  ttsErrorDetail={chatTtsError}
                  onVoiceAction={onToggleChatTts}
                />
              );
            })}
          </View>
        ))}

        {chatLoading && showTypingIndicator ? (
          <JapaneseLearningTypingIndicator showAvatar={showTypingAvatar} />
        ) : null}

        {chatLoading && !chatStreamingMessageId && !showTypingIndicator ? (
          <View
            style={[
              styles.thinkingBubble,
              { backgroundColor: assistantColors.backgroundColor },
            ]}
          >
            <ActivityIndicator size="small" color={tokens.mutedForeground} />
            <Text
              style={[
                styles.thinkingText,
                { color: assistantColors.textColor, opacity: 0.8 },
              ]}
            >
              {strings.reader.pluginJapaneseLearningChatThinking}
            </Text>
          </View>
        ) : null}

        {suggestions.length > 0 && !chatLoading ? (
          <JapaneseLearningFollowUpSuggestions
            suggestions={suggestions}
            disabled={!canRunChat}
            onSelect={onSendSuggestion}
          />
        ) : null}
      </ScrollView>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={[
          styles.inputBar,
          {
            backgroundColor:
              scheme === "dark"
                ? "rgba(0,0,0,0.40)"
                : nemuColorWithAlpha(tokens.background, 0.8),
            borderTopColor: tokens.border,
          },
        ]}
      >
        <TextInput
          ref={inputRef}
          accessibilityLabel={strings.reader.pluginJapaneseLearningChatInputPlaceholder}
          accessibilityState={{ disabled: !canRunChat }}
          editable={canRunChat}
          autoCapitalize="sentences"
          autoCorrect
          multiline
          onChangeText={onChangeInput}
          onSubmitEditing={handleSubmit}
          placeholder={strings.reader.pluginJapaneseLearningChatInputPlaceholder}
          placeholderTextColor={tokens.mutedForeground}
          returnKeyType="send"
          style={[
            styles.input,
            {
              color: tokens.foreground,
              backgroundColor:
                scheme === "dark" ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.85)",
              borderColor: tokens.border,
            },
          ]}
          submitBehavior="submit"
          value={chatInput}
        />
        {canSend ? (
          <NemuPressable
            accessibilityRole="button"
            accessibilityLabel={strings.reader.pluginJapaneseLearningChatSend}
            minimumTouchTarget
            onPress={handleSubmit}
            pressedScale={0.9}
            style={styles.sendButton}
          >
            <Ionicons name="send" size={24} color={tokens.primary} />
          </NemuPressable>
        ) : null}
      </KeyboardAvoidingView>
    </MobileSheetScaffold>
  );
}

const styles = StyleSheet.create({
  messagesScroll: {
    flex: 1,
    minHeight: 0,
  },
  messagesContent: {
    paddingVertical: 12,
    gap: 6,
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
    opacity: 0.72,
  },
  emptyCopy: {
    alignItems: "center",
    gap: 4,
  },
  emptyTitle: {
    fontSize: 14,
    lineHeight: 18,
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
  thinkingBubble: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginHorizontal: 12,
    marginTop: 6,
    marginLeft: 52,
  },
  thinkingText: {
    fontSize: 14,
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  sendButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
});
