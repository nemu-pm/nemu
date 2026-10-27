import { describe, expect, it } from 'bun:test';
import { runStepsCooperatively } from './alignment-cooperative';
import {
  computeMultiDhash,
  computeMultiDhashSteps,
  createDhashWord,
  type Dhash,
  type DhashInput,
  type MultiDhash,
} from './hash';
import { resizeLuma, resizeLumaSteps, toLuma, toLumaSteps, type AlignmentSteps, type LumaImage } from './image';
import { buildMergeLuma, buildMergeLumaSteps, buildSplitLuma, buildSplitLumaSteps } from './visual-alignment';
import { makeSyntheticPage } from './visual-alignment.fixtures';

// ---------------------------------------------------------------------------
// Reference: the pre-chunking synchronous implementations, copied verbatim so
// the step variants are checked against the original code, not against
// themselves.
// ---------------------------------------------------------------------------
function refToLuma(input: DhashInput): Uint8Array {
  const channels = Math.max(1, Math.trunc(input.channels ?? 4));
  const width = Math.max(1, Math.trunc(input.width));
  const height = Math.max(1, Math.trunc(input.height));
  const length = width * height;
  const out = new Uint8Array(length);
  const data = input.data;
  if (channels === 1) {
    for (let i = 0; i < length; i++) out[i] = data[i] ?? 0;
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

function refComputeDhashFromLuma(luma: Uint8Array, width: number, height: number): Dhash {
  const w = Math.max(1, Math.trunc(width));
  const h = Math.max(1, Math.trunc(height));
  const hBuf = resizeLuma(luma, w, h, 9, 8);
  let hHigh = 0;
  let hLow = 0;
  let bit = 0;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const a = hBuf[y * 9 + x] ?? 0;
      const b = hBuf[y * 9 + x + 1] ?? 0;
      if (a > b) {
        if (bit < 32) {
          hLow = (hLow | (1 << bit)) >>> 0;
        } else {
          hHigh = (hHigh | (1 << (bit - 32))) >>> 0;
        }
      }
      bit += 1;
    }
  }

  const vBuf = resizeLuma(luma, w, h, 8, 9);
  let vHigh = 0;
  let vLow = 0;
  bit = 0;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const a = vBuf[y * 8 + x] ?? 0;
      const b = vBuf[(y + 1) * 8 + x] ?? 0;
      if (a > b) {
        if (bit < 32) {
          vLow = (vLow | (1 << bit)) >>> 0;
        } else {
          vHigh = (vHigh | (1 << (bit - 32))) >>> 0;
        }
      }
      bit += 1;
    }
  }

  return {
    h: createDhashWord(hHigh, hLow),
    v: createDhashWord(vHigh, vLow),
  };
}

function refSliceLuma(
  luma: Uint8Array,
  width: number,
  height: number,
  rect: { left: number; top: number; width: number; height: number }
): Uint8Array {
  const out = new Uint8Array(rect.width * rect.height);
  for (let y = 0; y < rect.height; y++) {
    const srcY = rect.top + y;
    if (srcY < 0 || srcY >= height) continue;
    const srcRow = srcY * width;
    const dstRow = y * rect.width;
    for (let x = 0; x < rect.width; x++) {
      const srcX = rect.left + x;
      if (srcX < 0 || srcX >= width) continue;
      out[dstRow + x] = luma[srcRow + srcX] ?? 0;
    }
  }
  return out;
}

