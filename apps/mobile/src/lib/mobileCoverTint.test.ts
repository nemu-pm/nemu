import { describe, expect, test } from "bun:test";
import {
  buildMobileCoverTintPalette,
  mobileContrastRatio,
  mobileHslToRgb,
  mobileRgbToHsl,
  pickMobileCoverTint,
  type MobileCoverRgb,
} from "./mobileCoverTint";
import { parseRgb } from "./mobileCoverMesh";

const pixelsOf = (colors: Array<[MobileCoverRgb, number]>) => {
  const pixels: number[] = [];
  for (const [{ r, g, b }, count] of colors) for (let i = 0; i < count; i += 1) pixels.push(r, g, b, 255);
  return new Uint8Array(pixels);
};

const chroma = (rgb: MobileCoverRgb) => {
  const { s, l } = mobileRgbToHsl(rgb);
  return s * (1 - Math.abs(2 * l - 1));
};

/** An ink, possibly translucent, shown over the surface it sits on. */
const over = (ink: string, surface: string) => {
  const [r, g, b, alpha = 1] = (ink.match(/[\d.]+/g) ?? []).map(Number);
  const under = parseRgb(surface);
  return { r: r! * alpha + under.r * (1 - alpha), g: g! * alpha + under.g * (1 - alpha), b: b! * alpha + under.b * (1 - alpha) };
};

/** Covers across hue, saturation and lightness, both schemes. */
function* everyCover() {
  for (const scheme of ["light", "dark"] as const)
    for (let h = 0; h < 360; h += 15)
      for (const s of [0.05, 0.3, 0.6, 1])
        for (const l of [0.15, 0.35, 0.5, 0.7, 0.92]) yield { scheme, h, s, l, cover: mobileHslToRgb({ h, s, l }) };
}

describe("mobile cover tint", () => {
  test("the tint follows the dominant colour, a monochrome cover stays grey, and transparent or empty images pick nothing", () => {
    const tint = pickMobileCoverTint(pixelsOf([[{ r: 18, g: 72, b: 60 }, 140], [{ r: 230, g: 70, b: 40 }, 30], [{ r: 236, g: 234, b: 228 }, 46]]))!;
    expect(mobileRgbToHsl(tint).h).toBeGreaterThan(140);
    expect(mobileRgbToHsl(tint).h).toBeLessThan(190);
    const grey = pickMobileCoverTint(pixelsOf([[{ r: 240, g: 240, b: 240 }, 100], [{ r: 20, g: 20, b: 20 }, 100]]))!;
    expect(mobileRgbToHsl(grey).s).toBeLessThan(0.1);
    expect(pickMobileCoverTint(new Uint8Array([255, 0, 0, 0]))).toBeNull();
    expect(pickMobileCoverTint(new Uint8Array())).toBeNull();
  });

  test("every cover clears WCAG AA for the card, its button and the page; the primary button stands off its page and reads as the action", () => {
    let worst = Infinity;
    for (const { scheme, cover } of everyCover()) {
      const palette = buildMobileCoverTintPalette(cover, scheme);
      for (const [ink, surface] of [
        [palette.cardInk, palette.card],
        [palette.cardInkSecondary, palette.card],
        [palette.actionInk, palette.action],
        [palette.ink, palette.page],
        [palette.inkSecondary, palette.page],
      ] as const) {
        worst = Math.min(worst, mobileContrastRatio(over(ink, surface), parseRgb(surface)));
      }
    }
    expect(worst).toBeGreaterThanOrEqual(4.5);
    for (const { scheme, cover } of everyCover()) {
      const palette = buildMobileCoverTintPalette(cover, scheme);
      const fill = parseRgb(palette.primary);
      const page = parseRgb(palette.page);
      expect(mobileContrastRatio(fill, parseRgb(palette.primaryInk))).toBeGreaterThanOrEqual(4.5);
      expect(chroma(fill) >= 0.3 - 0.01 || mobileContrastRatio(fill, page) >= 3).toBe(true);
      expect(mobileContrastRatio(fill, page)).toBeGreaterThanOrEqual((scheme === "light" ? 3 : 4.5));
    }
  });

  test("a coloured cover makes a card in its own hue that stands off the page; the page is a clear tint (light) or a deep shade (dark)", () => {
    for (const scheme of ["light", "dark"] as const) {
      for (let h = 0; h < 360; h += 15) {
        const palette = buildMobileCoverTintPalette(mobileHslToRgb({ h, s: 0.7, l: 0.5 }), scheme);
        const card = mobileRgbToHsl(parseRgb(palette.card));
        expect(Math.abs(((card.h - h + 540) % 360) - 180)).toBeLessThan(8);
        expect(card.s).toBeGreaterThanOrEqual(0.7);
        expect(card.l).toBeGreaterThanOrEqual(0.3);
        expect(card.l).toBeLessThanOrEqual(0.72);
        const page = mobileRgbToHsl(parseRgb(palette.page));
        expect(page.l).toBeLessThanOrEqual(scheme === "light" ? 0.85 : 0.26);
        const lightness = mobileContrastRatio(parseRgb(palette.card), parseRgb(palette.page));
        expect(lightness >= 1.5 || chroma(parseRgb(palette.card)) - chroma(parseRgb(palette.page)) >= 0.3).toBe(true);
      }
    }
  });

  test("monochrome covers keep a grey card at their own lightness; no cover falls back to a quiet indigo; a black-and-white primary is a contrast pill", () => {
    for (const scheme of ["light", "dark"] as const) {
      const white = parseRgb(buildMobileCoverTintPalette({ r: 240, g: 238, b: 235 }, scheme).card);
      expect(mobileRgbToHsl(white).l).toBeGreaterThan(0.85);
      expect(chroma(white)).toBeLessThan(0.07);
      expect(mobileRgbToHsl(parseRgb(buildMobileCoverTintPalette({ r: 22, g: 22, b: 26 }, scheme).card)).l).toBeLessThan(0.2);
    }
    const { h, s } = mobileRgbToHsl(parseRgb(buildMobileCoverTintPalette(null, "dark").card));
    expect(h).toBeGreaterThan(210);
    expect(h).toBeLessThan(240);
    expect(s).toBeLessThanOrEqual(0.25);
    const grey = { r: 120, g: 120, b: 122 };
    expect(parseRgb(buildMobileCoverTintPalette(grey, "light").primary).r).toBeLessThan(40);
    expect(parseRgb(buildMobileCoverTintPalette(grey, "dark").primary).r).toBeGreaterThan(230);
  });
});
