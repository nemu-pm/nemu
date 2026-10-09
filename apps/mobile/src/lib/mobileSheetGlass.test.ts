import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
// eslint-disable-next-line no-restricted-imports -- test needs the runtime token values; importing from @/design-system pulls the component barrel, which loads react-native's Flow-typed index.js and breaks bun's test runner.
import { nemuTokens, type NemuTokens } from "@/design/tokens";
import {
  mobileSheetGlassLook,
  nemuGlassSheetTheme,
  nemuGlassSheetTokenOverrides,
  nemuGlassSheetVeil,
  nemuGlassSheetVeilBleed,
  resolveMobileSheetGlassTrial,
} from "./mobileSheetGlass";

describe("sheet glass look", () => {
  test("defaults to the tinted glass the owner picked", () => {
    expect(resolveMobileSheetGlassTrial(undefined)).toBe("tinted");
    expect(resolveMobileSheetGlassTrial("")).toBe("tinted");
    expect(resolveMobileSheetGlassTrial("off")).toBe("off");
    expect(resolveMobileSheetGlassTrial("clear")).toBe("clear");
  });

  test("only iOS 26+ draws glass; artwork sheets keep their own colour", () => {
    expect(mobileSheetGlassLook({ platformOS: "ios", platformVersion: "26.0", trial: "tinted" })).toBe("tinted");
    expect(mobileSheetGlassLook({ platformOS: "ios", platformVersion: "18.4", trial: "tinted" })).toBe("opaque");
    expect(mobileSheetGlassLook({ platformOS: "android", platformVersion: 36, trial: "tinted" })).toBe("opaque");
    expect(
      mobileSheetGlassLook({ platformOS: "ios", platformVersion: "27.0", trial: "tinted", customBackground: true }),
    ).toBe("opaque");
    expect(mobileSheetGlassLook({ platformOS: "ios", platformVersion: "27.0", trial: "off" })).toBe("opaque");
  });

  test("a glass sheet's theme lifts secondary text and marks the look; opaque is untouched", () => {
    const theme: { scheme: "dark"; tokens: NemuTokens; sheetGlass?: "clear" | "tinted" } = {
      scheme: "dark",
      tokens: nemuTokens.dark,
    };
    expect(nemuGlassSheetTheme(theme, "opaque")).toBe(theme);

    const tinted = nemuGlassSheetTheme(theme, "tinted");
    expect(tinted.sheetGlass).toBe("tinted");
    expect(tinted.tokens.mutedForeground).toBe("#aeb1b8");
    expect(tinted.tokens.card).toBe(nemuGlassSheetTokenOverrides("tinted", "dark")?.card ?? "");
    // Text and accent colours are the theme's own.
    expect(tinted.tokens.foreground).toBe(nemuTokens.dark.foreground);
    expect(tinted.tokens.primary).toBe(nemuTokens.dark.primary);
    expect(tinted.tokens.success).toBe(nemuTokens.dark.success);
    // A sheet inside a sheet's content gets the same theme again.
    expect(nemuGlassSheetTheme(tinted, "tinted")).toEqual(tinted);
  });

  test("tinted glass keeps danger text at 4.5:1 over the veiled glass", () => {
    // The glass behind a sheet's rows over library covers, as relative
    // luminance (iPhone Air, iOS 27 simulator captures): the darkest 1% in
    // light, the brightest 1% in dark.
    const worstGlass = { light: 0.686, dark: 0.037 } as const;
    for (const scheme of ["light", "dark"] as const) {
      const danger = nemuGlassSheetTokenOverrides("tinted", scheme)?.danger ?? "";
      expect(danger).not.toBe(nemuTokens[scheme].danger);
      expect(contrastRatio(relativeLuminance(danger), worstGlass[scheme])).toBeGreaterThanOrEqual(4.5);
      // The theme's own red falls short there, which is why it is overridden.
      expect(
        contrastRatio(relativeLuminance(nemuTokens[scheme].danger), worstGlass[scheme]),
      ).toBeLessThan(4.5);
      // The tint behind danger content (error banners, the selected state) is the theme's.
      expect(nemuGlassSheetTheme({ scheme, tokens: nemuTokens[scheme] }, "tinted").tokens.dangerSoft).toBe(
        nemuTokens[scheme].dangerSoft,
      );
    }
    // Dark: a card over a bright icon glowing through the glass (0.060 under
    // the 0.56 veil) holds both once the veil is 0.68.
    const darkCardOverGlow = 0.045;
    for (const token of ["mutedForeground", "danger"] as const) {
      const colour = nemuGlassSheetTokenOverrides("tinted", "dark")?.[token] ?? "";
      expect(contrastRatio(relativeLuminance(colour), darkCardOverGlow)).toBeGreaterThanOrEqual(4.5);
    }
    expect(nemuGlassSheetVeil("tinted", "dark")).toBe("rgba(16,17,20,0.68)");
    // The rejected `clear` trial look is left as it was.
    expect(nemuGlassSheetTokenOverrides("clear", "light")?.danger).toBeUndefined();
  });

  test("the veil covers the whole sheet however far it is stretched or inset", () => {
    // iPhone Air, iOS 27: a content-sized sheet pulled up 72pt is 416pt tall
    // around 310pt of centred content, so 36pt opens above it and 70pt (with
    // the 34pt home-indicator inset) below; a landscape sheet insets its
    // content 68pt from each side. One window's length covers all of them.
    const portrait = nemuGlassSheetVeilBleed({ width: 420, height: 912 });
    expect(portrait).toBe(912);
    expect(portrait).toBeGreaterThan(70);
    expect(nemuGlassSheetVeilBleed({ width: 912, height: 420 })).toBe(912);
    expect(nemuGlassSheetVeilBleed({ width: 1032.5, height: 1376 })).toBe(1376);
    expect(nemuGlassSheetVeilBleed({ width: 0, height: 0 })).toBe(0);

    // The scope applies it to every edge of the veil (the sheet clips it),
    // not to the top and bottom by fixed amounts.
    const scope = readFileSync(
      path.join(import.meta.dir, "../design-system/components/NemuGlassSheetThemeScope.tsx"),
      "utf8",
    );
    expect(scope).toContain("const bleed = -nemuGlassSheetVeilBleed(useWindowDimensions());");
    expect(scope).toContain("{ top: bleed, right: bleed, bottom: bleed, left: bleed, backgroundColor: veil }");
    expect(scope).toContain('pointerEvents="none"');
    expect(scope).not.toContain("bottom: -64");
    expect(scope).not.toContain("veilBleed");
  });
});

/** WCAG relative luminance of a `#rrggbb` colour. */
function relativeLuminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((at) => {
    const channel = Number.parseInt(hex.slice(at, at + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
