import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

const VOICE_BAR_HEIGHTS = [12, 18, 26, 16, 22, 14, 20, 28] as const;
const VOICE_BAR_LOOP_MS = 920;

function VoiceBar({
  progress,
  index,
  playing,
  height,
  color,
}: {
  progress: SharedValue<number>;
  index: number;
  playing: boolean;
  height: number;
  color: string;
}) {
  const barCount = VOICE_BAR_HEIGHTS.length;
  const animatedStyle = useAnimatedStyle(() => {
    if (!playing) return { transform: [{ scaleY: 1 }] };
    const phase = (progress.value + index / barCount) % 1;
    const scale = 0.5 + 0.5 * Math.abs(Math.sin(phase * Math.PI * 2));
    return { transform: [{ scaleY: scale }] };
  });
  return (
    <Animated.View
      style={[styles.bar, { height, backgroundColor: color }, animatedStyle]}
    />
  );
}

export function MobileJapaneseLearningVoiceBars({
  playing,
  color,
}: {
  playing: boolean;
  color: string;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (playing) {
      progress.value = 0;
      progress.value = withRepeat(
        withTiming(1, { duration: VOICE_BAR_LOOP_MS, easing: Easing.linear }),
        -1,
        false,
      );
    } else {
      cancelAnimation(progress);
      progress.value = 0;
    }
    return () => {
      cancelAnimation(progress);
    };
  }, [playing, progress]);

  return (
    <View
      style={styles.bars}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {VOICE_BAR_HEIGHTS.map((height, index) => (
        <VoiceBar
          key={`${height}-${index}`}
          progress={progress}
          index={index}
          playing={playing}
          height={height}
          color={color}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bars: {
    height: 28,
    minWidth: 82,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    overflow: "hidden",
  },
  bar: {
    width: 4,
    borderRadius: 999,
    opacity: 0.86,
  },
});
