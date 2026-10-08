import { describe, expect, test } from "bun:test";
import {
  buildMobileCoverMeshColors,
  isMobileCoverMeshFlat,
  MOBILE_COVER_MESH_LOOP,
  pickMobileCoverRegionTints,
} from "./mobileCoverMesh";
import {
  buildMobileCoverTintPalette,
  mobileContrastRatio,
  mobileHslToRgb,
  mobileRgbToHsl,
  type MobileCoverRgb,
} from "./mobileCoverTint";

function parseRgb(value: string): MobileCoverRgb {
  const match = /rgba?\((\d+), (\d+), (\d+)/.exec(value);
  if (!match) throw new Error(`not an rgb string: ${value}`);
  return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]) };
}

function quadrantCover(colors: [MobileCoverRgb, MobileCoverRgb, MobileCoverRgb, MobileCoverRgb]) {
  const width = 12;
  const height = 18;
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const quadrant = (y < height / 2 ? 0 : 2) + (x < width / 2 ? 0 : 1);
      const { r, g, b } = colors[quadrant]!;
      pixels.set([r, g, b, 255], (y * width + x) * 4);
    }
  }
  return { pixels, width, height };
}

describe("mobile cover mesh", () => {
  test("region tints follow the cover's quarters", () => {
    const red = { r: 220, g: 30, b: 40 };
    const teal = { r: 20, g: 170, b: 160 };
    const yellow = { r: 240, g: 220, b: 30 };
    const blue = { r: 40, g: 70, b: 210 };
    const { pixels, width, height } = quadrantCover([red, teal, yellow, blue]);
    const regions = pickMobileCoverRegionTints(pixels, width, height)!;
    expect(regions).toEqual([red, teal, yellow, blue]);
  });

  test("no cover is flat; a one-colour cover still moves in lightness; a colourful one too", () => {
    const red = { r: 220, g: 30, b: 40 };
    for (const scheme of ["light", "dark"] as const) {
      expect(isMobileCoverMeshFlat(buildMobileCoverMeshColors(red, [red, red, red, red], scheme))).toBe(false);
    }
    expect(isMobileCoverMeshFlat(buildMobileCoverMeshColors(null, null, "dark"))).toBe(true);
    const colourful = buildMobileCoverMeshColors(
      red,
      [red, { r: 20, g: 170, b: 160 }, { r: 240, g: 220, b: 30 }, { r: 40, g: 70, b: 210 }],
      "light",
    );
    expect(isMobileCoverMeshFlat(colourful)).toBe(false);
  });

  test("light pages read as one page: the cover's leading colour leads and the others only shade it; dark keeps its spread", () => {
    const main = { r: 30, g: 160, b: 110 };
    // A multi-colour cover: green, yellow, peach and a dark field.
    const regions = [main, { r: 240, g: 220, b: 30 }, { r: 230, g: 120, b: 90 }, { r: 40, g: 60, b: 50 }];
    const spread = (colors: MobileCoverRgb[]) => {
      let max = 0;
      for (let i = 0; i < colors.length; i += 1)
        for (let j = i + 1; j < colors.length; j += 1)
          max = Math.max(max, Math.hypot(colors[i]!.r - colors[j]!.r, colors[i]!.g - colors[j]!.g, colors[i]!.b - colors[j]!.b));
      return max;
    };
    const light = buildMobileCoverMeshColors(main, regions, "light");
    const page = mobileRgbToHsl(parseRgb(buildMobileCoverTintPalette(main, "light").page));
    expect(spread(light)).toBeLessThan(60);
    for (const pool of light) {
      const d = Math.abs(mobileRgbToHsl(pool).h - page.h) % 360;
      expect(Math.min(d, 360 - d)).toBeLessThan(45);
    }
    expect(spread(buildMobileCoverMeshColors(main, regions, "dark"))).toBeGreaterThan(120);
  });
});
