import { useEffect } from "react";
import Svg, { Path, type PathProps } from "react-native-svg";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import {
  Copy01Icon,
  Loading03Icon,
  MessageMultiple02Icon,
  PauseIcon,
  PlayIcon,
} from "@hugeicons/core-free-icons";
import { useNemuTheme } from "@/design-system";

const icons = {
  copy: Copy01Icon,
  ask: MessageMultiple02Icon,
  loading: Loading03Icon,
  pause: PauseIcon,
  play: PlayIcon,
};

/** The same Hugeicons paths used by the web learning sheets. */
export function JapaneseLearningWebIcon({
  name,
  size = 14,
  color,
  strokeWidth,
}: {
  name: keyof typeof icons;
  size?: number;
  color: string;
  /** HugeiconsIcon `strokeWidth` override (web `Spinner` uses 2). */
  strokeWidth?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" color={color}>
      {icons[name].map(([, attributes], index) => {
        const path: Record<string, unknown> = { ...attributes };
        delete path.key;
        if (strokeWidth !== undefined && path.strokeWidth !== undefined) path.strokeWidth = strokeWidth;
        return <Path key={index} {...(path as PathProps)} />;
      })}
    </Svg>
  );
}

/**
 * Web `Spinner` (components/ui/spinner.tsx): Hugeicons `Loading03Icon`,
 * stroke 2, `animate-spin` (one turn per second, linear). Reduce Motion
 * keeps it still.
 */
export function JapaneseLearningWebSpinner({ size = 16, color }: { size?: number; color: string }) {
  const { reduceMotion } = useNemuTheme();
  const rotation = useSharedValue(0);
  const animate = reduceMotion !== true;
  useEffect(() => {
    if (!animate) return;
    rotation.value = 0;
    rotation.value = withRepeat(withTiming(360, { duration: 1000, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(rotation);
  }, [animate, rotation]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }));
  return (
    <Animated.View accessibilityRole="progressbar" style={[{ width: size, height: size }, style]}>
      <JapaneseLearningWebIcon name="loading" size={size} color={color} strokeWidth={2} />
    </Animated.View>
  );
}
