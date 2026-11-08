/**
 * Deterministic synthetic manga-page luma fixtures for alignment tests and
 * benchmarks. Sizes mirror the app: mobile decodes pages to a luma sample with
 * `sampleMax = ALIGNMENT_FINE_MAX_DEFAULT` (512 on the long side).
 */
import { resizeLuma, type LumaImage } from './image';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A page with white margins, panel borders, filled shapes and text-like strokes. */
export function makeSyntheticPage(width: number, height: number, seed: number): LumaImage {
  const rand = mulberry32(seed);
  const data = new Uint8Array(width * height).fill(245);
  const fillRect = (x0: number, y0: number, w: number, h: number, v: number) => {
    const xs = Math.max(0, Math.floor(x0));
    const ys = Math.max(0, Math.floor(y0));
    const xe = Math.min(width, Math.floor(x0 + w));
    const ye = Math.min(height, Math.floor(y0 + h));
    for (let y = ys; y < ye; y++) {
      for (let x = xs; x < xe; x++) data[y * width + x] = v;
    }
  };
  const marginX = Math.round(width * 0.06);
  const marginY = Math.round(height * 0.05);
  const innerW = width - marginX * 2;
  const innerH = height - marginY * 2;
  const rows = 3;
  for (let r = 0; r < rows; r++) {
    const py = marginY + (innerH / rows) * r;
    const ph = innerH / rows - 6;
    const cols = 1 + Math.floor(rand() * 2);
    for (let c = 0; c < cols; c++) {
      const px = marginX + (innerW / cols) * c;
      const pw = innerW / cols - 6;
      // Panel border.
      fillRect(px, py, pw, 3, 10);
      fillRect(px, py + ph - 3, pw, 3, 10);
      fillRect(px, py, 3, ph, 10);
      fillRect(px + pw - 3, py, 3, ph, 10);
      // Shapes.
      const shapes = 4 + Math.floor(rand() * 5);
      for (let s = 0; s < shapes; s++) {
        const sw = 8 + rand() * pw * 0.4;
        const sh = 8 + rand() * ph * 0.4;
        fillRect(px + 4 + rand() * (pw - sw - 8), py + 4 + rand() * (ph - sh - 8), sw, sh, Math.floor(rand() * 200));
      }
      // Text strokes.
      const lines = 3 + Math.floor(rand() * 4);
      const tx = px + 6 + rand() * pw * 0.5;
      const ty = py + 6 + rand() * ph * 0.4;
      for (let l = 0; l < lines; l++) {
        let cx = tx;
        const glyphs = 4 + Math.floor(rand() * 8);
        for (let g = 0; g < glyphs; g++) {
          fillRect(cx, ty + l * 9, 2 + rand() * 4, 6, 20);
          cx += 7;
        }
      }
    }
  }
  return { data, width, height };
}

/**
 * Derive a "secondary edition" of `page`: rescaled by `scale`, translated by
 * (dx, dy) pixels, output at `outW x outH`, with mild deterministic noise.
 */
export function deriveSecondary(
  page: LumaImage,
  opts: { scale: number; dx: number; dy: number; outW: number; outH: number; seed: number }
): LumaImage {
  const sw = Math.max(1, Math.round(page.width * opts.scale));
  const sh = Math.max(1, Math.round(page.height * opts.scale));
  const scaled = resizeLuma(page.data, page.width, page.height, sw, sh);
  const out = new Uint8Array(opts.outW * opts.outH).fill(245);
  const rand = mulberry32(opts.seed);
  for (let y = 0; y < opts.outH; y++) {
    const sy = y - opts.dy;
    for (let x = 0; x < opts.outW; x++) {
      const sx = x - opts.dx;
      let v = 245;
      if (sx >= 0 && sy >= 0 && sx < sw && sy < sh) v = scaled[sy * sw + sx] ?? 245;
      const noise = Math.floor((rand() - 0.5) * 12);
      out[y * opts.outW + x] = Math.max(0, Math.min(255, v + noise));
    }
  }
  return { data: out, width: opts.outW, height: opts.outH };
}

export type AlignmentFixture = { name: string; primary: LumaImage; secondary: LumaImage };

/** Realistic app sizes: 512 long side (portrait pages and a landscape spread). */
export function buildAlignmentFixtures(): AlignmentFixture[] {
  const portrait = makeSyntheticPage(362, 512, 1);
  const spread = makeSyntheticPage(512, 362, 7);
  return [
    {
      name: 'portrait-shifted-scaled',
      primary: portrait,
      secondary: deriveSecondary(portrait, { scale: 0.96, dx: 9, dy: -6, outW: 360, outH: 512, seed: 2 }),
    },
    {
      name: 'portrait-identity-noise',
      primary: portrait,
      secondary: deriveSecondary(portrait, { scale: 1, dx: 0, dy: 0, outW: 362, outH: 512, seed: 3 }),
    },
    {
      // Unrelated pages: low confidence, exercises the brute-force fallback path.
      name: 'portrait-unrelated',
      primary: portrait,
      secondary: makeSyntheticPage(358, 512, 99),
    },
    {
      name: 'spread-shifted',
      primary: spread,
      secondary: deriveSecondary(spread, { scale: 1.04, dx: -12, dy: 5, outW: 512, outH: 360, seed: 4 }),
    },
  ];
}