function refFindContentRectFromLuma(
  luma: Uint8Array,
  width: number,
  height: number,
  opts?: { threshold?: number; minFillRatio?: number; minAreaRatio?: number; maxInsetRatio?: number }
): { left: number; top: number; width: number; height: number } | null {
  const threshold = opts?.threshold ?? 8;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let count = 0;
  const total = width * height;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if ((luma[row + x] ?? 0) > threshold) {
        count += 1;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (count === 0) return null;
  const fillRatio = count / total;
  if (fillRatio < (opts?.minFillRatio ?? 0.08)) return null;
  if (maxX < minX || maxY < minY) return null;
  const boxW = maxX - minX + 1;
  const boxH = maxY - minY + 1;
  const areaRatio = (boxW * boxH) / total;
  if (areaRatio < (opts?.minAreaRatio ?? 0.4)) return null;
  const maxInsetRatio = opts?.maxInsetRatio ?? 0.92;
  if (boxW / width >= maxInsetRatio && boxH / height >= maxInsetRatio) return null;
  return { left: minX, top: minY, width: boxW, height: boxH };
}

function refComputeMultiDhash(
  input: DhashInput,
  opts?: { split?: boolean; centerCropRatio?: number; luma?: Uint8Array }
): MultiDhash {
  const width = Math.max(1, Math.trunc(input.width));
  const height = Math.max(1, Math.trunc(input.height));
  const luma = opts?.luma ?? refToLuma({ ...input, width, height });
  const full = refComputeDhashFromLuma(luma, width, height);
  if (!opts?.split) return { full };

  const trimRect = refFindContentRectFromLuma(luma, width, height);
  const baseRect = trimRect ?? { left: 0, top: 0, width, height };
  const midX = Math.max(1, Math.floor(baseRect.width / 2));
  const midY = Math.max(1, Math.floor(baseRect.height / 2));

  const leftLuma = refSliceLuma(luma, width, height, {
    left: baseRect.left,
    top: baseRect.top,
    width: midX,
    height: baseRect.height,
  });
  const rightLuma = refSliceLuma(luma, width, height, {
    left: baseRect.left + midX,
    top: baseRect.top,
    width: baseRect.width - midX,
    height: baseRect.height,
  });
  const topLuma = refSliceLuma(luma, width, height, {
    left: baseRect.left,
    top: baseRect.top,
    width: baseRect.width,
    height: midY,
  });
  const bottomLuma = refSliceLuma(luma, width, height, {
    left: baseRect.left,
    top: baseRect.top + midY,
    width: baseRect.width,
    height: baseRect.height - midY,
  });

  const left = refComputeDhashFromLuma(leftLuma, midX, baseRect.height);
  const right = refComputeDhashFromLuma(rightLuma, baseRect.width - midX, baseRect.height);
  const top = refComputeDhashFromLuma(topLuma, baseRect.width, midY);
  const bottom = refComputeDhashFromLuma(bottomLuma, baseRect.width, baseRect.height - midY);
  let center: Dhash | undefined;
  if (typeof opts.centerCropRatio === 'number') {
    const ratio = Math.max(0.1, Math.min(1, opts.centerCropRatio));
    const cropW = Math.max(1, Math.floor(baseRect.width * ratio));
    const cropH = Math.max(1, Math.floor(baseRect.height * ratio));
    const cropLeft = Math.max(0, Math.floor(baseRect.left + (baseRect.width - cropW) / 2));
    const cropTop = Math.max(0, Math.floor(baseRect.top + (baseRect.height - cropH) / 2));
    const centerLuma = refSliceLuma(luma, width, height, { left: cropLeft, top: cropTop, width: cropW, height: cropH });
    center = refComputeDhashFromLuma(centerLuma, cropW, cropH);
  }

  const trimmed = trimRect
    ? refComputeDhashFromLuma(refSliceLuma(luma, width, height, trimRect), trimRect.width, trimRect.height)
    : undefined;

  return { full, left, right, top, bottom, center, trimmed };
}

function refBuildSplitLuma(source: LumaImage, side: 'left' | 'right'): LumaImage {
  const width = Math.max(1, Math.trunc(source.width));
  const height = Math.max(1, Math.trunc(source.height));
  const leftWidth = Math.floor(width / 2);
  const rightWidth = Math.max(1, width - leftWidth);
  const cropWidth = side === 'left' ? leftWidth : rightWidth;
  const startX = side === 'left' ? 0 : width - cropWidth;
  const out = new Uint8Array(cropWidth * height);
  for (let y = 0; y < height; y++) {
    const srcRow = y * width;
    const dstRow = y * cropWidth;
    for (let x = 0; x < cropWidth; x++) {
      out[dstRow + x] = source.data[srcRow + startX + x] ?? 0;
    }
  }
  return { data: out, width: cropWidth, height };
}

function refBuildMergeLuma(left: LumaImage, right: LumaImage, order: 'normal' | 'swap'): LumaImage {
  const leftImg = order === 'normal' ? left : right;
  const rightImg = order === 'normal' ? right : left;
  const targetHeight = Math.max(leftImg.height, rightImg.height);
  const leftScale = targetHeight / Math.max(1, leftImg.height);
  const rightScale = targetHeight / Math.max(1, rightImg.height);
  const leftWidth = Math.max(1, Math.round(leftImg.width * leftScale));
  const rightWidth = Math.max(1, Math.round(rightImg.width * rightScale));
  const leftResized = resizeLuma(leftImg.data, leftImg.width, leftImg.height, leftWidth, targetHeight);
  const rightResized = resizeLuma(rightImg.data, rightImg.width, rightImg.height, rightWidth, targetHeight);
  const outWidth = leftWidth + rightWidth;
  const out = new Uint8Array(outWidth * targetHeight);
  for (let y = 0; y < targetHeight; y++) {
    const row = y * outWidth;
    const leftRow = y * leftWidth;
    const rightRow = y * rightWidth;
    out.set(leftResized.subarray(leftRow, leftRow + leftWidth), row);
    out.set(rightResized.subarray(rightRow, rightRow + rightWidth), row + leftWidth);
  }
  return { data: out, width: outWidth, height: targetHeight };
}

// ---------------------------------------------------------------------------

function drain<T>(steps: AlignmentSteps<T>): T {
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
  }
}

