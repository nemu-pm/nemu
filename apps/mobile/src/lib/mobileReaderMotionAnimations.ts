import {
  Easing,
  makeMutable,
  withDelay,
  withSpring,
  withTiming,
  type EntryExitAnimationFunction,
  type LayoutAnimationFunction,
} from "react-native-reanimated";
import { MOBILE_MOTION } from "@/lib/mobileMotion";
import {
  MOBILE_READER_CONSOLE_UNFOLD_DEG,
  MOBILE_READER_REDUCE_MOTION_FADE_MS,
  MOBILE_READER_STAGE_CROSSFADE_FLOOR,
  MOBILE_READER_STAGE_CROSSFADE_MS,
  MOBILE_READER_STAGE_EXIT_HOLD_MS,
  mobileReaderPageFrameFlip,
  mobileReaderStageFlipTransform,
  type MobileReaderChromeArrangementMotion,
  type MobileReaderStageMotion,
} from "@/lib/mobileReaderStageMotion";

/**
 * Reader pose-transition animations (UI thread only; decisions live in
 * `mobileReaderStageMotion.ts`).
 *
 * Stage, slot and page-frame glides are chosen per commit through the
 * `layout` prop (the reader decides the motion while rendering the change and
 * keeps it armed for a short window); Reanimated publishes `layout` configs
 * synchronously with the commit, so the transition always sees the change it
 * was chosen for. The remount cross-fade and the console fold-back still use
 * UI-thread flags raised while rendering. Outside those windows frames and
 * remounts behave exactly as before (a data change, a first measurement, a
 * chapter change never animate).
 */

/** Long enough for the follow-up measurements of one pose change (observer + stage origin). */
const READER_MOTION_WINDOW_MS = 500;

const SPRING = {
  damping: MOBILE_MOTION.settleSpring.damping,
  stiffness: MOBILE_MOTION.settleSpring.stiffness,
  mass: MOBILE_MOTION.settleSpring.mass,
};
const INSTANT = { duration: 0 };
const EASE_OUT = Easing.out(Easing.cubic);

/** Gallery remount cross-fade duration; 0 = no cross-fade. */
const stageCrossFadeMs = makeMutable(0);
/** Console fold-back on an arrangement change (never on a plain removal). */
const consoleExitArmed = makeMutable(false);
const consoleExitMs = makeMutable(MOBILE_READER_REDUCE_MOTION_FADE_MS);
const consoleExitReduceMotion = makeMutable(false);

let crossFadeTimer: ReturnType<typeof setTimeout> | null = null;
let consoleTimer: ReturnType<typeof setTimeout> | null = null;

function closeLater(
  timer: ReturnType<typeof setTimeout> | null,
  close: () => void,
): ReturnType<typeof setTimeout> {
  if (timer) clearTimeout(timer);
  return setTimeout(close, READER_MOTION_WINDOW_MS);
}

/** How long a stage motion stays armed after the commit that decided it. */
export const MOBILE_READER_STAGE_MOTION_WINDOW_MS = READER_MOTION_WINDOW_MS;

/** Arm the gallery's keyed list wrapper for a cross-fade (0 = plain remount). */
export function armMobileReaderStageCrossFade(durationMs: number) {
  stageCrossFadeMs.value = Math.max(0, durationMs);
  if (durationMs <= 0) return;
  crossFadeTimer = closeLater(crossFadeTimer, () => {
    crossFadeTimer = null;
    stageCrossFadeMs.value = 0;
  });
}

/** The notebook console is leaving because the pose changed: fold it back into the hinge. */
export function armMobileReaderConsoleFoldBack(reduceMotion: boolean, durationMs: number) {
  consoleExitArmed.value = true;
  consoleExitMs.value = durationMs;
  consoleExitReduceMotion.value = reduceMotion;
  consoleTimer = closeLater(consoleTimer, () => {
    consoleTimer = null;
    consoleExitArmed.value = false;
  });
}

