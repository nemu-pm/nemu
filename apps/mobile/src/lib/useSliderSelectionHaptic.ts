import { useCallback, useEffect, useReducer } from "react";
import { hapticSelection } from "@/lib/haptics";
import { sliderSelectionHapticReducer } from "@/lib/mobileSliderTrack";

export function useSliderSelectionHaptic(
  currentValue: number,
): (nextValue: number) => void {
  const [state, dispatch] = useReducer(sliderSelectionHapticReducer, {
    value: currentValue,
    version: 0,
  });

  useEffect(() => {
    dispatch({ type: "sync", value: currentValue });
  }, [currentValue]);

  useEffect(() => {
    if (state.version > 0) void hapticSelection();
  }, [state.version]);

  return useCallback((nextValue: number) => {
    dispatch({ type: "select", value: nextValue });
  }, []);
}
