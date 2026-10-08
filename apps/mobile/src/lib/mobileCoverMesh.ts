import {
  buildMobileCoverTintPalette,
  mobileContrastRatio,
  mobileHslToRgb,
  mobileRgbToHsl,
  pickMobileCoverTint,
  type MobileCoverRgb,
} from "./mobileCoverTint";

/**
 * The living page behind the detail hero (design-explore): four colours from
 * the cover's own regions (top-left, top-right, bottom-left, bottom-right),
 * each turned into a page colour the way the single page tint is, blended as
 * soft overlapping pools that drift slowly around a loop of eight positions.
 * Pure maths here; the Skia shader lives in `MobileCoverMeshBackground.tsx`.
 */

type MobileCoverMeshPoint = { x: number; y: number };

/**
 * Eight places around the page (x across, y down, 0…1). The four colours sit
 * on every other place and all move one place on together, so the pools
 * orbit the page and swap corners over a loop.
 */
export const MOBILE_COVER_MESH_LOOP: readonly MobileCoverMeshPoint[] = [
  { x: 0.8, y: 0.1 },
  { x: 0.6, y: 0.2 },
  { x: 0.35, y: 0.25 },
  { x: 0.25, y: 0.6 },
  { x: 0.2, y: 0.9 },
  { x: 0.4, y: 0.8 },
  { x: 0.65, y: 0.75 },
  { x: 0.75, y: 0.4 },
];

/** A pool's reach: its weight falls to zero this far from its centre (page widths). */
export const MOBILE_COVER_MESH_REACH = 0.92;

/** Weights of the four pools at a point of the page (sum to 1), as the shader computes them. */
export function parseRgb(value: string): MobileCoverRgb {
  const match = /rgba?\((\d+), (\d+), (\d+)/.exec(value);
  return match
    ? { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]) }
    : { r: 128, g: 128, b: 128 };
}

/**
 * Region tints of a downsampled cover (RGBA, `width` × `height`): the
 * picker's colour for each quarter, top-left, top-right, bottom-left,
 * bottom-right. A quarter with no opaque pixels takes the whole cover's tint.
 */
export function pickMobileCoverRegionTints(
  pixels: ArrayLike<number>,
  width: number,
  height: number,
): MobileCoverRgb[] | null {
  const whole = pickMobileCoverTint(pixels);
  if (!whole) return null;
  const halfW = Math.ceil(width / 2);
  const halfH = Math.ceil(height / 2);
  const regions: MobileCoverRgb[] = [];
  for (const [x0, y0] of [
    [0, 0],
    [halfW, 0],
    [0, halfH],
    [halfW, halfH],
  ] as const) {
    const x1 = x0 === 0 ? halfW : width;
    const y1 = y0 === 0 ? halfH : height;
    const quarter = new Uint8Array((x1 - x0) * (y1 - y0) * 4);
    let offset = 0;
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const at = (y * width + x) * 4;
        quarter[offset] = pixels[at]!;
        quarter[offset + 1] = pixels[at + 1]!;
        quarter[offset + 2] = pixels[at + 2]!;
        quarter[offset + 3] = pixels[at + 3]!;
        offset += 4;
      }
    }
    regions.push(pickMobileCoverTint(quarter) ?? whole);
  }
  return regions;
}

/**
 * Lightness of each pool relative to the page, per scheme: the pools are a
 * little lighter and darker than the page (and a little more colourful), so
 * even a cover of one colour moves. Within the band where the page's ink
 * still reads (checked per pool below and by tests).
 */
const POOL_LIGHTNESS = { light: [-0.045, 0.025, -0.015, -0.06], dark: [0.05, -0.04, 0.08, 0.01] } as const;
const POOL_SATURATION_GAIN = { light: 1.05, dark: 1.25 } as const;
/**
 * Light mode: a multi-colour cover gave a page of loud, unrelated pastels.
 * Each pool is pulled toward the main page colour — at least this share, more
 * the further its hue is from it — so the cover's leading colour carries the
 * page and the others only shade it. Dark pages, deep and quiet already, keep
 * the full spread.
 */
const LIGHT_POOL_UNIFY = { base: 0.4, hueFar: 0.3, hueRange: 90 } as const;

function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** Text on the page reads at least this well over every blend of the pools. */
const MOBILE_COVER_MESH_INK_CONTRAST = 4.5;

/**
 * The four page colours for the mesh: each region's colour run through the
 * page rules of its scheme (the single page tint's lightness and saturation),
 * then made a step lighter or darker and a little more colourful per pool. A
 * pool the page's ink (taken from the main colour, as everywhere else on the
 * page) would not read on is pulled toward the plain page colour until it
 * does, so no pool can sink the title.
 */