/** Decoded-page-like RGBA: synthetic panels, colour noise, dark letterbox bars. */
function makeRgbaPage(width: number, height: number, seed: number, border = 0): DhashInput {
  const luma = makeSyntheticPage(width, height, seed).data;
  const data = new Uint8ClampedArray(width * height * 4);
  let s = seed >>> 0;
  for (let i = 0; i < width * height; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const x = i % width;
    const y = Math.floor(i / width);
    const inBorder = x < border || y < border || x >= width - border || y >= height - border;
    const v = inBorder ? 0 : luma[i] ?? 0;
    data[i * 4] = Math.min(255, v + (s & 15));
    data[i * 4 + 1] = Math.max(0, v - ((s >>> 4) & 7));
    data[i * 4 + 2] = Math.min(255, v + ((s >>> 8) & 31));
    data[i * 4 + 3] = 255;
  }
  return { data, width, height, channels: 4 };
}

const always = () => true;
const microtaskYield = () => Promise.resolve();

describe('cooperative dual-reader hashing / split / merge', () => {
  it('toLumaSteps and resizeLumaSteps are bit-identical to the reference', () => {
    const rgba = makeRgbaPage(301, 517, 3, 9);
    const luma = drain(toLumaSteps(rgba, always));
    expect(luma).toEqual(refToLuma(rgba));
    expect(toLuma(rgba)).toEqual(refToLuma(rgba));
    for (const [tw, th] of [
      [9, 8],
      [8, 9],
      [64, 64],
      [150, 258],
      [301, 517],
      [602, 1034],
      [1, 1],
    ] as const) {
      expect(drain(resizeLumaSteps(luma, 301, 517, tw, th, always))).toEqual(resizeLuma(luma, 301, 517, tw, th));
    }
  });

  const cases: Array<{ name: string; input: DhashInput; opts: Parameters<typeof computeMultiDhash>[1] }> = [
    { name: '724x1024 letterboxed, split+center', input: makeRgbaPage(724, 1024, 11, 40), opts: { split: true, centerCropRatio: 0.7 } },
    { name: '724x1024 full-bleed, split', input: makeRgbaPage(724, 1024, 12), opts: { split: true } },
    { name: '1448x1024 spread, split+center', input: makeRgbaPage(1448, 1024, 13, 24), opts: { split: true, centerCropRatio: 0.5 } },
    { name: '33x17 tiny, split+center', input: makeRgbaPage(33, 17, 14, 2), opts: { split: true, centerCropRatio: 0.7 } },
    { name: '200x300 full only', input: makeRgbaPage(200, 300, 15), opts: undefined },
  ];
  for (const c of cases) {
    it(`computeMultiDhash(+Steps) is bit-identical to the reference (${c.name})`, () => {
      const ref: MultiDhash = refComputeMultiDhash(c.input, c.opts);
      expect(computeMultiDhash(c.input, c.opts)).toEqual(ref);
      expect(drain(computeMultiDhashSteps(c.input, c.opts, always))).toEqual(ref);
      if (c.opts?.split) expect(ref.left).toBeDefined();
      if (c.name.includes('letterboxed')) expect(ref.trimmed).toBeDefined();
    });
  }

  it('buildSplitLuma / buildMergeLuma (+Steps) are bit-identical to the reference', () => {
    const a = makeSyntheticPage(362, 512, 21);
    const b = makeSyntheticPage(301, 431, 22);
    const odd = makeSyntheticPage(363, 511, 23);
    for (const src of [a, odd]) {
      for (const side of ['left', 'right'] as const) {
        const ref = refBuildSplitLuma(src, side);
        expect(buildSplitLuma(src, side)).toEqual(ref);
        expect(drain(buildSplitLumaSteps(src, side, always))).toEqual(ref);
      }
    }
    for (const order of ['normal', 'swap'] as const) {
      const ref = refBuildMergeLuma(a, b, order);
      expect(buildMergeLuma(a, b, order)).toEqual(ref);
      expect(drain(buildMergeLumaSteps(a, b, order, always))).toEqual(ref);
    }
  });

  it('hash pipeline runs cooperatively in many bounded slices with the same result', async () => {
    const input = makeRgbaPage(724, 1024, 31, 40);
    const opts = { split: true, centerCropRatio: 0.7 };
    const ref = refComputeMultiDhash(input, opts);
    // Deterministic clock: every clock read costs 1 "ms", so a 6 ms budget must
    // end each slice after a handful of checkpoints regardless of machine load.
    let clock = 0;
    let checkpointsInSlice = 0;
    let maxCheckpointsInSlice = 0;
    const { value, stats } = await runStepsCooperatively(
      (pace) =>
        computeMultiDhashSteps(input, opts, () => {
          checkpointsInSlice += 1;
          maxCheckpointsInSlice = Math.max(maxCheckpointsInSlice, checkpointsInSlice);
          return pace();
        }),
      {
        sliceBudgetMs: 6,
        now: () => (clock += 1),
        yieldToHost: async () => {
          checkpointsInSlice = 0;
          await microtaskYield();
        },
      }
    );
    expect(value).toEqual(ref);
    expect(stats.slices).toBeGreaterThan(50);
    expect(maxCheckpointsInSlice).toBeLessThanOrEqual(6);
  });

  it('aborting stops the hash run between slices', async () => {
    const input = makeRgbaPage(724, 1024, 32, 40);
    const controller = new AbortController();
    let slices = 0;
    const run = runStepsCooperatively(
      (pace) => computeMultiDhashSteps(input, { split: true, centerCropRatio: 0.7 }, pace),
      {
        sliceBudgetMs: 0,
        signal: controller.signal,
        yieldToHost: async () => {
          slices += 1;
          if (slices === 3) controller.abort();
          await microtaskYield();
        },
      }
    );
    await expect(run).rejects.toMatchObject({ name: 'AbortError' });
    expect(slices).toBe(3);
  });

  it('yields are fine-grained: every checkpoint gap stays small', () => {
    const input = makeRgbaPage(724, 1024, 33, 40);
    const opts = { split: true, centerCropRatio: 0.7 };
    drain(computeMultiDhashSteps(input, opts, always)); // warm-up
    const steps = computeMultiDhashSteps(input, opts, always);
    let maxGap = 0;
    let count = 0;
    for (;;) {
      const t = performance.now();
      const r = steps.next();
      maxGap = Math.max(maxGap, performance.now() - t);
      count += 1;
      if (r.done) break;
    }
    expect(count).toBeGreaterThan(50);
    // Measured ~2 ms in bun; loose bound for contended CI (product ceiling 50 ms).
    expect(maxGap).toBeLessThan(40);
  });
});
