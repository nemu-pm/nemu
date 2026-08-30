import { describe, expect, test } from "bun:test";
import {
  canRunMobileSwitchSelectionFeedback,
  getMobileSwitchAccessibilityState,
} from "./mobileAccessibility";

describe("mobile accessibility helpers", () => {
  test("keeps switch checked and disabled state together", () => {
    expect(getMobileSwitchAccessibilityState(true, true)).toEqual({
      checked: true,
      disabled: true,
    });
    expect(getMobileSwitchAccessibilityState(false)).toEqual({
      checked: false,
      disabled: false,
    });
  });

  test("runs switch selection feedback only for enabled value changes", () => {
    expect(
      canRunMobileSwitchSelectionFeedback({
        checked: false,
        nextChecked: true,
      }),
    ).toBe(true);
    expect(
      canRunMobileSwitchSelectionFeedback({
        checked: true,
        nextChecked: true,
      }),
    ).toBe(false);
    expect(
      canRunMobileSwitchSelectionFeedback({
        checked: false,
        disabled: true,
        nextChecked: true,
      }),
    ).toBe(false);
  });
});
