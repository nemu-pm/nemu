import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { nemuTokens } from "./tokens";
import {
  getNemuButtonDepthVisual,
  getNemuButtonDefaultCrossAxisAlignment,
  getNemuButtonMinimumTargetSize,
  getNemuButtonPressMotion,
  hasNemuButtonShadowOverride,
  resolveNemuButtonMinimumTargetSize,
  resolveNemuButtonTouchTargetStyle,
  shouldAnimateNemuButtonPress,
  splitNemuButtonStyle,
  NEMU_WEB_GHOST_BUTTON_PRESS_MOTION,
  NEMU_WEB_BUTTON_PRESS_MOTION,
  type NemuButtonDepthVariant,
} from "./nemuButtonDepth";
import { nemuWebButtonPalette } from "./nemuWebButtonPalette";

describe("nemuButtonDepth", () => {
  test("stays contract-linked to production web button source", () => {
    const webCss = readFileSync(
      path.join(import.meta.dir, "../../../../src/index.css"),
      "utf8",
    );
    const webButton = readFileSync(
      path.join(import.meta.dir, "../../../../src/components/ui/button.tsx"),
      "utf8",
    );

    // These assertions deliberately read the web layer. If production changes
    // a source value, this test fails until native endpoints are re-derived.
    expect(webCss).toContain("background: oklch(0.98 0.015 269 / 0.65);");
    expect(webCss).toContain("background: oklch(0.91 0.025 269 / 0.9);");
    expect(webCss).toContain("background: oklch(0.20 0.008 269 / 0.6);");
    expect(webCss).toContain("background: oklch(0.26 0.01 269 / 0.75);");
    expect(webCss).toContain("transition: all 180ms ease;");
    expect(webCss).toContain("transition: all 150ms ease;");
    expect(webCss).toContain(
      "background: oklch(from var(--destructive) calc(l + 0.42) calc(c * 0.3) h / 0.9);",
    );
    expect(webCss).toContain(
      "background: oklch(from var(--destructive) calc(l - 0.12) calc(c * 0.5) h / 0.35);",
    );
    expect(webButton).toContain("active:scale-[0.97]");
    expect(webButton).toContain('xs: "h-6 gap-1 px-2 text-xs rounded-md');
    expect(webButton).toContain('lg: "h-10 gap-2 px-5"');

    expect(NEMU_WEB_BUTTON_PRESS_MOTION.duration).toBe(180);
    expect(NEMU_WEB_BUTTON_PRESS_MOTION.scale).toBe(0.97);
    expect(nemuWebButtonPalette.light.outline.rest.backgroundColor).toBe(
      "rgba(244,248,255,0.65)",
    );
    expect(nemuWebButtonPalette.light.secondary.pressed.backgroundColor).toBe(
      "rgba(218,225,243,0.90)",
    );
    expect(nemuWebButtonPalette.dark.outline.rest.backgroundColor).toBe(
      "rgba(20,22,26,0.60)",
    );
    expect(nemuWebButtonPalette.dark.secondary.pressed.backgroundColor).toBe(
      "rgba(34,36,41,0.75)",
    );
  });

  test("pins the production web press motion contract", () => {
    expect(NEMU_WEB_BUTTON_PRESS_MOTION).toEqual({
      duration: 180,
      easing: [0.25, 0.1, 0.25, 1],
      scale: 0.97,
    });
    expect(NEMU_WEB_GHOST_BUTTON_PRESS_MOTION).toEqual({
      duration: 150,
      easing: [0.25, 0.1, 0.25, 1],
      scale: 0.97,
    });
    expect(getNemuButtonPressMotion("primary").duration).toBe(180);
    expect(getNemuButtonPressMotion("ghost").duration).toBe(150);
  });

  test("keeps press motion unresolved-safe and honors Reduce Motion", () => {
    expect(shouldAnimateNemuButtonPress(null)).toBe(false);
    expect(shouldAnimateNemuButtonPress(true)).toBe(false);
    expect(shouldAnimateNemuButtonPress(false)).toBe(true);
  });

  test("pins actual native minimum target layouts around web-sized surfaces", () => {
    expect(getNemuButtonMinimumTargetSize("ios")).toBe(44);
    expect(getNemuButtonMinimumTargetSize("android")).toBe(48);
    expect(getNemuButtonMinimumTargetSize("web")).toBe(44);
    expect(
      resolveNemuButtonMinimumTargetSize({ callerMinimum: 46, platform: "ios" }),
    ).toBe(46);
    expect(
      resolveNemuButtonMinimumTargetSize({ callerMinimum: 46, platform: "android" }),
    ).toBe(48);
    expect(
      resolveNemuButtonMinimumTargetSize({ callerMinimum: "50%", platform: "ios" }),
    ).toBe(44);

    expect(
      resolveNemuButtonTouchTargetStyle({
        callerStyle: {
          flex: 1,
          marginTop: 7,
          maxHeight: "50%",
          maxWidth: 32,
          minHeight: "50%",
          minWidth: "auto",
        },
        platform: "android",
      }),
    ).toEqual({
      flex: 1,
      marginTop: 7,
      maxWidth: 48,
      minHeight: 48,
      minWidth: 48,
    });
  });

  test("stretches label buttons across flex columns while centering fixed icons", () => {
    expect(getNemuButtonDefaultCrossAxisAlignment(false)).toBe("stretch");
    expect(getNemuButtonDefaultCrossAxisAlignment(true)).toBe("center");
    expect(
      resolveNemuButtonTouchTargetStyle({
        callerStyle: { flex: 1 },
        platform: "ios",
      }),
    ).toEqual({ flex: 1, minHeight: 44, minWidth: 44 });

    const component = readFileSync(
      path.join(
        import.meta.dir,
        "../design-system/components/NemuButton.tsx",
      ),
      "utf8",
    );
    expect(component).toContain('const iconOnly = size.startsWith("icon")');
    expect(component).toContain(
      "{ alignItems: getNemuButtonDefaultCrossAxisAlignment(iconOnly) }",
    );
    expect(component).not.toContain('touchTarget: {\n    alignItems: "center"');
  });

  test("wires the resolved frame and reduced-motion policy to the Pressable", () => {
    const nativeButton = readFileSync(
      path.join(
        import.meta.dir,
        "../design-system/components/NemuButton.tsx",
      ),
      "utf8",
    );
    expect(nativeButton).toContain("resolveNemuButtonTouchTargetStyle({");
    expect(nativeButton).toContain("pressAnimationEnabled={animatePressMotion}");
    expect(nativeButton).toContain("if (!animatePressMotion)");
    expect(nativeButton).toContain("backgroundColor: surfaceBackgroundColor");
    expect(nativeButton).toContain("borderColor: surfaceBorderColor");
    expect(nativeButton).not.toContain("restSurfaceOpacity");
    expect(nativeButton).toContain("boxShadow: restVisual.boxShadow");
    expect(nativeButton).toContain("boxShadow: pressedVisual.boxShadow");
  });

  test("preserves caller paint overrides on the animated surface", () => {
    const splitStyle = splitNemuButtonStyle({
        backgroundColor: "#123456",
        borderColor: "#abcdef",
        borderRadius: 18,
        elevation: 0,
        minWidth: 82,
        opacity: 0.7,
        width: "100%",
      });
    expect(splitStyle).toEqual({
      layoutStyle: {
        borderRadius: 18,
        minWidth: 82,
        opacity: 0.7,
        width: "100%",
      },
      surfaceShapeStyle: { borderRadius: 18 },
      surfaceStyle: {
        backgroundColor: "#123456",
        borderColor: "#abcdef",
        borderRadius: 18,
        elevation: 0,
      },
    });
    expect(hasNemuButtonShadowOverride(splitStyle.surfaceStyle)).toBe(true);
    expect(hasNemuButtonShadowOverride({ borderRadius: 18 })).toBe(false);
  });

  test("keeps caller border shape on both paint and clipping frames", () => {
    expect(
      splitNemuButtonStyle({
        borderBottomLeftRadius: 24,
        borderTopRightRadius: 8,
        overflow: "hidden",
      }),
    ).toEqual({
      layoutStyle: {
        borderBottomLeftRadius: 24,
        borderTopRightRadius: 8,
        overflow: "hidden",
      },
      surfaceShapeStyle: {
        borderBottomLeftRadius: 24,
        borderTopRightRadius: 8,
      },
      surfaceStyle: {
        borderBottomLeftRadius: 24,
        borderTopRightRadius: 8,
      },
    });
  });

  test("pins native semantic colors to the production web oklch conversions", () => {
    expect(nemuTokens.light.secondary).toBe("#e7ebf6");
    expect(nemuTokens.light.secondaryForeground).toBe("#323a50");
    expect(nemuTokens.light.danger).toBe("#de3b3d");
    expect(nemuTokens.dark.secondary).toBe("#191a1e");
    expect(nemuTokens.dark.secondaryForeground).toBe("#d5d7de");
    expect(nemuTokens.dark.danger).toBe("#e8575b");
  });

  test("pins glass surfaces to production web color conversions", () => {
    expect(nemuWebButtonPalette.light.outline.rest.backgroundColor).toBe(
      "rgba(244,248,255,0.65)",
    );
    expect(nemuWebButtonPalette.light.secondary.pressed.backgroundColor).toBe(
      "rgba(218,225,243,0.90)",
    );
    expect(nemuWebButtonPalette.dark.outline.pressed.backgroundColor).toBe(
      "rgba(29,31,36,0.70)",
    );
    expect(nemuWebButtonPalette.dark.secondary.rest.backgroundColor).toBe(
      "rgba(25,26,30,0.70)",
    );
  });

  test("primary rest uses web-matching layered halo shadows", () => {
    const visual = getNemuButtonDepthVisual({
      variant: "primary",
      state: "rest",
      scheme: "light",
      tokens: nemuTokens.light,
    });

    expect(visual.backgroundColor).toBe(nemuTokens.light.primary);
    expect(visual.boxShadow).toBe(nemuWebButtonPalette.light.primary.rest.boxShadow);
    expect(visual.boxShadow).toContain("inset 0px 0.5px 0px");
  });

  test("pressed primary deepens the outer halo", () => {
    const rest = getNemuButtonDepthVisual({
      variant: "primary",
      state: "rest",
      scheme: "light",
      tokens: nemuTokens.light,
    });
    const pressed = getNemuButtonDepthVisual({
      variant: "primary",
      state: "pressed",
      scheme: "light",
      tokens: nemuTokens.light,
    });

    expect(pressed.backgroundColor).not.toBe(rest.backgroundColor);
    expect(pressed.boxShadow).toBe(nemuWebButtonPalette.light.primary.pressed.boxShadow);
  });

  test("uses the web relative-color primary hover conversion in dark mode", () => {
    const pressed = getNemuButtonDepthVisual({
      variant: "primary",
      state: "pressed",
      scheme: "dark",
      tokens: nemuTokens.dark,
    });

    expect(pressed.backgroundColor).toBe("#7a9eff");
  });

  test("secondary uses web secondary-foreground on light", () => {
    const visual = getNemuButtonDepthVisual({
      variant: "secondary",
      state: "rest",
      scheme: "light",
      tokens: nemuTokens.light,
    });

    expect(visual.backgroundColor).toBe(
      nemuWebButtonPalette.light.secondary.rest.backgroundColor,
    );
    expect(visual.foregroundColor).toBe(nemuTokens.light.secondaryForeground);
  });

  test("destructive dark uses tinted glass distinct from light", () => {
    const light = getNemuButtonDepthVisual({
      variant: "destructive",
      state: "rest",
      scheme: "light",
      tokens: nemuTokens.light,
    });
    const dark = getNemuButtonDepthVisual({
      variant: "destructive",
      state: "rest",
      scheme: "dark",
      tokens: nemuTokens.dark,
    });

    expect(light.backgroundColor).not.toBe(dark.backgroundColor);
    expect(light.backgroundColor).toBe("rgba(255,247,241,0.90)");
    expect(
      getNemuButtonDepthVisual({
        variant: "destructive",
        state: "pressed",
        scheme: "light",
        tokens: nemuTokens.light,
      }).backgroundColor,
    ).toBe("rgba(255,229,223,0.92)");
    expect(dark.backgroundColor).toBe("rgba(153,86,84,0.35)");
    expect(
      getNemuButtonDepthVisual({
        variant: "destructive",
        state: "pressed",
        scheme: "dark",
        tokens: nemuTokens.dark,
      }).backgroundColor,
    ).toBe("rgba(174,91,90,0.40)");
    expect(light.borderColor).toBe("rgba(180,103,98,0.20)");
    expect(dark.borderColor).toBe("rgba(209,109,108,0.30)");
    expect(dark.boxShadow).toBe(nemuWebButtonPalette.dark.destructive.rest.boxShadow);
    expect(light.foregroundColor).toBe(nemuTokens.light.danger);
  });

  test("toolbar depth reuses glass outline shadows with toolbar fills", () => {
    const visual = getNemuButtonDepthVisual({
      variant: "toolbar",
      state: "rest",
      scheme: "light",
      tokens: nemuTokens.light,
    });

    expect(visual.backgroundColor).toBe(nemuTokens.light.toolbarAction);
    expect(visual.borderColor).toBe(nemuTokens.light.toolbarActionBorder);
    expect(visual.boxShadow).toBe(nemuWebButtonPalette.light.outline.rest.boxShadow);
  });

  test("depth variants expose foreground color when relevant", () => {
    const variants: NemuButtonDepthVariant[] = [
      "primary",
      "outline",
      "secondary",
      "ghost",
      "destructive",
      "toolbar",
      "toolbar-danger",
      "chip-selected",
      "chip",
      "elevated",
    ];

    for (const variant of variants) {
      const visual = getNemuButtonDepthVisual({
        variant,
        state: "rest",
        scheme: "light",
        tokens: nemuTokens.light,
      });

      if (variant === "ghost" || variant === "chip") {
        expect(visual.foregroundColor).toBe(nemuTokens.light.mutedForeground);
        continue;
      }

      expect(visual.foregroundColor).toBeTruthy();
    }
  });
});
