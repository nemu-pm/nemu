import { describe, expect, test } from "bun:test";
import {
  canRunNemuPressableHaptic,
  resolveNemuPressableAccessibility,
} from "./nemuPressable";

describe("NemuPressable helpers", () => {
  test("defaults actionable controls to button semantics", () => {
    expect(
      resolveNemuPressableAccessibility({
        hasAction: true,
      }),
    ).toEqual({
      accessibilityRole: "button",
      accessibilityState: undefined,
      disabled: false,
    });
  });

  test("preserves explicit accessibility roles", () => {
    expect(
      resolveNemuPressableAccessibility({
        accessibilityRole: "link",
        hasAction: true,
      }).accessibilityRole,
    ).toBe("link");
  });

  test("does not add button semantics to non-action surfaces", () => {
    expect(
      resolveNemuPressableAccessibility({
        hasAction: false,
      }),
    ).toEqual({
      accessibilityRole: undefined,
      accessibilityState: undefined,
      disabled: false,
    });
  });

  test("uses accessibility disabled state as the native disabled contract", () => {
    expect(
      resolveNemuPressableAccessibility({
        accessibilityState: { selected: true, disabled: true },
        hasAction: true,
      }),
    ).toEqual({
      accessibilityRole: "button",
      accessibilityState: { selected: true, disabled: true },
      disabled: true,
    });
  });

  test("adds disabled accessibility state when the native control is disabled", () => {
    expect(
      resolveNemuPressableAccessibility({
        accessibilityState: { selected: true },
        disabled: true,
        hasAction: true,
      }),
    ).toEqual({
      accessibilityRole: "button",
      accessibilityState: { selected: true, disabled: true },
      disabled: true,
    });
  });

  test("suppresses haptics for disabled or explicitly silent controls", () => {
    expect(canRunNemuPressableHaptic("press", false)).toBe(true);
    expect(canRunNemuPressableHaptic("selection", false)).toBe(true);
    expect(canRunNemuPressableHaptic("confirm", false)).toBe(true);
    expect(canRunNemuPressableHaptic("warning", false)).toBe(true);
    expect(canRunNemuPressableHaptic("error", false)).toBe(true);
    expect(canRunNemuPressableHaptic("none", false)).toBe(false);
    expect(canRunNemuPressableHaptic("press", true)).toBe(false);
    expect(canRunNemuPressableHaptic("selection", true)).toBe(false);
    expect(canRunNemuPressableHaptic("confirm", true)).toBe(false);
    expect(canRunNemuPressableHaptic("warning", true)).toBe(false);
    expect(canRunNemuPressableHaptic("error", true)).toBe(false);
  });
});
