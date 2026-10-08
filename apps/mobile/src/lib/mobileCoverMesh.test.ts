import { describe, expect, test } from "bun:test";
import {
  blendMobileCoverMesh,
  buildMobileCoverMeshColors,
  buildMobileCoverMeshInkSecondary,
  getMobileCoverMeshPoints,
  getMobileCoverMeshWeights,
  isMobileCoverMeshFlat,
  MOBILE_COVER_MESH_INK_CONTRAST,
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

  test("the four pools orbit the loop and land on its places at whole steps", () => {
    expect(getMobileCoverMeshPoints(0)).toEqual([0, 2, 4, 6].map((i) => MOBILE_COVER_MESH_LOOP[i]!));
    expect(getMobileCoverMeshPoints(3)).toEqual([3, 5, 7, 1].map((i) => MOBILE_COVER_MESH_LOOP[i]!));
    // Eight steps are a full orbit.
    expect(getMobileCoverMeshPoints(8.5)).toEqual(getMobileCoverMeshPoints(0.5));
    // Mid-step a pool is between its two places.
    const half = getMobileCoverMeshPoints(0.5)[0]!;
    expect(half.x).toBeCloseTo((MOBILE_COVER_MESH_LOOP[0]!.x + MOBILE_COVER_MESH_LOOP[1]!.x) / 2, 5);
  });

  test("weights sum to one and the nearest pool dominates", () => {
    const points = getMobileCoverMeshPoints(0);
    const weights = getMobileCoverMeshWeights(points, points[0]!.x, points[0]!.y);
    expect(weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
    expect(weights[0]).toBeGreaterThan(0.6);
  });

  test("the page's ink and secondary ink read over every blend of the pools, any cover, both schemes", () => {
    const points = getMobileCoverMeshPoints(0.37);
    const samples: Array<[number, number]> = [];
    for (let x = 0; x <= 1.0001; x += 0.125) for (let y = 0; y <= 1.0001; y += 0.125) samples.push([x, y]);
    let worst = Infinity;
    for (const scheme of ["light", "dark"] as const) {
      for (let mainHue = 0; mainHue < 360; mainHue += 30) {
        const main = mobileHslToRgb({ h: mainHue, s: 0.75, l: 0.5 });
        const palette = buildMobileCoverTintPalette(main, scheme);
        const ink = parseRgb(palette.ink);
        for (let offset = 60; offset < 360; offset += 90) {
          const regions = [0, 1, 2, 3].map((i) =>
            mobileHslToRgb({ h: (mainHue + offset * i) % 360, s: 0.4 + 0.15 * i, l: 0.25 + 0.15 * i }),
          );
          const colors = buildMobileCoverMeshColors(main, regions, scheme);
          const secondaryInk = buildMobileCoverMeshInkSecondary(main, colors, scheme);
          const inkAlpha = Number(/rgba\(\d+, \d+, \d+, ([\d.]+)\)/.exec(secondaryInk)?.[1] ?? 1);
          for (const [x, y] of samples) {
            const surface = blendMobileCoverMesh(colors, getMobileCoverMeshWeights(points, x, y));
            const contrast = mobileContrastRatio(ink, surface);
            worst = Math.min(worst, contrast);
            const secondary = {
              r: ink.r * inkAlpha + surface.r * (1 - inkAlpha),
              g: ink.g * inkAlpha + surface.g * (1 - inkAlpha),
              b: ink.b * inkAlpha + surface.b * (1 - inkAlpha),
            };
            expect(mobileContrastRatio(secondary, surface)).toBeGreaterThanOrEqual(4.5);
          }
        }
      }
    }
    expect(worst).toBeGreaterThanOrEqual(MOBILE_COVER_MESH_INK_CONTRAST);
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
