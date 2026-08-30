import type { DhashInput } from './hash';

export type LumaImage = {
  data: Uint8Array;
  width: number;
  height: number;
};

export function toLuma(input: DhashInput): Uint8Array {
  const channels = Math.max(1, Math.trunc(input.channels ?? 4));
  const width = Math.max(1, Math.trunc(input.width));
  const height = Math.max(1, Math.trunc(input.height));
  const length = width * height;
  const out = new Uint8Array(length);
  const data = input.data;

  if (channels === 1) {
    for (let i = 0; i < length; i++) {
      out[i] = data[i] ?? 0;
    }
    return out;
  }

  for (let i = 0; i < length; i++) {
    const base = i * channels;
    const r = data[base] ?? 0;
    const g = data[base + 1] ?? 0;
    const b = data[base + 2] ?? 0;
    out[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }
  return out;
}

export function resizeLuma(
  luma: Uint8Array,
  width: number,
  height: number,
  targetW: number,
  targetH: number
): Uint8Array {
  const out = new Uint8Array(targetW * targetH);
  const scaleX = width / targetW;
  const scaleY = height / targetH;
  for (let y = 0; y < targetH; y++) {
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

export function computeGradient(luma: Uint8Array, width: number, height: number): Uint8Array {
  const w = Math.max(1, Math.trunc(width));
  const h = Math.max(1, Math.trunc(height));
  const out = new Uint8Array(w * h);
  if (w < 3 || h < 3) {
    return out;
  }
  for (let y = 1; y < h - 1; y++) {
    const row = y * w;
    for (let x = 1; x < w - 1; x++) {
      const idx = row + x;
      const dx = Math.abs((luma[idx + 1] ?? 0) - (luma[idx - 1] ?? 0));
      const dy = Math.abs((luma[idx + w] ?? 0) - (luma[idx - w] ?? 0));
      const g = dx + dy;
      out[idx] = g > 255 ? 255 : g;
    }
  }
  return out;
}
