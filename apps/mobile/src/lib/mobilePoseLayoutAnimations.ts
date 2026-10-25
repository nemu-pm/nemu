import { createSynchronizable } from "react-native-worklets";
import {
  Easing,
  makeMutable,
  withSpring,
  withTiming,
  type EntryExitAnimationFunction,
  type LayoutAnimationFunction,
} from "react-native-reanimated";
import { getMobilePoseFlipStart, MOBILE_MOTION } from "@/lib/mobileMotion";

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
 *
 * The flag is a synchronizable (a value both runtimes read and write under a
 * lock), not a shared value: a shared value written from JS reaches the UI
 * runtime in a microtask after the render — after React's commit, whose
 * mount is already queued on the main thread ahead of it — so frames changed
 * in the very commit that opened the window read the flag still down and
 * snapped (build 9 r3 4c: the source home's list footer jumped 24 pt in one
 * frame, 1 cycle in 4, while the covers' JS-side spring ran). Set
 * synchronously while rendering, it is up before that commit exists.
 */

/** Long enough for the async container re-measure (`useMobileContainerFold` settles at 450 ms). */
export const MOBILE_POSE_MOTION_WINDOW_MS = 800;

const poseMotionActive = createSynchronizable(false, { fixedType: true });
const poseReduceMotion = makeMutable(false);
let closeTimer: ReturnType<typeof setTimeout> | null = null;

/** Let pose layout transitions run for the next `MOBILE_POSE_MOTION_WINDOW_MS`. */
export function openMobilePoseMotionWindow() {
  // The provider calls this while rendering the change: written now (not
  // queued), so the commit that mounts the new frames already sees it.
  poseMotionActive.setBlocking(true);
  if (closeTimer) clearTimeout(closeTimer);
  closeTimer = setTimeout(() => {
    closeTimer = null;
    poseMotionActive.setBlocking(false);
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

/** Reduce Motion: frames take their new place at once (the reader's veil softens its own changes). */
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
  const animate = poseMotionActive.getBlocking() && !poseReduceMotion.value;
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

/**
 * A layout transition that leaves the frame to React (it takes its new frame
 * at once) and springs a FLIP transform instead: the view starts drawn where
 * and at the size it was, about `origin`, and settles to identity on the pose
 * spring. The transform starts in the same mount as the new frame — a FLIP
 * written from JS after the commit (a shared value in a layout effect) raced
 * that mount and drew the scale on the old frame for a frame (build 9 r3 4b:
 * the Continue Reading card shrank, then regrew). Only for content whose
 * height follows its width (covers, cards): text rows would stretch.
 * Outside a pose change, or under Reduce Motion, it is identity at once.
 */
type MobilePoseLayoutValues = {
  currentOriginX: number;
  currentOriginY: number;
  currentWidth: number;
  currentHeight: number;
  targetOriginX: number;
  targetOriginY: number;
  targetWidth: number;
  targetHeight: number;
};

function makeMobilePoseFlipTransition(origin: "leading" | "centre"): LayoutAnimationFunction {
  return (values: MobilePoseLayoutValues) => {
    "worklet";
    const start = getMobilePoseFlipStart(
      { x: values.currentOriginX, y: values.currentOriginY, width: values.currentWidth, height: values.currentHeight },
      { x: values.targetOriginX, y: values.targetOriginY, width: values.targetWidth, height: values.targetHeight },
      origin,
      poseMotionActive.getBlocking(),
      poseReduceMotion.value,
    );
    const glide = start.scale !== 1 || start.translateX !== 0 || start.translateY !== 0;
    return {
      initialValues: {
        transform: [{ translateX: start.translateX }, { translateY: start.translateY }, { scale: start.scale }],
      },
      animations: {
        transform: glide
          ? [
              { translateX: withSpring(0, SPRING) },
              { translateY: withSpring(0, SPRING) },
              { scale: withSpring(1, SPRING) },
            ]
          : [
              { translateX: withTiming(0, INSTANT) },
              { translateY: withTiming(0, INSTANT) },
              { scale: withTiming(1, INSTANT) },
            ],
      },
    };
  };
}

/** Cover-sized content (MobilePoseSizeSpringView): scales from its top-left corner (transformOrigin "left top"). */
export const mobilePoseSizeFlipTransition = makeMobilePoseFlipTransition("leading");

const EASE_OUT = Easing.out(Easing.cubic);

/**
 * A pane or re-arranged block appearing because of a pose change (a split
 * view gaining its leading pane, re-wrapped copy). Gated like the frame
 * transition, so content that appears for any other reason (data loading, a
 * screen push) appears exactly as before. Reduce Motion keeps a 150 ms fade.
 */
export const mobilePoseEntering: EntryExitAnimationFunction = () => {
  "worklet";
  if (!poseMotionActive.getBlocking()) {
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
  const duration = !poseMotionActive.getBlocking()
    ? 0
    : poseReduceMotion.value
      ? MOBILE_MOTION.reduceMotionFadeMs
      : MOBILE_MOTION.fadeOutMs;
  return {
    initialValues: { opacity: 1 },
    animations: { opacity: withTiming(0, { duration, easing: EASE_OUT }) },
  };
};
