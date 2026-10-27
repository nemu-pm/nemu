import type { DhashInput } from './hash';

export type LumaImage = {
  data: Uint8Array;
  width: number;
  height: number;
};

function toLumaRange(
  data: Uint8Array | Uint8ClampedArray,
  channels: number,
  out: Uint8Array,
  i0: number,
  i1: number
): void {
  if (channels === 1) {
    for (let i = i0; i < i1; i++) {
      out[i] = data[i] ?? 0;
    }
    return;
  }
  for (let i = i0; i < i1; i++) {
    const base = i * channels;
    const r = data[base] ?? 0;
    const g = data[base + 1] ?? 0;
    const b = data[base + 2] ?? 0;
    out[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }
}

export function toLuma(input: DhashInput): Uint8Array {
  const channels = Math.max(1, Math.trunc(input.channels ?? 4));
  const width = Math.max(1, Math.trunc(input.width));
  const height = Math.max(1, Math.trunc(input.height));
  const length = width * height;
  const out = new Uint8Array(length);
  toLumaRange(input.data, channels, out, 0, length);
  return out;
}

/** Pixels processed between checkpoints by flat image kernels. */
const IMAGE_CHUNK_PIXELS = 16384;

/** Step variant of `toLuma` (bit-identical); checkpoints every 16K pixels. */
export function* toLumaSteps(input: DhashInput, pace: AlignmentPace): AlignmentSteps<Uint8Array> {
  const channels = Math.max(1, Math.trunc(input.channels ?? 4));
  const width = Math.max(1, Math.trunc(input.width));
  const height = Math.max(1, Math.trunc(input.height));
  const length = width * height;
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i += IMAGE_CHUNK_PIXELS) {
    toLumaRange(input.data, channels, out, i, Math.min(length, i + IMAGE_CHUNK_PIXELS));
    if (pace()) yield;
  }
  return out;
}

/**
 * Cooperative checkpoint used by the step (generator) variants: performs any
 * abort check and returns `true` when the caller should yield to the host.
 */
export type AlignmentPace = () => boolean;

/** Generator protocol for cooperative work: yields `void` at checkpoints, returns `T`. */
export type AlignmentSteps<T> = Generator<void, T, void>;

function resizeLumaRows(
  luma: Uint8Array,
  width: number,
  height: number,
  targetW: number,
  targetH: number,
  out: Uint8Array,
  yStart: number,
  yEnd: number
): void {
  const scaleX = width / targetW;
  const scaleY = height / targetH;
  for (let y = yStart; y < yEnd; y++) {
    const srcY0 = Math.floor(y * scaleY);
    const srcY1 = Math.min(height, Math.max(srcY0 + 1, Math.floor((y + 1) * scaleY)));
    for (let x = 0; x < targetW; x++) {
      const srcX0 = Math.floor(x * scaleX);
      const srcX1 = Math.min(width, Math.max(srcX0 + 1, Math.floor((x + 1) * scaleX)));
      let sum = 0;
      let count = 0;
      for (let yy = srcY0; yy < srcY1; yy++) {
        const row = yy * width;
        for (let xx = srcX0; xx < srcX1; xx++) {
          sum += luma[row + xx] ?? 0;
          count += 1;
        }
      }
      out[y * targetW + x] = count > 0 ? Math.round(sum / count) : 0;
    }
  }
}

export function resizeLuma(
  luma: Uint8Array,
  width: number,
  height: number,
  targetW: number,
  targetH: number
): Uint8Array {
  const out = new Uint8Array(targetW * targetH);
  resizeLumaRows(luma, width, height, targetW, targetH, out, 0, targetH);
  return out;
}

/** Accumulate source rows [yy0, yy1) of every output pixel of one output row (integer sums). */
function resizeLumaBand(
  luma: Uint8Array,
  width: number,
  targetW: number,
  scaleX: number,
  yy0: number,
  yy1: number,
  sums: Float64Array,
  counts: Float64Array
): void {
  for (let x = 0; x < targetW; x++) {
    const srcX0 = Math.floor(x * scaleX);
    const srcX1 = Math.min(width, Math.max(srcX0 + 1, Math.floor((x + 1) * scaleX)));
    let sum = 0;
    let count = 0;
    for (let yy = yy0; yy < yy1; yy++) {
      const row = yy * width;
      for (let xx = srcX0; xx < srcX1; xx++) {
        sum += luma[row + xx] ?? 0;
        count += 1;
      }
    }
    sums[x] += sum;
    counts[x] += count;
  }
}

/**
 * Step variant of `resizeLuma` (bit-identical). Checkpoints after every output
 * row; when one output row spans a large source band (strong downscales such
 * as the 9x8 dHash grid) the band itself is split into ~16K-pixel chunks. The
 * per-pixel sums are exact integers, so splitting cannot change the result.
 */
