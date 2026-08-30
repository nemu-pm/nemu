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
