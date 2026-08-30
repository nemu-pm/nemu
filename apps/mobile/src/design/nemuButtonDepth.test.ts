import { describe, expect, test } from "bun:test";
import { nemuTokens } from "./tokens";
import {
  getNemuButtonDepthVisual,
  type NemuButtonDepthVariant,
} from "./nemuButtonDepth";
import { nemuWebButtonPalette } from "./nemuWebButtonPalette";

describe("nemuButtonDepth", () => {
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