export function buildMobileCoverMeshColors(
  main: MobileCoverRgb | null,
  regions: readonly MobileCoverRgb[] | null,
  scheme: "light" | "dark",
): MobileCoverRgb[] {
  const base = buildMobileCoverTintPalette(main, scheme);
  const page = parseRgb(base.page);
  if (!main || !regions || regions.length !== 4) return [page, page, page, page];
  const ink = parseRgb(base.ink);
  const reads = (surface: MobileCoverRgb) =>
    mobileContrastRatio(ink, surface) >= MOBILE_COVER_MESH_INK_CONTRAST + 0.6;
  const pageHsl = mobileRgbToHsl(page);
  return regions.map((region, index) => {
    const regionPage = mobileRgbToHsl(parseRgb(buildMobileCoverTintPalette(region, scheme).page));
    let candidate = mobileHslToRgb({
      h: regionPage.h,
      s: Math.min(0.9, regionPage.s * POOL_SATURATION_GAIN[scheme]),
      l: Math.min(0.95, Math.max(0.05, regionPage.l + POOL_LIGHTNESS[scheme][index]!)),
    });
    if (scheme === "light") {
      const far = Math.min(1, hueDistance(regionPage.h, pageHsl.h) / LIGHT_POOL_UNIFY.hueRange);
      const share = LIGHT_POOL_UNIFY.base + LIGHT_POOL_UNIFY.hueFar * far;
      candidate = {
        r: Math.round(candidate.r + (page.r - candidate.r) * share),
        g: Math.round(candidate.g + (page.g - candidate.g) * share),
        b: Math.round(candidate.b + (page.b - candidate.b) * share),
      };
    }
    // Walk from the region's page colour toward the main page colour until
    // the page's text reads on it.
    for (let share = 0; share <= 1.0001; share += 0.1) {
      const mixed = {
        r: Math.round(candidate.r + (page.r - candidate.r) * share),
        g: Math.round(candidate.g + (page.g - candidate.g) * share),
        b: Math.round(candidate.b + (page.b - candidate.b) * share),
      };
      if (reads(mixed)) return mixed;
    }
    return page;
  });
}

/**
 * Secondary text on the living page (authors, the synopsis): the page's ink
 * at the lowest opacity, from the page's own secondary opacity up, that clears
 * AA over every pool. Blends between pools lie between them, so they clear it
 * too (tested).
 */
export function buildMobileCoverMeshInkSecondary(
  main: MobileCoverRgb | null,
  colors: readonly MobileCoverRgb[],
  scheme: "light" | "dark",
): string {
  const base = buildMobileCoverTintPalette(main, scheme);
  const ink = parseRgb(base.ink);
  const start = Number(/rgba\(\d+, \d+, \d+, ([\d.]+)\)/.exec(base.inkSecondary)?.[1] ?? 1);
  for (let alpha = start; alpha < 0.95; alpha += 0.02) {
    const readable = colors.every((surface) => {
      const blended = {
        r: ink.r * alpha + surface.r * (1 - alpha),
        g: ink.g * alpha + surface.g * (1 - alpha),
        b: ink.b * alpha + surface.b * (1 - alpha),
      };
      return mobileContrastRatio(blended, surface) >= MOBILE_COVER_MESH_INK_CONTRAST + 0.15;
    });
    if (readable) return `rgba(${ink.r}, ${ink.g}, ${ink.b}, ${Math.round(alpha * 100) / 100})`;
  }
  return `rgba(${ink.r}, ${ink.g}, ${ink.b}, 0.95)`;
}

/**
 * True when the pools are too alike for movement to show (a one-colour
 * cover); the page then stays still and costs nothing.
 */
export function isMobileCoverMeshFlat(colors: readonly MobileCoverRgb[]): boolean {
  const hsl = colors.map(mobileRgbToHsl);
  for (let i = 0; i < colors.length; i += 1) {
    for (let j = i + 1; j < colors.length; j += 1) {
      const a = colors[i]!;
      const b = colors[j]!;
      if (Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b) > 30) return false;
      if (Math.abs(hsl[i]!.s - hsl[j]!.s) > 0.12) return false;
    }
  }
  return true;
}

/** Shader-ready colours (0…1 floats). */
export function mobileCoverMeshUniformColor({ r, g, b }: MobileCoverRgb): [number, number, number, number] {
  return [r / 255, g / 255, b / 255, 1];
}
