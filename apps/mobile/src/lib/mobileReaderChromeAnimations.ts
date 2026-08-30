import { withTiming } from "react-native-reanimated";

/**
 * Durations / offsets shared by the reader top/bottom chrome enter/exit
 * worklets. Extracted from ReaderScreen so the animation definitions can be
 * reused and unit-referenced without pulling in the screen's state.
 */
export const READER_CONTROLS_FADE_MS = 300;
export const READER_CONTROLS_SLIDE_PX = 8;

export function readerTopBarEntering() {
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

export function readerTopBarExiting() {
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

export function readerBottomBarEntering() {
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

export function readerBottomBarExiting() {
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