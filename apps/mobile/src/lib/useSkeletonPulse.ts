import { useEffect, useState } from "react";
import {
  cancelAnimation,
  Easing,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

/**
 * Shared skeleton breathing animation: opacity 1 → 0.55 → 1 over 1.2s.
 * Under Reduce Motion the value settles at the static skeleton opacity.
 */
export function useSkeletonPulse(reduceMotion: boolean) {
  const opacity = useSharedValue(reduceMotion ? 0.78 : 1);

  useEffect(() => {
    if (reduceMotion) {
      cancelAnimation(opacity);
      opacity.value = withTiming(0.78, { duration: 120 });
      return;
    }
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.55, { duration: 600, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 600, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
    return () => {
      cancelAnimation(opacity);
    };
  }, [opacity, reduceMotion]);

  return opacity;
}

/**
 * Delays a skeleton's appearance so fast loads never flash a placeholder.
 * The classic 150ms threshold: loads that finish quicker skip the skeleton
 * entirely, loads that take longer never notice the delay.
 */
export function useSkeletonDisplayDelay(delayMs = 150): boolean {
  const [visible, setVisible] = useState(delayMs <= 0);

  useEffect(() => {
    if (visible) return;
    const timer = setTimeout(() => setVisible(true), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs, visible]);

  return visible;
}
