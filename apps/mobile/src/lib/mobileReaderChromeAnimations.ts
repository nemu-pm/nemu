import { Easing, withTiming } from "react-native-reanimated";
import {
  READER_CHROME_MATERIAL_CURVE,
  READER_CHROME_MATERIAL_MS,
  READER_CHROME_MATERIAL_SLIDE,
  readerChromeMotionVariant,
} from "./mobileReaderChromeMotion";

/**
 * Durations / offsets shared by the reader top/bottom chrome enter/exit
 * worklets. Extracted from ReaderScreen so the animation definitions can be
 * reused and unit-referenced without pulling in the screen's state.
 */
const READER_CONTROLS_FADE_MS = READER_CHROME_MATERIAL_MS;
const READER_CONTROLS_SLIDE_PX = READER_CHROME_MATERIAL_SLIDE;
/** The capsule chrome's curve (UIKit ease-out), so every piece moves on one clock. */
const READER_CONTROLS_EASING = Easing.bezier(...READER_CHROME_MATERIAL_CURVE);
const READER_CONTROLS_TIMING = { duration: READER_CONTROLS_FADE_MS, easing: READER_CONTROLS_EASING };

function readerTopBarEntering() {
  "worklet";
  return {
    initialValues: {
      opacity: 0,
      transform: [{ translateY: -READER_CONTROLS_SLIDE_PX }],
    },
    animations: {
      opacity: withTiming(1, READER_CONTROLS_TIMING),
      transform: [
        { translateY: withTiming(0, READER_CONTROLS_TIMING) },
      ],
    },
  };
}

function readerTopBarExiting() {
  "worklet";
  return {
    initialValues: { opacity: 1, transform: [{ translateY: 0 }] },
    animations: {
      opacity: withTiming(0, READER_CONTROLS_TIMING),
      transform: [
        {
          translateY: withTiming(-READER_CONTROLS_SLIDE_PX, READER_CONTROLS_TIMING),
        },
      ],
    },
  };
}

function readerBottomBarEntering() {
  "worklet";
  return {
    initialValues: {
      opacity: 0,
      transform: [{ translateY: READER_CONTROLS_SLIDE_PX }],
    },
    animations: {
      opacity: withTiming(1, READER_CONTROLS_TIMING),
      transform: [
        { translateY: withTiming(0, READER_CONTROLS_TIMING) },
      ],
    },
  };
}

function readerBottomBarExiting() {
  "worklet";
  return {
    initialValues: { opacity: 1, transform: [{ translateY: 0 }] },
    animations: {
      opacity: withTiming(0, READER_CONTROLS_TIMING),
      transform: [
        {
          translateY: withTiming(READER_CONTROLS_SLIDE_PX, READER_CONTROLS_TIMING),
        },
      ],
    },
  };
}

/** Reduce Motion variant: the same fade, without the translate. */
function readerChromeFadeEntering() {
  "worklet";
  return {
    initialValues: { opacity: 0 },
    animations: {
      opacity: withTiming(1, READER_CONTROLS_TIMING),
    },
  };
}

function readerChromeFadeExiting() {
  "worklet";
  return {
    initialValues: { opacity: 1 },
    animations: {
      opacity: withTiming(0, READER_CONTROLS_TIMING),
    },
  };
}

/**
 * Stable animation identities per variant — Reanimated reads `entering`/
 * `exiting` when the chrome mounts, so these must not be rebuilt per render.
 */
const READER_CHROME_ANIMATIONS = {
  slide: {
    topEntering: readerTopBarEntering,
    topExiting: readerTopBarExiting,
    bottomEntering: readerBottomBarEntering,
    bottomExiting: readerBottomBarExiting,
  },
  fade: {
    topEntering: readerChromeFadeEntering,
    topExiting: readerChromeFadeExiting,
    bottomEntering: readerChromeFadeEntering,
    bottomExiting: readerChromeFadeExiting,
  },
};

/** Reader chrome enter/exit worklets for the current Reduce Motion setting. */
export function readerChromeAnimationsForMotion(reduceMotion: boolean | null) {
  return READER_CHROME_ANIMATIONS[readerChromeMotionVariant(reduceMotion)];
}
