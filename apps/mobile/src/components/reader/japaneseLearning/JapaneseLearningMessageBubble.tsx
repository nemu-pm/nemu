import { useCallback } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  nemuFontWeight,
  NemuPressable,
  useNemuTheme,
} from "@/design-system";
import { hapticPress } from "@/lib/haptics";
import { formatMobileJapaneseLearningChatTime } from "@/lib/mobileJapaneseLearningReaderHelpers";
import {
  getJapaneseLearningAssistantBubbleColors,
  LINE_ERROR_BUBBLE_COLOR,
  LINE_USER_BUBBLE_COLOR,
  LINE_USER_BUBBLE_TEXT,
  LINE_WAVE_COLOR,
} from "@/lib/mobileJapaneseLearningChatTheme";
import type { AppLanguage } from "@/data/schema";
import type { JapaneseLearningChatThreadMessage } from "@/lib/mobileJapaneseLearningReaderHelpers";
import type { MobileStrings } from "@/lib/mobileI18n";
import { JapaneseLearningNemuAvatar } from "./JapaneseLearningNemuAvatar";
import { MobileJapaneseLearningVoiceBars } from "@/components/MobileJapaneseLearningVoiceBars";

const TAIL_PATH =
  "M 0 7 L 0 7 L 1 7 L 2 8 L 3 8 L 4 9 L 5 9 L 6 10 L 7 10 L 8 11 L 9 11 L 10 12 L 11 12 L 12 13 L 13 14 L 14 14 L 15 15 L 16 16 L 17 16 L 18 17 L 19 18 L 20 18 L 21 19 L 22 20 L 23 20 L 24 21 L 25 21 L 26 21 L 27 21 L 28 21 L 29 21 L 30 21 L 31 21 L 32 21 L 33 20 L 34 20 L 35 20 L 36 20 L 37 20 L 38 20 L 39 19 L 40 19 L 41 19 L 42 19 L 43 19 L 44 18 L 45 18 L 46 18 L 47 18 L 48 17 L 49 17 L 50 16 L 51 16 L 52 16 L 53 16 L 54 15 L 55 14 L 56 14 L 57 14 L 58 13 L 59 13 L 60 12 L 61 12 L 62 11 L 63 11 L 64 10 L 65 9 L 66 9 L 67 8 L 68 7 L 69 7 L 70 7 L 71 7 L 72 7 L 72 8 L 72 9 L 71 10 L 71 11 L 71 12 L 71 13 L 70 14 L 70 15 L 70 16 L 70 17 L 69 18 L 69 19 L 68 20 L 68 21 L 68 22 L 67 23 L 67 24 L 66 25 L 66 26 L 66 27 L 65 28 L 65 29 L 64 30 L 64 31 L 63 32 L 63 33 L 62 34 L 61 35 L 61 36 L 60 37 L 60 38 L 59 39 L 58 40 L 58 41 L 57 42 L 56 43 L 55 44 L 54 45 L 54 46 L 53 47 L 52 48 L 51 49 L 50 50 L 50 51 L 49 52 L 49 53 L 50 54 L 71 10 L 70 14 L 69 18 L 68 20 L 67 23 L 66 25 L 65 28 L 64 30 L 63 32 L 62 34 L 61 35 L 60 37 L 59 39 L 58 40 L 57 42 L 56 43 L 55 44 L 54 45 L 53 47 L 52 48 L 51 49 L 50 50 L 49 55 L 48 55 L 47 55 L 46 55 L 45 55 L 44 55 L 43 55 L 42 55 L 41 55 L 40 55 L 39 55 L 38 55 L 37 55 L 36 55 L 35 55 L 34 55 L 33 55 L 32 55 L 31 55 L 30 55 L 29 55 L 28 55 L 27 55 L 26 55 L 25 55 L 24 55 L 23 55 L 22 55 L 21 55 L 20 55 L 19 55 L 18 55 L 17 55 L 16 55 L 15 55 L 14 55 L 13 55 L 12 55 L 11 55 L 10 55 L 9 55 L 8 55 L 7 55 L 6 55 L 5 55 L 4 55 L 3 55 L 2 55 L 1 55 L 0 55 L 0 54 L 0 53 L 0 52 L 0 51 L 0 50 L 0 49 L 0 48 L 0 47 L 0 46 L 0 45 L 0 44 L 0 43 L 0 42 L 0 41 L 0 40 L 0 39 L 0 38 L 0 37 L 0 36 L 0 35 L 0 34 L 0 33 L 0 32 L 0 31 L 0 30 L 0 29 L 0 28 L 0 27 L 0 26 L 0 25 L 0 24 L 0 23 L 0 22 L 0 21 L 0 20 L 0 19 L 0 18 L 0 17 L 0 16 L 0 15 L 0 14 L 0 13 L 0 12 L 0 11 L 0 10 L 0 9 L 0 8 L 0 7 Z";

