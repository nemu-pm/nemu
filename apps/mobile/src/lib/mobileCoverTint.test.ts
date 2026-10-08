import { describe, expect, test } from "bun:test";
import {
  buildMobileCoverTintPalette,
  MOBILE_PRIMARY_MIN_CHROMA,
  MOBILE_PRIMARY_PAGE_CONTRAST,
  mobileContrastRatio,
  mobileHslToRgb,
  mobileRgbToHsl,
  pickMobileCoverTint,
  type MobileCoverRgb,
} from "./mobileCoverTint";

function pixelsOf(colors: Array<[MobileCoverRgb, number]>): Uint8Array {
  const total = colors.reduce((sum, [, count]) => sum + count, 0);
  const pixels = new Uint8Array(total * 4);
  let offset = 0;
  for (const [{ r, g, b }, count] of colors) {
    for (let index = 0; index < count; index += 1) {
      pixels.set([r, g, b, 255], offset);
      offset += 4;
    }
  }
  return pixels;
}

function parseRgb(value: string): MobileCoverRgb {
  const match = /rgba?\((\d+), (\d+), (\d+)/.exec(value);
  if (!match) throw new Error(`not an rgb string: ${value}`);
  return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]) };
}

describe("mobile cover tint", () => {
  test("a large dark field outvotes a small vivid title band", () => {
    const teal = { r: 18, g: 72, b: 60 };
    const red = { r: 230, g: 70, b: 40 };
    const paper = { r: 236, g: 234, b: 228 };
    const tint = pickMobileCoverTint(pixelsOf([[teal, 140], [red, 30], [paper, 46]]))!;
    expect(mobileRgbToHsl(tint).h).toBeGreaterThan(140);
    expect(mobileRgbToHsl(tint).h).toBeLessThan(190);
  });

  test("round-trips HSL conversions", () => {
    for (const rgb of [
      { r: 88, g: 121, b: 244 },
      { r: 230, g: 40, b: 60 },
      { r: 20, g: 200, b: 90 },
      { r: 128, g: 128, b: 128 },
    ]) {
      const back = mobileHslToRgb(mobileRgbToHsl(rgb));
      expect(Math.abs(back.r - rgb.r)).toBeLessThanOrEqual(1);
      expect(Math.abs(back.g - rgb.g)).toBeLessThanOrEqual(1);
      expect(Math.abs(back.b - rgb.b)).toBeLessThanOrEqual(1);
    }
  });

  test("prefers the cover's character colour over a larger neutral area", () => {
    const tint = pickMobileCoverTint(
      pixelsOf([
        [{ r: 245, g: 245, b: 240 }, 120], // paper white background
        [{ r: 30, g: 30, b: 30 }, 60], // line art
        [{ r: 210, g: 50, b: 70 }, 40], // red title logo
      ]),
    );
    expect(tint).not.toBeNull();
    const { h, s } = mobileRgbToHsl(tint!);
    expect(h < 20 || h > 340).toBe(true);
    expect(s).toBeGreaterThan(0.5);
  });

  test("keeps monochrome covers grey instead of inventing a hue", () => {
    const tint = pickMobileCoverTint(
      pixelsOf([
        [{ r: 240, g: 240, b: 240 }, 100],
        [{ r: 20, g: 20, b: 20 }, 100],
        [{ r: 200, g: 120, b: 120 }, 2],
      ]),
    );
    expect(mobileRgbToHsl(tint!).s).toBeLessThan(0.1);
  });

  test("ignores transparent pixels and returns null for an empty image", () => {
    expect(pickMobileCoverTint(new Uint8Array([255, 0, 0, 0]))).toBeNull();
    expect(pickMobileCoverTint(new Uint8Array())).toBeNull();
  });

  const parseRgba = (value: string) => {
    const [r, g, b, alpha = 1] = (value.match(/[\d.]+/g) ?? []).map(Number);
    return { r: r!, g: g!, b: b!, alpha };
  };
  const over = (ink: string, surface: string) => {
    const top = parseRgba(ink);
    const under = parseRgb(surface);
    return {
      r: top.r * top.alpha + under.r * (1 - top.alpha),
      g: top.g * top.alpha + under.g * (1 - top.alpha),
      b: top.b * top.alpha + under.b * (1 - top.alpha),
    };
  };
  const everyCover = function* () {
    for (const scheme of ["light", "dark"] as const) {
      for (let h = 0; h < 360; h += 15) {
        for (const s of [0.05, 0.3, 0.6, 1]) {
          for (const l of [0.15, 0.35, 0.5, 0.7, 0.92]) {
            yield { scheme, cover: mobileHslToRgb({ h, s, l }) };
          }
        }
      }
    }
  };

  test("every cover clears WCAG AA for the card's text, its button, and the page's text", () => {
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
  });

  test("a coloured cover makes a card in its colour at strength, in both schemes", () => {
    for (const scheme of ["light", "dark"] as const) {
      for (let h = 0; h < 360; h += 15) {
        const card = mobileRgbToHsl(
          parseRgb(buildMobileCoverTintPalette(mobileHslToRgb({ h, s: 0.7, l: 0.5 }), scheme).card),
        );
        expect(Math.abs(((card.h - h + 540) % 360) - 180)).toBeLessThan(8);
        expect(card.s).toBeGreaterThanOrEqual(0.7);
        // Neither a pastel nor a near-black: the colour itself.
        expect(card.l).toBeGreaterThanOrEqual(0.3);
        expect(card.l).toBeLessThanOrEqual(0.72);
      }
    }
  });

  test("the page is a clear tint in light mode and a deep shade in dark mode", () => {
    for (let h = 0; h < 360; h += 15) {
      const cover = mobileHslToRgb({ h, s: 0.7, l: 0.5 });
      const light = mobileRgbToHsl(parseRgb(buildMobileCoverTintPalette(cover, "light").page));
      const dark = mobileRgbToHsl(parseRgb(buildMobileCoverTintPalette(cover, "dark").page));
      expect(light.s).toBeGreaterThanOrEqual(0.6);
      expect(light.l).toBeLessThanOrEqual(0.85);
      expect(dark.s).toBeGreaterThanOrEqual(0.4);
      expect(dark.l).toBeLessThanOrEqual(0.26);
    }
  });

  test("the card stands off the page behind it", () => {
    for (const scheme of ["light", "dark"] as const) {
      for (let h = 0; h < 360; h += 15) {
        const palette = buildMobileCoverTintPalette(mobileHslToRgb({ h, s: 0.7, l: 0.5 }), scheme);
        // By lightness, or (light yellows and greens on their pale page) by
        // being far more colourful than it.
        const chroma = (value: string) => {
          const { s, l } = mobileRgbToHsl(parseRgb(value));
          return s * (1 - Math.abs(2 * l - 1));
        };
        const lightness = mobileContrastRatio(parseRgb(palette.card), parseRgb(palette.page));
        expect(lightness >= 1.5 || chroma(palette.card) - chroma(palette.page) >= 0.3).toBe(true);
      }
    }
  });

  test("monochrome covers keep a grey card at their own lightness", () => {
    for (const scheme of ["light", "dark"] as const) {
      const white = mobileRgbToHsl(
        parseRgb(buildMobileCoverTintPalette({ r: 240, g: 238, b: 235 }, scheme).card),
      );
      expect(white.l).toBeGreaterThan(0.85);
      expect(white.s * (1 - Math.abs(2 * white.l - 1))).toBeLessThan(0.07);
      const black = mobileRgbToHsl(
        parseRgb(buildMobileCoverTintPalette({ r: 22, g: 22, b: 26 }, scheme).card),
      );
      expect(black.l).toBeLessThan(0.2);
    }
  });

  test("falls back to a quiet nemu-indigo palette without a cover colour", () => {
    const palette = buildMobileCoverTintPalette(null, "dark");
    const { h, s } = mobileRgbToHsl(parseRgb(palette.card));
    expect(h).toBeGreaterThan(210);
    expect(h).toBeLessThan(240);
    expect(s).toBeLessThanOrEqual(0.25);
  });

  test("the primary button always reads as the main action, with AA text", () => {
    const chroma = (rgb: MobileCoverRgb) => {
      const { s, l } = mobileRgbToHsl(rgb);
      return s * (1 - Math.abs(2 * l - 1));
    };
    for (const scheme of ["light", "dark"] as const) {
      for (let h = 0; h < 360; h += 15) {
        for (const s of [0.05, 0.12, 0.2, 0.3, 0.6, 1]) {
          for (const l of [0.15, 0.4, 0.6, 0.75, 0.9]) {
            const palette = buildMobileCoverTintPalette(mobileHslToRgb({ h, s, l }), scheme);
            const fill = parseRgb(palette.primary);
            const ink = parseRgb(palette.primaryInk);
            expect(mobileContrastRatio(fill, ink)).toBeGreaterThanOrEqual(4.5);
            const page = parseRgb(palette.page);
            // Coloured enough to read as an accent, or a contrast pill.
            const accent = chroma(fill) >= MOBILE_PRIMARY_MIN_CHROMA - 0.01;
            const pill = mobileContrastRatio(fill, page) >= 3;
            expect(accent || pill).toBe(true);
            // One rule with the floor: the button always stands off its page (non-text contrast).
            expect(mobileContrastRatio(fill, page)).toBeGreaterThanOrEqual(MOBILE_PRIMARY_PAGE_CONTRAST[scheme]);
          }
        }
      }
    }
  });

  test("a pastel cover's primary keeps its hue but gains colour", () => {
    const lavender = { r: 196, g: 186, b: 214 };
    const palette = buildMobileCoverTintPalette(lavender, "light");
    const card = mobileRgbToHsl(parseRgb(palette.card));
    const primary = mobileRgbToHsl(parseRgb(palette.primary));
    expect(Math.abs(primary.h - card.h)).toBeLessThan(8);
    expect(primary.s * (1 - Math.abs(2 * primary.l - 1))).toBeGreaterThan(card.s * (1 - Math.abs(2 * card.l - 1)));
  });

  test("a black-and-white cover's primary is a contrast pill", () => {
    const grey = { r: 120, g: 120, b: 122 };
    expect(parseRgb(buildMobileCoverTintPalette(grey, "light").primary).r).toBeLessThan(40);
    expect(parseRgb(buildMobileCoverTintPalette(grey, "dark").primary).r).toBeGreaterThan(230);
  });
});
