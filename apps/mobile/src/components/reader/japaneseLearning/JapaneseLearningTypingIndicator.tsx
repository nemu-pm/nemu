import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useNemuTheme } from "@/design-system";
import { getJapaneseLearningAssistantBubbleColors } from "@/lib/mobileJapaneseLearningChatTheme";
import { JapaneseLearningNemuAvatar } from "./JapaneseLearningNemuAvatar";

const DOT_COUNT = 3;
const DOT_BOUNCE_MS = 600;

function TypingDot({ index, color }: { index: number; color: string }) {
  const offset = useSharedValue(0);
  useEffect(() => {
    offset.value = 0;
    offset.value = withRepeat(
      withTiming(1, {
        duration: DOT_BOUNCE_MS,
        easing: Easing.inOut(Easing.sin),
      }),
      -1,
      false,
    );
    return () => cancelAnimation(offset);
  }, [offset]);

  const animatedStyle = useAnimatedStyle(() => {
    const phase = (offset.value + index / DOT_COUNT) % 1;
    const translateY = -5 * Math.sin(phase * Math.PI * 2);
    return { transform: [{ translateY }] };
  });

  return (
    <Animated.View
      style={[styles.dot, { backgroundColor: color }, animatedStyle]}
    />
  );
}

/** Mobile mirror of web `TypingIndicator` (typing-indicator.tsx). */
export function JapaneseLearningTypingIndicator({
  showAvatar = true,
}: {
  showAvatar?: boolean;
}) {
  const { scheme } = useNemuTheme();
  const assistantColors = getJapaneseLearningAssistantBubbleColors(scheme, false);
  const dotColor = scheme === "dark" ? "#999999" : "rgba(94, 99, 111, 0.5)";

  return (
    <View style={styles.container}>
      <View style={styles.avatarSlot}>
        {showAvatar ? <JapaneseLearningNemuAvatar size="sm" /> : null}
      </View>
      <View
        style={[
          styles.bubble,
          {
            backgroundColor: assistantColors.backgroundColor,
            marginTop: showAvatar ? 4 : 0,
          },
        ]}
      >
        <View style={styles.dotsRow}>
          {Array.from({ length: DOT_COUNT }).map((_, i) => (
            <TypingDot key={i} index={i} color={dotColor} />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingHorizontal: 12,
  },
  avatarSlot: {
    width: 40,
    flexShrink: 0,
  },
  bubble: {
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  dotsRow: {
    flexDirection: "row",
    gap: 4,
    alignItems: "center",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