function TailRight({ color }: { color: string }) {
  return (
    <Svg width={20} height={14} viewBox="0 0 80 55" pointerEvents="none">
      <Path d={TAIL_PATH} fill={color} />
    </Svg>
  );
}

function TailLeft({ color }: { color: string }) {
  return (
    <Svg
      width={20}
      height={14}
      viewBox="0 0 80 55"
      pointerEvents="none"
      style={{ transform: [{ scaleX: -1 }] }}
    >
      <Path d={TAIL_PATH} fill={color} />
    </Svg>
  );
}

function VoicePlayer({
  loading,
  playing,
  disabled,
  strings,
  onToggle,
}: {
  loading: boolean;
  playing: boolean;
  disabled: boolean;
  strings: MobileStrings;
  onToggle: () => void;
}) {
  return (
    <NemuPressable
      accessibilityRole="button"
      accessibilityLabel={
        loading || playing
          ? strings.reader.pluginJapaneseLearningStopListening
          : strings.reader.pluginJapaneseLearningListen
      }
      accessibilityState={{ disabled }}
      disabled={disabled}
      minimumTouchTarget
      onPress={onToggle}
      pressedScale={0.96}
      style={[styles.voicePlayer, { opacity: disabled ? 0.64 : 1 }]}
    >
      <View style={styles.voicePlayButton}>
        {loading ? (
          <ActivityIndicator size="small" color={LINE_USER_BUBBLE_TEXT} />
        ) : (
          <Ionicons
            name={playing ? "pause" : "play"}
            size={16}
            color={LINE_USER_BUBBLE_TEXT}
          />
        )}
      </View>
      <MobileJapaneseLearningVoiceBars
        playing={playing}
        color={LINE_WAVE_COLOR}
      />
    </NemuPressable>
  );
}

interface MessageBubbleProps {
  message: JapaneseLearningChatThreadMessage;
  showAvatar: boolean;
  showTimestamp: boolean;
  showTail: boolean;
  appLanguage: AppLanguage;
  strings: MobileStrings;
  ttsLoading: boolean;
  ttsPlaying: boolean;
  ttsDisabled: boolean;
  ttsErrorDetail?: string;
  onVoiceAction: (message: JapaneseLearningChatThreadMessage) => void;
}

