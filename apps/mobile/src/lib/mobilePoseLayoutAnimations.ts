import {
  Easing,
  makeMutable,
  withSpring,
  withTiming,
  type EntryExitAnimationFunction,
  type LayoutAnimationFunction,
} from "react-native-reanimated";
import { MOBILE_MOTION } from "@/lib/mobileMotion";

/**
 * Shared Reanimated layout animations for pose changes. They run on the UI
 * thread (no per-frame JS).
 *
 * The frame transition is gated by a UI-thread flag that is only raised for a
 * short window after a pose change (`openMobilePoseMotionWindow`, called by
 * `MobilePoseTransitionProvider` while it renders the change, i.e. before the
 * new frames are mounted). Outside that window frames change exactly as they
 * did before — a data change (an item removed, a filter applied) or the first
 * container measurement of a freshly pushed screen never glides.
 */

/** Long enough for the async container re-measure (`useMobileContainerFold` settles at 450 ms). */
export const MOBILE_POSE_MOTION_WINDOW_MS = 800;

const poseMotionActive = makeMutable(false);
const poseReduceMotion = makeMutable(false);
let closeTimer: ReturnType<typeof setTimeout> | null = null;

/** Let pose layout transitions run for the next `MOBILE_POSE_MOTION_WINDOW_MS`. */
export function openMobilePoseMotionWindow() {
  poseMotionActive.value = true;
  if (closeTimer) clearTimeout(closeTimer);
  closeTimer = setTimeout(() => {
    closeTimer = null;
    poseMotionActive.value = false;
  }, MOBILE_POSE_MOTION_WINDOW_MS);
}

/** JS-side view of the same window, for imperative follow-ups (FLIP scales, re-snaps). */
export function isMobilePoseMotionWindowOpen(): boolean {
  return closeTimer !== null;
}

/** Whether pose motion should move things (false under Reduce Motion). */
export function isMobilePoseReduceMotion(): boolean {
  return poseReduceMotion.value;
}

/** Reduce Motion: frames jump; the pose veil's 150 ms wash softens the change instead. */
export function setMobilePoseReduceMotion(reduceMotion: boolean) {
  if (poseReduceMotion.value !== reduceMotion) poseReduceMotion.value = reduceMotion;
}

const SPRING = {
  damping: MOBILE_MOTION.settleSpring.damping,
  stiffness: MOBILE_MOTION.settleSpring.stiffness,
  mass: MOBILE_MOTION.settleSpring.mass,
};
const INSTANT = { duration: 0 };

/**
 * Frame moves at a constant window size: fold gutters opening between grid
 * columns, split panes lining up with the fold halves, pane-aligned
 * placeholders. Position and size spring with the settle spring (overshoot
 * < 2%, settled in ≈ 330 ms).
 */
export const mobilePoseLayoutTransition: LayoutAnimationFunction = (values) => {
  "worklet";
  const animate = poseMotionActive.value && !poseReduceMotion.value;
  if (!animate) {
    return {
      initialValues: {
        originX: values.targetOriginX,
        originY: values.targetOriginY,
        width: values.targetWidth,
        height: values.targetHeight,
      },
      animations: {
        originX: withTiming(values.targetOriginX, INSTANT),
        originY: withTiming(values.targetOriginY, INSTANT),
        width: withTiming(values.targetWidth, INSTANT),
        height: withTiming(values.targetHeight, INSTANT),
      },
    };
  }
  return {
    initialValues: {
      originX: values.currentOriginX,
      originY: values.currentOriginY,
      width: values.currentWidth,
      height: values.currentHeight,
    },
    animations: {
      originX: withSpring(values.targetOriginX, SPRING),
      originY: withSpring(values.targetOriginY, SPRING),
      width: withSpring(values.targetWidth, SPRING),
      height: withSpring(values.targetHeight, SPRING),
    },
  };
};

const EASE_OUT = Easing.out(Easing.cubic);

/**
 * A pane or re-arranged block appearing because of a pose change (a split
 * view gaining its leading pane, re-wrapped copy). Gated like the frame
 * transition, so content that appears for any other reason (data loading, a
 * screen push) appears exactly as before. Reduce Motion keeps a 150 ms fade.
 */
export const mobilePoseEntering: EntryExitAnimationFunction = () => {
  "worklet";
  if (!poseMotionActive.value) {
    return { initialValues: { opacity: 1 }, animations: { opacity: withTiming(1, INSTANT) } };
  }
  const duration = poseReduceMotion.value ? MOBILE_MOTION.reduceMotionFadeMs : MOBILE_MOTION.fadeInMs;
  return {
    initialValues: { opacity: 0 },
    animations: { opacity: withTiming(1, { duration, easing: EASE_OUT }) },
  };
};

/**
 * Its counterpart: the exiting view stays in place while it fades, so old and
 * new cross-fade. Outside a pose change it is removed at once (a popped
 * screen never leaves a fading ghost behind).
 */
export const mobilePoseExiting: EntryExitAnimationFunction = () => {
  "worklet";
  const duration = !poseMotionActive.value
    ? 0
    : poseReduceMotion.value
      ? MOBILE_MOTION.reduceMotionFadeMs
      : MOBILE_MOTION.fadeOutMs;
  return {
    initialValues: { opacity: 1 },
    animations: { opacity: withTiming(0, { duration, easing: EASE_OUT }) },
  };
};
