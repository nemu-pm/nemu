import { describe, expect, test } from "bun:test";
import { buildMobileCoverMeshColors, isMobileCoverMeshFlat, parseRgb, pickMobileCoverRegionTints } from "./mobileCoverMesh";
import { buildMobileCoverTintPalette, mobileRgbToHsl, type MobileCoverRgb } from "./mobileCoverTint";

describe("mobile cover mesh", () => {
  test("region tints follow the cover's quarters; a one-colour cover is flat, a multi-colour one is not", () => {
    const quarters: [MobileCoverRgb, MobileCoverRgb, MobileCoverRgb, MobileCoverRgb] = [
      { r: 220, g: 30, b: 40 },
      { r: 20, g: 170, b: 160 },
      { r: 240, g: 220, b: 30 },
      { r: 40, g: 70, b: 210 },
    ];
    const width = 12;
    const height = 18;
    const pixels = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y += 1)
      for (let x = 0; x < width; x += 1) {
        const { r, g, b } = quarters[(y < height / 2 ? 0 : 2) + (x < width / 2 ? 0 : 1)]!;
        pixels.set([r, g, b, 255], (y * width + x) * 4);
      }
    expect(pickMobileCoverRegionTints(pixels, width, height)).toEqual(quarters);
    const red = quarters[0]!;
    for (const scheme of ["light", "dark"] as const) {
      expect(isMobileCoverMeshFlat(buildMobileCoverMeshColors(red, [red, red, red, red], scheme))).toBe(false);
    }
    expect(isMobileCoverMeshFlat(buildMobileCoverMeshColors(null, null, "dark"))).toBe(true);
  });

  test("light pages read as one page: the leading colour leads and the others only shade it; dark keeps its spread", () => {
    const main = { r: 30, g: 160, b: 110 };
    const regions = [main, { r: 240, g: 220, b: 30 }, { r: 230, g: 120, b: 90 }, { r: 40, g: 60, b: 50 }];
    const spread = (colors: MobileCoverRgb[]) => {
      let max = 0;
      for (const a of colors) for (const b of colors) max = Math.max(max, Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b));
      return max;
    };
    const page = mobileRgbToHsl(parseRgb(buildMobileCoverTintPalette(main, "light").page));
    const light = buildMobileCoverMeshColors(main, regions, "light");
    expect(spread(light)).toBeLessThan(60);
    for (const pool of light) {
      const d = Math.abs(mobileRgbToHsl(pool).h - page.h) % 360;
      expect(Math.min(d, 360 - d)).toBeLessThan(45);
    }
    expect(spread(buildMobileCoverMeshColors(main, regions, "dark"))).toBeGreaterThan(120);
  });
});
