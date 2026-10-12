import { useEffect } from "react";
import { StyleSheet } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { Path, Rect } from "react-native-svg";
import { NemuPressable, useNemuTheme } from "@/design-system";

/** Tailwind `text-red-500`, web's listening colour. */
const LISTENING_COLOR = "#ef4444";
/** Tailwind `animate-pulse`: opacity 1 → 0.5 → 1 over 2s, cubic-bezier(0.4, 0, 0.6, 1). */
const PULSE_HALF_MS = 1000;

/** lucide `Mic` (lucide-react 0.562), the glyph web's chat composer uses. */
function MicGlyph({ color, size = 24 }: { color: string; size?: number }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="M12 19v3" />
      <Path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <Rect x={9} y={2} width={6} height={13} rx={3} />
    </Svg>
  );
}

/**
 * Mobile mirror of web `LineInputBar`'s mic action (chat/ui/drawer.tsx):
 * a 36pt borderless button in the send slot, muted when idle, red and
 * pulsing while listening.
 */
export function JapaneseLearningChatMicButton({
  listening,
  accessibilityLabel,
  onPress,
}: {
  listening: boolean;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  const { reduceMotion, tokens } = useNemuTheme();
  const opacity = useSharedValue(1);
  const pulse = listening && reduceMotion !== true;

  useEffect(() => {
    if (!pulse) {
      cancelAnimation(opacity);
      opacity.value = 1;
      return;
    }
    opacity.value = 1;
    opacity.value = withRepeat(
      withTiming(0.5, {
        duration: PULSE_HALF_MS,
        easing: Easing.bezier(0.4, 0, 0.6, 1),
      }),
      -1,
      true,
    );
    return () => cancelAnimation(opacity);
  }, [opacity, pulse]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <NemuPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: listening }}
      // Web's mic is a plain motion button: no haptic.
      hapticFeedback="none"
      minimumTouchTarget
      onPress={onPress}
      pressedScale={0.9}
      style={styles.button}
    >
      <Animated.View style={animatedStyle}>
        <MicGlyph color={listening ? LISTENING_COLOR : tokens.mutedForeground} />
      </Animated.View>
    </NemuPressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
});
