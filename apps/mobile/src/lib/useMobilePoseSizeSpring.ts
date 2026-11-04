import { useLayoutEffect, useRef } from "react";
import {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { MOBILE_MOTION, shouldMobilePoseSizeSpring } from "@/lib/mobileMotion";
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
    if (!shouldMobilePoseSizeSpring(from, size, isMobilePoseMotionWindowOpen(), isMobilePoseReduceMotion())) return;
    cancelAnimation(scale);
    scale.value = from / size;
    scale.value = withSpring(1, { ...MOBILE_MOTION.settleSpring });
  }, [scale, size]);
  return useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
}

/**
 * A real width spring for content whose height does not follow its width
 * (rows of text with a trailing chevron): where a scale from the old size
 * (`useMobilePoseSizeSpring`) would stretch the text and shift everything
 * below in proportion, this lays the content out at each in-between width,
 * so the row's trailing edge and its chevron slide with it. Through a pose
 * change the width starts where it was (the old width, or the in-flight value
 * when a pose change retargets it) and springs to the new one on the shared
 * settle spring, as the frame transitions do; otherwise it is set at once.
 */
export function useMobilePoseWidthSpring(width: number) {
  const animated = useSharedValue(width);
  const previousRef = useRef(width);
  useLayoutEffect(() => {
    const from = previousRef.current;
    previousRef.current = width;
    if (from === width) return;
    if (!shouldMobilePoseSizeSpring(from, width, isMobilePoseMotionWindowOpen(), isMobilePoseReduceMotion())) {
      cancelAnimation(animated);
      animated.value = width;
      return;
    }
    // No reset: the spring continues from what is on screen.
    animated.value = withSpring(width, { ...MOBILE_MOTION.settleSpring });
  }, [animated, width]);
  return useAnimatedStyle(() => ({ width: animated.value }));
}
