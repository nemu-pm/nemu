import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  canRunNemuPressableHaptic,
  resolveNemuButtonAccessibility,
  resolveNemuPressableAccessibility,
  resolveNemuPressableAnimationEnabled,
  shouldResetNemuPressableInteraction,
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

  test("keeps depth motion unresolved-safe without changing plain pressables", () => {
    for (const reduceMotion of [null, true] as const) {
      expect(
        resolveNemuPressableAnimationEnabled({
          hasButtonDepth: true,
          reduceMotion,
        }),
      ).toBe(false);
      expect(
        resolveNemuPressableAnimationEnabled({
          hasButtonDepth: false,
          reduceMotion,
        }),
      ).toBe(true);
    }

    expect(
      resolveNemuPressableAnimationEnabled({
        hasButtonDepth: true,
        reduceMotion: false,
      }),
    ).toBe(true);
    expect(
      resolveNemuPressableAnimationEnabled({
        hasButtonDepth: true,
        pressAnimationEnabled: false,
        reduceMotion: false,
      }),
    ).toBe(false);
    expect(
      resolveNemuPressableAnimationEnabled({
        hasButtonDepth: true,
        pressAnimationEnabled: true,
        reduceMotion: true,
      }),
    ).toBe(true);
  });

  test("resets a latched press when disabling or suppressing motion", () => {
    expect(
      shouldResetNemuPressableInteraction({
        animationEnabled: true,
        disabled: false,
      }),
    ).toBe(false);
    expect(
      shouldResetNemuPressableInteraction({
        animationEnabled: true,
        disabled: true,
      }),
    ).toBe(true);
    expect(
      shouldResetNemuPressableInteraction({
        animationEnabled: false,
        disabled: false,
      }),
    ).toBe(true);

    const component = readFileSync(
      path.join(
        import.meta.dir,
        "../design-system/components/NemuPressable.tsx",
      ),
      "utf8",
    );
    expect(component).toContain("depthPressProgress.setValue(0);");
    expect(component).not.toContain("setDepthPressed");
    expect(component).not.toMatch(/\[depthPressed,\s*setDepthPressed\]/);
    expect(component).toMatch(
      /useEffect\(\s*\(\) => \(\) => \{\s*scale\.stopAnimation\(\);/,
    );
  });

  test("animates direct depth surfaces with web timing while preserving plain springs", () => {
    const component = readFileSync(
      path.join(
        import.meta.dir,
        "../design-system/components/NemuPressable.tsx",
      ),
      "utf8",
    );

    expect(component).toContain(
      "const depthMotion = buttonDepth ? getNemuButtonPressMotion(buttonDepth) : null;",
    );
    expect(component).toContain(
      "resolveNemuPressablePressedScale({ pressProfile, pressedScale }) ??",
    );
    expect(component).toContain(
      "(depthMotion ? depthMotion.scale : 0.96)",
    );
    expect(component).toContain(
      "pressAnimationDuration ?? depthMotion?.duration",
    );
    expect(component).toContain("backgroundColor: depthBackgroundColor");
    expect(component).toContain("borderColor: depthBorderColor");
    expect(component).toContain("boxShadow: depthRestVisual.boxShadow");
    expect(component).toContain("boxShadow: depthPressedVisual.boxShadow");
    expect(component).toContain("Animated.spring(scale");
    expect(component).toContain(
      "const useNativeScaleDriver = useNativeAnimationDriver && !depthRestVisual;",
    );
    expect(component.match(/useNativeDriver: useNativeScaleDriver/g)).toHaveLength(
      2,
    );
    expect(component).toContain("useNativeDriver: false");
  });

  test("explicitly clears a completed button's native busy state", () => {
    expect(
      resolveNemuButtonAccessibility({
        accessibilityState: { selected: true },
        loading: false,
      }),
    ).toEqual({
      accessibilityState: {
        selected: true,
        disabled: false,
        busy: false,
      },
      disabled: false,
    });
  });

  test("keeps loading and caller-disabled button states coherent", () => {
    expect(
      resolveNemuButtonAccessibility({
        accessibilityState: { busy: false },
        loading: true,
      }),
    ).toEqual({
      accessibilityState: { busy: true, disabled: true },
      disabled: true,
    });
    expect(
      resolveNemuButtonAccessibility({
        accessibilityState: { disabled: true },
        loading: false,
      }),
    ).toEqual({
      accessibilityState: { disabled: true, busy: false },
      disabled: true,
    });
  });
});
