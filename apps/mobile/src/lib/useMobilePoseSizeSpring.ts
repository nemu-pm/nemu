import { useLayoutEffect, useRef } from "react";
import {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { MOBILE_MOTION } from "@/lib/mobileMotion";
import {
  isMobilePoseMotionWindowOpen,
  isMobilePoseReduceMotion,
} from "@/lib/mobilePoseLayoutAnimations";

/**
 * FLIP-style size spring for artwork whose rendered size is a prop (it
 * re-renders at the new size in one step): when `size` changes during a pose
 * change, the art starts scaled to its old size and springs to 1 with the
 * shared settle spring. Any other size change (first measurement, data)
 * applies at once, as does everything under Reduce Motion.
 */
export function useMobilePoseSizeSpring(size: number) {
  const scale = useSharedValue(1);
  const previousRef = useRef(size);
  useLayoutEffect(() => {
    const from = previousRef.current;
    previousRef.current = size;
    if (!(from > 0) || !(size > 0) || Math.abs(from - size) < 0.5) return;
    if (!isMobilePoseMotionWindowOpen() || isMobilePoseReduceMotion()) return;
    cancelAnimation(scale);
    scale.value = from / size;
    scale.value = withSpring(1, { ...MOBILE_MOTION.settleSpring });
  }, [scale, size]);
  return useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
}
