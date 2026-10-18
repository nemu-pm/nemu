import { useEffect, useLayoutEffect, useRef } from "react";
import { useIsFocused } from "expo-router";
import Animated, {
  Easing,
  measure,
  useAnimatedRef,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { MOBILE_MOTION } from "@/lib/mobileMotion";
import { isMobilePoseMotionWindowOpen } from "@/lib/mobilePoseLayoutAnimations";
import { subscribeMobileSystemTransition } from "@/lib/mobileTransitionTiming";

/** The columns show again after this long whatever the measurement says (ms). */
const MAX_HIDDEN_MS = 800;

/**
 * A window resize (the Duo folding like a laptop, a rotation) re-lays the
 * native views out at the new size a few frames before JS learns of it, so a
 * layout whose columns have fixed widths shows them squeezed into the new
 * window first, and only then the layout chosen for it. While the columns are
 * shown, this compares the container's native width with the width they were
 * laid out for on every frame (UI thread) and hides them the moment the two
 * differ; they fade back in once the layout for the new size has committed.
 * A resize also reports passing sizes (unfolding the Duo commits the columns
 * for a 907 pt window, then 951 pt): when the columns' width changes during a
 * pose change they start hidden and show only once laid out for the window
 * they are in, so no in-between layout is ever seen. And when the system
 * announces a size change (ahead of it, from the native transition report)
 * that these columns were not laid out for, they hide right away: the frame
 * check alone still let a frame or two of squeezed columns through.
 *
 * Attach `ref` to a view filling the container; put `style` on the columns.
 * `expectedWidth` is the container width the columns were laid out for, or
 * null when no columns are shown.
 */
export function useMobileStaleColumnsGuard(expectedWidth: number | null) {
  const ref = useAnimatedRef<Animated.View>();
  const expected = useSharedValue(expectedWidth ?? 0);
  const stale = useSharedValue(false);
  const opacity = useSharedValue(1);
  const focused = useIsFocused();
  const active = focused && expectedWidth !== null && expectedWidth > 0;
  const previousRef = useRef<number | null | undefined>(undefined);
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const expectedRef = useRef(expectedWidth);
  const hideRef = useRef<((holdMs: number) => void) | null>(null);
  useLayoutEffect(() => {
    // Hidden until the frame check sees the columns laid out for their window
    // (a fallback timer shows them whatever it sees).
    const hide = (holdMs: number) => {
      stale.set(true);
      opacity.set(0);
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
      revealTimerRef.current = setTimeout(() => {
        revealTimerRef.current = null;
        if (!stale.get()) return;
        stale.set(false);
        opacity.set(withTiming(1, { duration: MOBILE_MOTION.fadeInMs, easing: Easing.out(Easing.cubic) }));
      }, holdMs + MAX_HIDDEN_MS);
    };
    hideRef.current = hide;
    expectedRef.current = expectedWidth;
    const previous = previousRef.current;
    previousRef.current = expectedWidth;
    if (previous === undefined || previous === expectedWidth) return;
    if (expectedWidth === null || !isMobilePoseMotionWindowOpen()) return;
    hide(0);
  }, [expectedWidth, opacity, stale]);
  useEffect(
    () =>
      subscribeMobileSystemTransition((report) => {
        const width = expectedRef.current;
        if (width !== null && width > 0 && Math.abs(report.width - width) > 1) hideRef.current?.(report.durationMs);
      }),
    [],
  );
  useEffect(
    () => () => {
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    },
    [],
  );

  useLayoutEffect(() => {
    expected.set(expectedWidth ?? 0);
    if (expectedWidth === null && stale.get()) {
      // The resize ended in a layout without columns: it fades in like a settle.
      stale.set(false);
      opacity.set(withTiming(1, { duration: MOBILE_MOTION.fadeInMs, easing: Easing.out(Easing.cubic) }));
    }
  }, [expected, expectedWidth, opacity, stale]);

  const frame = useFrameCallback(() => {
    "worklet";
    if (expected.get() <= 0) return;
    const box = measure(ref);
    if (!box || !(box.width > 0)) return;
    const isStale = Math.abs(box.width - expected.get()) > 1;
    if (isStale && !stale.get()) {
      stale.set(true);
      opacity.set(0);
    } else if (!isStale && stale.get()) {
      stale.set(false);
      opacity.set(withTiming(1, { duration: MOBILE_MOTION.fadeInMs, easing: Easing.out(Easing.cubic) }));
    }
  }, false);

  useEffect(() => {
    frame.setActive(active);
  }, [active, frame]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return { ref, style };
}
