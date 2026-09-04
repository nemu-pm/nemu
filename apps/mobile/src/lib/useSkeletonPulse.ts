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
 * The one skeleton breathing curve. Every skeleton surface in the app shares
 * these numbers so placeholders across screens pulse in the same rhythm.
 */
const SKELETON_PULSE = {
  /** Opacity at the bottom of the breath. */
  minOpacity: 0.55,
  /** Opacity at the top of the breath. */
  maxOpacity: 1,
  /** Half-cycle duration; a full breath is twice this. */
  halfCycleMs: 600,
  /** Static opacity used when Reduce Motion is on. */
  reduceMotionOpacity: 0.78,
  /** Cross-fade to the static opacity when Reduce Motion turns on. */
  reduceMotionSettleMs: 120,
} as const;

/**
 * The classic 150ms threshold used by every skeleton: loads faster than this
 * never flash a placeholder.
 */
export const SKELETON_DISPLAY_DELAY_MS = 150;

/** Tonal placeholder block (icon frames, cover plates). */
export const SKELETON_SURFACE_OPACITY = 0.86;
/** Primary copy line (titles, section headings). */
export const SKELETON_LINE_OPACITY = 0.78;
/** Secondary copy line, one step quieter than the title above it. */
export const SKELETON_SUBTLE_LINE_OPACITY = 0.72;

/**
 * Shared skeleton breathing animation: opacity 1 → 0.55 → 1 over 1.2s.
 * Under Reduce Motion the value settles at the static skeleton opacity.
 *
 * `active` lets a host that outlives its placeholder (the reader stage, the
 * storage card) stop the infinite repeat once the real content is on screen;
 * an always-placeholder skeleton screen leaves it at the default.
 */
export function useSkeletonPulse(reduceMotion: boolean, active = true) {
  const opacity = useSharedValue<number>(
    reduceMotion ? SKELETON_PULSE.reduceMotionOpacity : SKELETON_PULSE.maxOpacity,
  );

  useEffect(() => {
    if (!active) {
      cancelAnimation(opacity);
      opacity.value = SKELETON_PULSE.maxOpacity;
      return;
    }
    if (reduceMotion) {
      cancelAnimation(opacity);
      opacity.value = withTiming(SKELETON_PULSE.reduceMotionOpacity, {
        duration: SKELETON_PULSE.reduceMotionSettleMs,
      });
      return;
    }
    opacity.value = withRepeat(
      withSequence(
        withTiming(SKELETON_PULSE.minOpacity, {
          duration: SKELETON_PULSE.halfCycleMs,
          easing: Easing.inOut(Easing.quad),
        }),
        withTiming(SKELETON_PULSE.maxOpacity, {
          duration: SKELETON_PULSE.halfCycleMs,
          easing: Easing.inOut(Easing.quad),
        }),
      ),
      -1,
      false,
    );
    return () => {
      cancelAnimation(opacity);
    };
  }, [active, opacity, reduceMotion]);

  return opacity;
}

/**
 * Delays a skeleton's appearance so fast loads never flash a placeholder.
 * The classic 150ms threshold: loads that finish quicker skip the skeleton
 * entirely, loads that take longer never notice the delay.
 */
export function useSkeletonDisplayDelay(
  delayMs = SKELETON_DISPLAY_DELAY_MS,
): boolean {
  const [visible, setVisible] = useState(delayMs <= 0);

  useEffect(() => {
    if (visible) return;
    const timer = setTimeout(() => setVisible(true), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs, visible]);

  return visible;
}
