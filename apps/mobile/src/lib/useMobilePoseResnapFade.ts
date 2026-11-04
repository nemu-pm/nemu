import { useLayoutEffect, useRef } from "react";
import {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { MOBILE_MOTION } from "@/lib/mobileMotion";
import { isMobilePoseMotionWindowOpen } from "@/lib/mobilePoseLayoutAnimations";

/**
 * For content that must re-snap rather than glide when its geometry changes
 * (a paging carousel whose page stride changes when the device folds: the
 * scroll offset is corrected in one step). When `snapKey` changes after
 * mount, the content dips to a soft opacity and fades back, so the re-snap
 * reads as a settle instead of a jump. UI thread only; Reduce Motion uses the
 * 150 ms fade.
 */
export function useMobilePoseResnapFade(
  snapKey: string | number,
  options: {
    /**
     * Only settle when the key changes during a pose change (fold, unfold,
     * resize); any other change — the first trusted measurement of a pushed
     * screen, a data change — applies without a dip.
     */
    poseChangesOnly?: boolean;
    /**
     * Content that mounts as part of the change (rows of a newly shown list)
     * starts dipped on its first frame and settles with the content that
     * stayed. Read on mount only.
     */
    settleOnMount?: boolean;
  } = {},
) {
  const reduceMotion = useReducedMotion();
  const { poseChangesOnly = false, settleOnMount = false } = options;
  const opacity = useSharedValue(settleOnMount ? MOBILE_MOTION.resnapDipOpacity : 1);
  const seenRef = useRef<string | number | null>(settleOnMount ? null : snapKey);
  useLayoutEffect(() => {
    if (seenRef.current === snapKey) return;
    const mounting = seenRef.current === null;
    seenRef.current = snapKey;
    if (!mounting && poseChangesOnly && !isMobilePoseMotionWindowOpen()) return;
    cancelAnimation(opacity);
    opacity.value = MOBILE_MOTION.resnapDipOpacity;
    opacity.value = withTiming(1, {
      duration: reduceMotion ? MOBILE_MOTION.reduceMotionFadeMs : MOBILE_MOTION.fadeInMs,
      easing: Easing.out(Easing.cubic),
    });
  }, [opacity, poseChangesOnly, reduceMotion, snapKey]);
  return useAnimatedStyle(() => ({ opacity: opacity.value }));
}
