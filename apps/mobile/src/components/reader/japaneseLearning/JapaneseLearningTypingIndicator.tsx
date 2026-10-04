import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useNemuTheme } from "@/design-system";
import { getJapaneseLearningAssistantBubbleColors } from "@/lib/mobileJapaneseLearningChatTheme";
import { JapaneseLearningNemuAvatar } from "./JapaneseLearningNemuAvatar";

const DOT_COUNT = 3;
/**
 * Web dot: `animate={{ y: [0, -5, 0] }}`, `duration: 0.6`, `repeat: Infinity`,
 * `delay: i * 0.15`, `ease: 'easeInOut'` — two 300ms keyframe segments, each
 * eased with motion's easeInOut (cubic-bezier(0.42, 0, 0.58, 1)); the delay
 * staggers the first cycle only.
 */
const DOT_BOUNCE_MS = 600;
const DOT_RISE_PX = -5;
const DOT_STAGGER_MS = 150;
const DOT_EASING = Easing.bezier(0.42, 0, 0.58, 1);

function TypingDot({
  index,
  color,
  animate,
}: {
  index: number;
  color: string;
  animate: boolean;
}) {
  const offset = useSharedValue(0);
  useEffect(() => {
    // An unbounded `withRepeat` ignores the system Reduce Motion setting, and
    // this indicator can stay mounted for a whole assistant turn.
    if (!animate) {
      cancelAnimation(offset);
      offset.value = 0;
      return;
    }
    offset.value = 0;
    const segment = { duration: DOT_BOUNCE_MS / 2, easing: DOT_EASING };
    offset.value = withDelay(
      index * DOT_STAGGER_MS,
      withRepeat(
        withSequence(
          withTiming(DOT_RISE_PX, segment),
          withTiming(0, segment),
        ),
        -1,
        false,
      ),
    );
    return () => cancelAnimation(offset);
  }, [animate, index, offset]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: animate ? offset.value : 0 }],
  }));

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
  const { reduceMotion, scheme } = useNemuTheme();
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
            <TypingDot
              key={i}
              index={i}
              color={dotColor}
              animate={reduceMotion !== true}
            />
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
