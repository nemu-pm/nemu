import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  canRunNemuPressableHaptic,
  createNemuRowHighlightController,
  NEMU_ROW_HIGHLIGHT,
  resolveNemuButtonAccessibility,
  resolveNemuPressableAccessibility,
  resolveNemuPressableAnimationEnabled,
  resolveNemuRowHighlightRadii,
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

  test("keeps every pressable's motion unresolved-safe", () => {
    // Changed deliberately: plain pressables used to spring regardless of
    // the setting. Reduce Motion now suppresses every press animation, and
    // an unresolved (`null`) read stays still rather than animating first.
    for (const reduceMotion of [null, true] as const) {
      expect(resolveNemuPressableAnimationEnabled({ reduceMotion })).toBe(false);
    }
    expect(resolveNemuPressableAnimationEnabled({ reduceMotion: false })).toBe(
      true,
    );
    expect(
      resolveNemuPressableAnimationEnabled({
        pressAnimationEnabled: false,
        reduceMotion: false,
      }),
    ).toBe(false);
    expect(
      resolveNemuPressableAnimationEnabled({
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
    expect(component).toMatch(
      /resolveNemuPressablePressedScale\(\{\s*pressProfile,\s*pressedScale: pressedScale \?\? \(pressHighlight \? 1 : undefined\),\s*\}\) \?\?/,
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

describe("row highlight shape", () => {
  test("follows the row's corners, concentric inside its border", () => {
    expect(resolveNemuRowHighlightRadii({ borderRadius: 16, borderWidth: 1 })).toEqual({
      borderTopLeftRadius: 15,
      borderTopRightRadius: 15,
      borderBottomLeftRadius: 15,
      borderBottomRightRadius: 15,
    });
  });

  test("a first row keeps only its top corners; a middle row is square", () => {
    expect(resolveNemuRowHighlightRadii({ borderTopLeftRadius: 12, borderTopRightRadius: 12 })).toEqual({
      borderTopLeftRadius: 12,
      borderTopRightRadius: 12,
      borderBottomLeftRadius: 0,
      borderBottomRightRadius: 0,
    });
    expect(resolveNemuRowHighlightRadii({})).toEqual({
      borderTopLeftRadius: 0,
      borderTopRightRadius: 0,
      borderBottomLeftRadius: 0,
      borderBottomRightRadius: 0,
    });
  });

  test("start/end corners and non-numeric values", () => {
    expect(resolveNemuRowHighlightRadii({ borderRadius: "50%", borderTopStartRadius: 8 })).toMatchObject({
      borderTopLeftRadius: 8,
      borderBottomRightRadius: 0,
    });
  });
});

describe("row highlight controller", () => {
  function setup() {
    const events: string[] = [];
    const controller = createNemuRowHighlightController(
      {
        setValue: (value) => events.push(`set ${value}`),
        stopAnimation: () => events.push("stop"),
      },
      () => events.push("fade"),
    );
    return { controller, events };
  }
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  test("a quick tap still flashes the highlight once", () => {
    const { controller, events } = setup();
    controller.onPressIn();
    controller.onPressOut();
    controller.onPress();
    expect(events).toEqual(["stop", "fade", "stop", "set 1", "fade"]);
  });

  test("a hold fills after the delay and only fades on release", async () => {
    const { controller, events } = setup();
    controller.onPressIn();
    await wait(NEMU_ROW_HIGHLIGHT.delayMs + 40);
    controller.onPressOut();
    controller.onPress();
    expect(events).toEqual(["stop", "set 1", "fade"]);
  });

  test("dispose cancels a pending fill", async () => {
    const { controller, events } = setup();
    controller.onPressIn();
    controller.dispose();
    await wait(NEMU_ROW_HIGHLIGHT.delayMs + 40);
    expect(events).toEqual(["stop"]);
  });
});