function instantFrame(values: Parameters<LayoutAnimationFunction>[0]) {
  "worklet";
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

const stageTransitionCache = new Map<string, LayoutAnimationFunction>();

/**
 * The reader stage view's layout transition for the commit that moved it, or
 * undefined (frames snap). Chosen through the `layout` prop rather than a
 * shared-value flag: Reanimated registers a `layout` config synchronously with
 * the React commit (before the mount, on both platforms), whereas a shared
 * value written from JS reaches the UI thread asynchronously and could lose
 * the race against the mount — the pose change then snapped. The frame snaps
 * to its new rect (the list lays out once, at its final size); a FLIP
 * transform starts it where the page was and springs home with the settle
 * spring. Reduce Motion: a short fade instead.
 */
export function mobileReaderStageLayoutTransition(
  motion: MobileReaderStageMotion | null,
  aspect: number | null,
): LayoutAnimationFunction | undefined {
  if (!motion) return undefined;
  if (motion.kind !== "glide" && motion.kind !== "fade") return undefined;
  const pageAspect = aspect && aspect > 0 && Number.isFinite(aspect) ? Math.round(aspect * 1000) / 1000 : 0;
  const key = motion.kind === "fade" ? `fade:${motion.durationMs}` : `${motion.flip}:${pageAspect}`;
  const cached = stageTransitionCache.get(key);
  if (cached) return cached;
  let builder: LayoutAnimationFunction;
  if (motion.kind === "fade") {
    const durationMs = motion.durationMs;
    builder = (values) => {
      "worklet";
      const base = instantFrame(values);
      return {
        initialValues: { ...base.initialValues, opacity: 0.4 },
        animations: {
          ...base.animations,
          opacity: withTiming(1, { duration: durationMs, easing: EASE_OUT }),
        },
      };
    };
  } else {
    const mode = motion.flip;
    builder = (values) => {
      "worklet";
      const base = instantFrame(values);
      const flip = mobileReaderStageFlipTransform({
        from: { x: values.currentOriginX, y: values.currentOriginY, width: values.currentWidth, height: values.currentHeight },
        to: { x: values.targetOriginX, y: values.targetOriginY, width: values.targetWidth, height: values.targetHeight },
        aspect: pageAspect > 0 ? pageAspect : null,
        mode,
      });
      return {
        initialValues: {
          ...base.initialValues,
          transform: [{ translateX: flip.translateX }, { translateY: flip.translateY }, { scale: flip.scale }],
        },
        animations: {
          ...base.animations,
          transform: [
            { translateX: withSpring(0, SPRING) },
            { translateY: withSpring(0, SPRING) },
            { scale: withSpring(1, SPRING) },
          ],
        },
      };
    };
  }
  stageTransitionCache.set(key, builder);
  return builder;
}

/**
 * Spread page slots (set as their `layout` only while a `translate` glide is
 * armed): the halves slide apart into (or back from) the fold panes. The slot takes its new frame at once (its page is laid out inside
 * it at the final size) and a translate carries it from where it was; the
 * page frame inside glides its own position and scale
 * (`mobileReaderPageFrameLayoutTransition`), so the two compose into one
 * continuous move with no re-layout per frame.
 */
export const mobileReaderSlotLayoutTransition: LayoutAnimationFunction = (values) => {
  "worklet";
  const base = instantFrame(values);
  const dx = values.currentOriginX - values.targetOriginX;
  const dy = values.currentOriginY - values.targetOriginY;
  return {
    initialValues: { ...base.initialValues, transform: [{ translateX: dx }, { translateY: dy }] },
    animations: {
      ...base.animations,
      transform: [
        { translateX: withSpring(0, SPRING) },
        { translateY: withSpring(0, SPRING) },
      ],
    },
  };
};

/**
 * One page frame (the fitted page box inside its cell or spread slot; set as
 * its `layout` only while a `translate` glide is armed): FLIP
 * from its old box to its new one — laid out at the final size at once,
 * drawn where and as large as it was, then springing home. The decoded
 * image is simply scaled meanwhile; nothing reloads or fades.
 */
export const mobileReaderPageFrameLayoutTransition: LayoutAnimationFunction = (values) => {
  "worklet";
  const base = instantFrame(values);
  const flip = mobileReaderPageFrameFlip(
    { x: values.currentOriginX, y: values.currentOriginY, width: values.currentWidth, height: values.currentHeight },
    { x: values.targetOriginX, y: values.targetOriginY, width: values.targetWidth, height: values.targetHeight },
  );
  if (flip.translateX === 0 && flip.translateY === 0 && flip.scale === 1) return base;
  return {
    initialValues: {
      ...base.initialValues,
      transform: [{ translateX: flip.translateX }, { translateY: flip.translateY }, { scale: flip.scale }],
    },
    animations: {
      ...base.animations,
      transform: [
        { translateX: withSpring(0, SPRING) },
        { translateY: withSpring(0, SPRING) },
        { scale: withSpring(1, SPRING) },
      ],
    },
  };
};

/**
 * New gallery list after a presentation change: rises from a dim start over
 * the old one. Never from zero: the old list is not guaranteed to be drawn
 * underneath (the exiting copy can be dropped or clipped by the new stage),
 * and a list fading in from nothing is a black frame over the black reader.
 */
export const mobileReaderStageCrossFadeEntering: EntryExitAnimationFunction = () => {
  "worklet";
  const duration = stageCrossFadeMs.value;
  if (duration <= 0) {
    return { initialValues: { opacity: 1 }, animations: { opacity: withTiming(1, INSTANT) } };
  }
  return {
    initialValues: { opacity: MOBILE_READER_STAGE_CROSSFADE_FLOOR },
    animations: { opacity: withTiming(1, { duration, easing: EASE_OUT }) },
  };
};

/**
 * Old gallery list: stays drawn (Reanimated keeps the exiting view) at full
 * strength while the new list decodes its first pages, then fades out. It
 * does not depend on the cross-fade flag: that flag is written from JS and
 * can reach the UI thread after the removal, which dropped the old list at
 * once and left a black frame. Screen pops never run it (the gallery sits in
 * a `LayoutAnimationConfig skipExiting`).
 */
export const mobileReaderStageCrossFadeExiting: EntryExitAnimationFunction = () => {
  "worklet";
  return {
    initialValues: { opacity: 1 },
    animations: {
      opacity: withDelay(
        MOBILE_READER_STAGE_EXIT_HOLD_MS,
        withTiming(0, { duration: MOBILE_READER_STAGE_CROSSFADE_MS, easing: EASE_OUT }),
      ),
    },
  };
};

/**
 * A reader chrome capsule moving to a new frame (the row snapping per pane,
 * the scrubber changing pane): the same glass piece glides and resizes to it
 * with the settle spring on the UI thread, opacity untouched. Set as the
 * capsule's `layout` only while a chrome glide is armed.
 */
export const mobileReaderCapsuleLayoutTransition: LayoutAnimationFunction = (values) => {
  "worklet";
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

const chromeEnteringCache = new Map<string, EntryExitAnimationFunction>();

/** Incoming chrome arrangement (stable identity per motion). */
export function mobileReaderChromeArrangementEntering(
  motion: MobileReaderChromeArrangementMotion,
): EntryExitAnimationFunction {
  const key = `${motion.dx}:${motion.dy}:${motion.unfold ? 1 : 0}:${motion.durationMs}`;
  const cached = chromeEnteringCache.get(key);
  if (cached) return cached;
  const { dx, dy, unfold, durationMs } = motion;
  const builder: EntryExitAnimationFunction = unfold
    ? () => {
        "worklet";
        return {
          initialValues: {
            opacity: 0,
            transform: [{ perspective: 1200 }, { rotateX: `${MOBILE_READER_CONSOLE_UNFOLD_DEG}deg` }],
          },
          animations: {
            opacity: withTiming(1, { duration: durationMs, easing: EASE_OUT }),
            transform: [
              { perspective: 1200 },
              { rotateX: withTiming("0deg", { duration: durationMs, easing: EASE_OUT }) },
            ],
          },
        };
      }
    : () => {
        "worklet";
        return {
          initialValues: { opacity: 0, transform: [{ translateX: dx }, { translateY: dy }] },
          animations: {
            opacity: withTiming(1, { duration: durationMs, easing: EASE_OUT }),
            transform: [
              { translateX: withTiming(0, { duration: durationMs, easing: EASE_OUT }) },
              { translateY: withTiming(0, { duration: durationMs, easing: EASE_OUT }) },
            ],
          },
        };
      };
  chromeEnteringCache.set(key, builder);
  return builder;
}

/**
 * The notebook console leaving: folds back into the hinge on a pose change,
 * disappears at once otherwise (end-of-chapter card, screen pop).
 */
export const mobileReaderConsoleExiting: EntryExitAnimationFunction = () => {
  "worklet";
  if (!consoleExitArmed.value) {
    return { initialValues: { opacity: 1 }, animations: { opacity: withTiming(0, INSTANT) } };
  }
  const duration = consoleExitMs.value;
  if (consoleExitReduceMotion.value) {
    return { initialValues: { opacity: 1 }, animations: { opacity: withTiming(0, { duration, easing: EASE_OUT }) } };
  }
  return {
    initialValues: { opacity: 1, transform: [{ perspective: 1200 }, { rotateX: "0deg" }] },
    animations: {
      opacity: withTiming(0, { duration, easing: EASE_OUT }),
      transform: [
        { perspective: 1200 },
        { rotateX: withTiming(`${MOBILE_READER_CONSOLE_UNFOLD_DEG}deg`, { duration, easing: EASE_OUT }) },
      ],
    },
  };
};