/** Mobile mirror of web `MessageBubble` (message-bubble.tsx). */
export function JapaneseLearningMessageBubble({
  message,
  showAvatar,
  showTimestamp,
  showTail,
  appLanguage,
  strings,
  ttsLoading,
  ttsPlaying,
  ttsDisabled,
  ttsErrorDetail,
  onVoiceAction,
}: MessageBubbleProps) {
  const { tokens, scheme } = useNemuTheme();
  const isUser = message.role === "user";
  const text = message.text;
  const timeText = formatMobileJapaneseLearningChatTime(
    message.createdAt,
    appLanguage,
  );
  const isVoiceMessage = !isUser && message.kind === "voice" && !message.isError;
  const assistantColors = getJapaneseLearningAssistantBubbleColors(
    scheme,
    Boolean(message.isError),
  );

  const handleToggle = useCallback(() => {
    void hapticPress();
    onVoiceAction(message);
  }, [message, onVoiceAction]);

  if (isUser) {
    const bubbleColor = message.isError
      ? LINE_ERROR_BUBBLE_COLOR
      : LINE_USER_BUBBLE_COLOR;
    const textColor = message.isError ? "#ffffff" : LINE_USER_BUBBLE_TEXT;
    return (
      <View style={styles.userRow}>
        {showTimestamp ? (
          <View style={styles.userMeta}>
            {message.isRead ? (
              <Text
                style={[styles.metaText, { color: tokens.mutedForeground }]}
              >
                {strings.reader.pluginJapaneseLearningChatRead}
              </Text>
            ) : null}
            <Text style={[styles.metaText, { color: tokens.mutedForeground }]}>
              {timeText}
            </Text>
          </View>
        ) : null}
        <View style={[styles.bubble, { backgroundColor: bubbleColor }]}>
          {showTail ? (
            <View style={styles.tailRightSlot}>
              <TailRight color={bubbleColor} />
            </View>
          ) : null}
          <Text style={[styles.bubbleText, { color: textColor }]}>{text}</Text>
          {message.isError ? (
            <Text style={styles.userErrorInline}>⚠️</Text>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.assistantRow}>
      <View style={styles.avatarSlot}>
        {showAvatar ? <JapaneseLearningNemuAvatar size="sm" /> : null}
      </View>
      <View
        style={[
          styles.bubble,
          {
            backgroundColor: assistantColors.backgroundColor,
            borderColor: assistantColors.borderColor,
            borderWidth: assistantColors.borderColor
              ? StyleSheet.hairlineWidth
              : 0,
            marginTop: showTail ? 4 : 0,
          },
        ]}
      >
        {showTail ? (
          <View style={styles.tailLeftSlot}>
            <TailLeft color={assistantColors.tailColor} />
          </View>
        ) : null}
        {isVoiceMessage ? (
          <View style={styles.voiceContent}>
            <VoicePlayer
              loading={ttsLoading}
              playing={ttsPlaying}
              disabled={ttsDisabled}
              strings={strings}
              onToggle={handleToggle}
            />
            <Text
              style={[
                styles.voiceTranscript,
                { color: assistantColors.textColor, opacity: 0.7 },
              ]}
            >
              {text}
            </Text>
          </View>
        ) : (
          <Text
            style={[styles.bubbleText, { color: assistantColors.textColor }]}
          >
            {text}
          </Text>
        )}
        {ttsErrorDetail ? (
          <Text
            accessibilityLiveRegion="assertive"
            accessibilityRole="alert"
            style={[styles.ttsErrorText, { color: tokens.danger }]}
          >
            {ttsErrorDetail}
          </Text>
        ) : null}
      </View>
      {showTimestamp ? (
        <Text
          style={[
            styles.metaText,
            styles.assistantTime,
            { color: tokens.mutedForeground },
          ]}
        >
          {timeText}
        </Text>
      ) : null}
    </View>
  );
}

export function JapaneseLearningDatePill({
  text,
  tokens,
  scheme,
}: {
  text: string;
  tokens: ReturnType<typeof useNemuTheme>["tokens"];
  scheme: ReturnType<typeof useNemuTheme>["scheme"];
}) {
  return (
    <View style={styles.datePillContainer}>
      <View
        style={[
          styles.datePill,
          {
            backgroundColor:
              scheme === "dark" ? "rgba(255,255,255,0.10)" : tokens.muted,
          },
        ]}
      >
        <Text style={[styles.datePillText, { color: tokens.mutedForeground }]}>
          {text}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  userRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "flex-end",
    gap: 6,
    paddingHorizontal: 12,
  },
  assistantRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingHorizontal: 12,
  },
  avatarSlot: {
    width: 40,
    flexShrink: 0,
  },
  userMeta: {
    alignItems: "flex-end",
    paddingBottom: 2,
    gap: 1,
  },
  metaText: {
    fontSize: 11,
    lineHeight: 14,
  },
  bubble: {
    maxWidth: "70%",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
    position: "relative",
    overflow: "visible",
  },
  tailRightSlot: {
    position: "absolute",
    top: 0,
    right: -5,
    width: 20,
    height: 14,
  },
  tailLeftSlot: {
    position: "absolute",
    top: 0,
    left: -5,
    width: 20,
    height: 14,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 21,
  },
  userErrorInline: {
    fontSize: 12,
    marginTop: 4,
    color: "rgba(255,255,255,0.85)",
  },
  voiceContent: {
    gap: 8,
    width: 240,
  },
  voicePlayer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  voicePlayButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: LINE_USER_BUBBLE_COLOR,
  },
  voiceTranscript: {
    fontSize: 12,
    lineHeight: 17,
  },
  ttsErrorText: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: nemuFontWeight.medium,
    marginTop: 6,
  },
  assistantTime: {
    alignSelf: "flex-end",
    paddingBottom: 2,
  },
  datePillContainer: {
    alignItems: "center",
    paddingVertical: 8,
  },
  datePill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  datePillText: {
    fontSize: 12,
    fontWeight: nemuFontWeight.medium,
  },
});
