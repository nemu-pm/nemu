import { withTiming } from "react-native-reanimated";
import { readerChromeMotionVariant } from "./mobileReaderChromeMotion";

/**
 * Durations / offsets shared by the reader top/bottom chrome enter/exit
 * worklets. Extracted from ReaderScreen so the animation definitions can be
 * reused and unit-referenced without pulling in the screen's state.
 */
const READER_CONTROLS_FADE_MS = 300;
const READER_CONTROLS_SLIDE_PX = 8;

function readerTopBarEntering() {
  "worklet";
  return {
    initialValues: {
      opacity: 0,
      transform: [{ translateY: -READER_CONTROLS_SLIDE_PX }],
    },
    animations: {
      opacity: withTiming(1, { duration: READER_CONTROLS_FADE_MS }),
      transform: [
        { translateY: withTiming(0, { duration: READER_CONTROLS_FADE_MS }) },
      ],
    },
  };
}

function readerTopBarExiting() {
  "worklet";
  return {
    initialValues: { opacity: 1, transform: [{ translateY: 0 }] },
    animations: {
      opacity: withTiming(0, { duration: READER_CONTROLS_FADE_MS }),
      transform: [
        {
          translateY: withTiming(-READER_CONTROLS_SLIDE_PX, {
            duration: READER_CONTROLS_FADE_MS,
          }),
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
      opacity: withTiming(1, { duration: READER_CONTROLS_FADE_MS }),
      transform: [
        { translateY: withTiming(0, { duration: READER_CONTROLS_FADE_MS }) },
      ],
    },
  };
}

function readerBottomBarExiting() {
  "worklet";
  return {
    initialValues: { opacity: 1, transform: [{ translateY: 0 }] },
    animations: {
      opacity: withTiming(0, { duration: READER_CONTROLS_FADE_MS }),
      transform: [
        {
          translateY: withTiming(READER_CONTROLS_SLIDE_PX, {
            duration: READER_CONTROLS_FADE_MS,
          }),
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
      opacity: withTiming(1, { duration: READER_CONTROLS_FADE_MS }),
    },
  };
}

function readerChromeFadeExiting() {
  "worklet";
  return {
    initialValues: { opacity: 1 },
    animations: {
      opacity: withTiming(0, { duration: READER_CONTROLS_FADE_MS }),
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