export function* resizeLumaSteps(
  luma: Uint8Array,
  width: number,
  height: number,
  targetW: number,
  targetH: number,
  pace: AlignmentPace
): AlignmentSteps<Uint8Array> {
  const out = new Uint8Array(targetW * targetH);
  const scaleX = width / targetW;
  const scaleY = height / targetH;
  const bandRows = Math.max(1, Math.floor(IMAGE_CHUNK_PIXELS / Math.max(1, width)));
  let sums: Float64Array | null = null;
  let counts: Float64Array | null = null;
  for (let y = 0; y < targetH; y++) {
    const srcY0 = Math.floor(y * scaleY);
    const srcY1 = Math.min(height, Math.max(srcY0 + 1, Math.floor((y + 1) * scaleY)));
    if (srcY1 - srcY0 <= bandRows) {
      resizeLumaRows(luma, width, height, targetW, targetH, out, y, y + 1);
    } else {
      sums = sums ?? new Float64Array(targetW);
      counts = counts ?? new Float64Array(targetW);
      sums.fill(0);
      counts.fill(0);
      for (let yy = srcY0; yy < srcY1; yy += bandRows) {
        resizeLumaBand(luma, width, targetW, scaleX, yy, Math.min(srcY1, yy + bandRows), sums, counts);
        if (pace()) yield;
      }
      for (let x = 0; x < targetW; x++) {
        const count = counts[x]!;
        out[y * targetW + x] = count > 0 ? Math.round(sums[x]! / count) : 0;
      }
    }
    if (pace()) yield;
  }
  return out;
}

export function downsampleToMax(luma: Uint8Array, width: number, height: number, maxSize: number): LumaImage {
  const w = Math.max(1, Math.trunc(width));
  const h = Math.max(1, Math.trunc(height));
  const maxDim = Math.max(w, h);
  if (maxDim <= maxSize) {
    return { data: luma, width: w, height: h };
  }
  const scale = maxSize / maxDim;
  const targetW = Math.max(1, Math.round(w * scale));
  const targetH = Math.max(1, Math.round(h * scale));
  const data = resizeLuma(luma, w, h, targetW, targetH);
  return { data, width: targetW, height: targetH };
}

/** Step variant of `downsampleToMax` (bit-identical). */
export function* downsampleToMaxSteps(
  luma: Uint8Array,
  width: number,
  height: number,
  maxSize: number,
  pace: AlignmentPace
): AlignmentSteps<LumaImage> {
  const w = Math.max(1, Math.trunc(width));
  const h = Math.max(1, Math.trunc(height));
  const maxDim = Math.max(w, h);
  if (maxDim <= maxSize) {
    return { data: luma, width: w, height: h };
  }
  const scale = maxSize / maxDim;
  const targetW = Math.max(1, Math.round(w * scale));
  const targetH = Math.max(1, Math.round(h * scale));
  const data = yield* resizeLumaSteps(luma, w, h, targetW, targetH, pace);
  return { data, width: targetW, height: targetH };
}

function computeGradientRows(luma: Uint8Array, w: number, out: Uint8Array, yStart: number, yEnd: number): void {
  for (let y = yStart; y < yEnd; y++) {
    const row = y * w;
    for (let x = 1; x < w - 1; x++) {
      const idx = row + x;
      const dx = Math.abs((luma[idx + 1] ?? 0) - (luma[idx - 1] ?? 0));
      const dy = Math.abs((luma[idx + w] ?? 0) - (luma[idx - w] ?? 0));
      const g = dx + dy;
      out[idx] = g > 255 ? 255 : g;
    }
  }
}

export function computeGradient(luma: Uint8Array, width: number, height: number): Uint8Array {
  const w = Math.max(1, Math.trunc(width));
  const h = Math.max(1, Math.trunc(height));
  const out = new Uint8Array(w * h);
  if (w < 3 || h < 3) {
    return out;
  }
  computeGradientRows(luma, w, out, 1, h - 1);
  return out;
}

/** Step variant of `computeGradient` (bit-identical); checkpoints every 8 rows. */
export function* computeGradientSteps(
  luma: Uint8Array,
  width: number,
  height: number,
  pace: AlignmentPace
): AlignmentSteps<Uint8Array> {
  const w = Math.max(1, Math.trunc(width));
  const h = Math.max(1, Math.trunc(height));
  const out = new Uint8Array(w * h);
  if (w < 3 || h < 3) {
    return out;
  }
  for (let y = 1; y < h - 1; y += 8) {
    computeGradientRows(luma, w, out, y, Math.min(h - 1, y + 8));
    if (pace()) yield;
  }
  return out;
}
