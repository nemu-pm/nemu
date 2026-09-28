import {
  Easing,
  makeMutable,
  withSpring,
  withTiming,
  type EntryExitAnimationFunction,
  type LayoutAnimationFunction,
} from "react-native-reanimated";
import { MOBILE_MOTION } from "@/lib/mobileMotion";
import {
  MOBILE_READER_CONSOLE_UNFOLD_DEG,
  MOBILE_READER_REDUCE_MOTION_FADE_MS,
  mobileReaderStageFlipTransform,
  type MobileReaderChromeArrangementMotion,
  type MobileReaderStageMotion,
} from "@/lib/mobileReaderStageMotion";

/**
 * Reader pose-transition animations (UI thread only; decisions live in
 * `mobileReaderStageMotion.ts`).
 *
 * Like the app-wide pose transitions, every builder is gated by a UI-thread
 * flag that the reader raises *while rendering* the change — before its frames
 * are mounted — and that closes on its own shortly after. Outside that window
 * frames and remounts behave exactly as before (a data change, a first
 * measurement, a chapter change never animate).
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

/** 0 off · 1 page FLIP · 2 translate-only FLIP (spread slots glide) · 3 Reduce Motion fade. */
const stageGlideMode = makeMutable(0);
const stageGlideFadeMs = makeMutable(MOBILE_READER_REDUCE_MOTION_FADE_MS);
/** Content aspect (width / height) for the page FLIP; 0 = unknown. */
const stagePageAspect = makeMutable(0);
/** Gallery remount cross-fade duration; 0 = no cross-fade. */
const stageCrossFadeMs = makeMutable(0);
/** Console fold-back on an arrangement change (never on a plain removal). */
const consoleExitArmed = makeMutable(false);
const consoleExitMs = makeMutable(MOBILE_READER_REDUCE_MOTION_FADE_MS);
const consoleExitReduceMotion = makeMutable(false);

let stageTimer: ReturnType<typeof setTimeout> | null = null;
let crossFadeTimer: ReturnType<typeof setTimeout> | null = null;
let consoleTimer: ReturnType<typeof setTimeout> | null = null;

function closeLater(
  timer: ReturnType<typeof setTimeout> | null,
  close: () => void,
): ReturnType<typeof setTimeout> {
  if (timer) clearTimeout(timer);
  return setTimeout(close, READER_MOTION_WINDOW_MS);
}

/**
 * Arm the stage frame transition for the commit that is being rendered.
 * `aspect` is the displayed page's (or spread's) width / height when known.
 */
export function armMobileReaderStageMotion(motion: MobileReaderStageMotion, aspect: number | null) {
  if (motion.kind === "glide" || motion.kind === "fade") {
    stageGlideMode.value = motion.kind === "fade" ? 3 : motion.flip === "page" ? 1 : 2;
    if (motion.kind === "fade") stageGlideFadeMs.value = motion.durationMs;
    stagePageAspect.value = aspect && aspect > 0 && Number.isFinite(aspect) ? aspect : 0;
    stageTimer = closeLater(stageTimer, () => {
      stageTimer = null;
      stageGlideMode.value = 0;
    });
  } else if (stageGlideMode.value !== 0) {
    // A jump / cross-fade / nothing: frames snap for this commit.
    stageGlideMode.value = 0;
  }
}

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

/**
 * The reader stage view. The frame snaps to its new rect (the list lays out
 * once, at its final size); a FLIP transform starts it where the page was and
 * springs home with the settle spring. Reduce Motion: a 150 ms fade instead.
 */
export const mobileReaderStageLayoutTransition: LayoutAnimationFunction = (values) => {
  "worklet";
  const mode = stageGlideMode.value;
  const base = instantFrame(values);
  if (mode === 0) return base;
  if (mode === 3) {
    return {
      initialValues: { ...base.initialValues, opacity: 0.4 },
      animations: {
        ...base.animations,
        opacity: withTiming(1, { duration: stageGlideFadeMs.value, easing: EASE_OUT }),
      },
    };
  }
  const flip = mobileReaderStageFlipTransform({
    from: { x: values.currentOriginX, y: values.currentOriginY, width: values.currentWidth, height: values.currentHeight },
    to: { x: values.targetOriginX, y: values.targetOriginY, width: values.targetWidth, height: values.targetHeight },
    aspect: stagePageAspect.value > 0 ? stagePageAspect.value : null,
    mode: mode === 1 ? "page" : "translate",
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

/** Spread page slots: the halves slide apart into (or back from) the fold panes. */
export const mobileReaderSlotLayoutTransition: LayoutAnimationFunction = (values) => {
  "worklet";
  if (stageGlideMode.value !== 2) return instantFrame(values);
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

/** New gallery list after a presentation change: fades in over the old one. */
export const mobileReaderStageCrossFadeEntering: EntryExitAnimationFunction = () => {
  "worklet";
  const duration = stageCrossFadeMs.value;
  if (duration <= 0) {
    return { initialValues: { opacity: 1 }, animations: { opacity: withTiming(1, INSTANT) } };
  }
  return {
    initialValues: { opacity: 0 },
    animations: { opacity: withTiming(1, { duration, easing: EASE_OUT }) },
  };
};

/** Old gallery list: stays drawn (Reanimated keeps the exiting view) while it fades out. */
export const mobileReaderStageCrossFadeExiting: EntryExitAnimationFunction = () => {
  "worklet";
  const duration = stageCrossFadeMs.value;
  return {
    initialValues: { opacity: 1 },
    animations: { opacity: withTiming(0, { duration: Math.max(0, duration), easing: EASE_OUT }) },
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

const dockCache = new Map<string, { entering: EntryExitAnimationFunction; exiting: EntryExitAnimationFunction }>();

/** Docked learning panel: slides in from its edge while fading in (Reduce Motion: fade only). */
export function mobileReaderDockAnimations(offset: { dx: number; dy: number }, reduceMotion: boolean) {
  const key = `${offset.dx}:${offset.dy}:${reduceMotion ? 1 : 0}`;
  const cached = dockCache.get(key);
  if (cached) return cached;
  const { dx, dy } = offset;
  const inMs = reduceMotion ? MOBILE_READER_REDUCE_MOTION_FADE_MS : MOBILE_MOTION.fadeInMs;
  const outMs = reduceMotion ? MOBILE_READER_REDUCE_MOTION_FADE_MS : MOBILE_MOTION.fadeOutMs;
  const entering: EntryExitAnimationFunction = () => {
    "worklet";
    return {
      initialValues: { opacity: 0, transform: [{ translateX: dx }, { translateY: dy }] },
      animations: {
        opacity: withTiming(1, { duration: inMs, easing: EASE_OUT }),
        transform: [
          { translateX: dx === 0 ? withTiming(0, INSTANT) : withSpring(0, SPRING) },
          { translateY: dy === 0 ? withTiming(0, INSTANT) : withSpring(0, SPRING) },
        ],
      },
    };
  };
  const exiting: EntryExitAnimationFunction = () => {
    "worklet";
    return {
      initialValues: { opacity: 1, transform: [{ translateX: 0 }, { translateY: 0 }] },
      animations: {
        opacity: withTiming(0, { duration: outMs, easing: EASE_OUT }),
        transform: [
          { translateX: withTiming(dx, { duration: outMs, easing: EASE_OUT }) },
          { translateY: withTiming(dy, { duration: outMs, easing: EASE_OUT }) },
        ],
      },
    };
  };
  const pair = { entering, exiting };
  dockCache.set(key, pair);
  return pair;
}
