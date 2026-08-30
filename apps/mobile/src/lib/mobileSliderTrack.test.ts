import { describe, expect, test } from "bun:test";
import {
  sliderRatioFromLocation,
  sliderSelectionHapticReducer,
} from "./mobileSliderTrack";

describe("sliderSelectionHapticReducer", () => {
  test("ignores actions that keep the same value", () => {
    const state = { value: 4, version: 2 };
    expect(sliderSelectionHapticReducer(state, { type: "select", value: 4 })).toBe(
      state,
    );
    expect(sliderSelectionHapticReducer(state, { type: "sync", value: 4 })).toBe(
      state,
    );
  });

  test("bumps the version only for user selections", () => {
    const state = { value: 4, version: 2 };
    expect(
      sliderSelectionHapticReducer(state, { type: "select", value: 5 }),
    ).toEqual({ value: 5, version: 3 });
    expect(sliderSelectionHapticReducer(state, { type: "sync", value: 5 })).toEqual(
      { value: 5, version: 2 },
    );
  });
});

describe("sliderRatioFromLocation", () => {
  test("returns null before the track has measured", () => {
    expect(sliderRatioFromLocation(10, 0)).toBeNull();
    expect(sliderRatioFromLocation(10, -1)).toBeNull();
  });

  test("clamps the ratio to the track bounds", () => {
    expect(sliderRatioFromLocation(-20, 100)).toBe(0);
    expect(sliderRatioFromLocation(50, 100)).toBe(0.5);
    expect(sliderRatioFromLocation(140, 100)).toBe(1);
  });
});
