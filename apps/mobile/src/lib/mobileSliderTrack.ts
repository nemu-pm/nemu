export type SliderSelectionHapticState = {
  value: number;
  version: number;
};

export type SliderSelectionHapticAction = {
  type: "sync" | "select";
  value: number;
};

export function sliderSelectionHapticReducer(
  state: SliderSelectionHapticState,
  action: SliderSelectionHapticAction,
): SliderSelectionHapticState {
  if (state.value === action.value) return state;
  return {
    value: action.value,
    version: action.type === "select" ? state.version + 1 : state.version,
  };
}

export function sliderRatioFromLocation(
  locationX: number,
  trackWidth: number,
): number | null {
  if (trackWidth <= 0) return null;
  return Math.max(0, Math.min(1, locationX / trackWidth));
}

/** Diameter of the slider thumb rendered by `MobileSliderTrack`. */
export const MOBILE_SLIDER_THUMB_SIZE = 18;

/**
 * Window-space box of a slider track, in points.
 *
 * It must come from `measureInWindow`, never from a touch's `pageX/pageY`:
 * inside the reader's Liquid Glass toolbar the slider is hosted by `@expo/ui`'s
 * `RNHostView`, which attaches its own `RCTSurfaceTouchHandler` to the hosted
 * view (`RNHostView.swift`), so `pagePoint` is measured from that panel rather
 * than the window. `measureInWindow` resolves against the surface's root shadow
 * node instead and stays window-relative on the glass and plain paths alike.
 */
export type MobileSliderTrackWindowFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
};
