import FFT from 'fft.js';
import type { KissFftModule, FftWasmProvider } from './fft';
import type { DhashInput } from './hash';
import {
  computeGradientSteps,
  downsampleToMaxSteps,
  resizeLumaSteps,
  toLuma,
  type AlignmentPace,
  type AlignmentSteps,
  type LumaImage,
} from './image';
import { buildAlignmentOptions } from './alignment-options';

export type AlignmentInsets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type AlignmentResult = {
  crop: AlignmentInsets;
  scale: number;
  dx: number;
  dy: number;
  confidence: number;
  score: number;
  identityScore: number;
  coverage: number;
  timings?: AlignmentTimings;
  debug?: AlignmentDebug;
};

export type AlignmentTimings = {
  totalMs: number;
  downsampleMs: number;
  insetsMs: number;
  gradientsMs: number;
  fftDownsampleMs: number;
  coarsePrepMs: number;
  coarseSearchMs: number;
  finePrepMs: number;
  fineSearchMs: number;
  refineScaleMs: number;
  identityMs: number;
  fallbackMs: number;
};

export type AlignmentDebug = {
  scalePrior: number | null;
  scaleWindow: number;
  scaleStep: number;
  fineScaleCount: number;
  coarseScaleCount: number;
  fftMax: number;
  fftPolicy: FftPolicy;
  fftBudget: number;
  fftPadW: number;
  fftPadH: number;
  fftScale: number;
  fftPeakRatio: number;
  fftPsr: number;
  fftSeedCount: number;
  fftSeedUsed: number;
  fftBackend: 'js' | 'wasm';
  fftRequested: FftBackend;
  wasmReady: boolean;
  scoreMax: number;
  useCoarseToFineScore: boolean;
  useEdgeSampling: boolean;
  edgeSampleMax: number;
  earlyExit: boolean;
  scoreSampleCount: number;
  rescoreTopK: number;
};

export type FftBackend = 'auto' | 'js' | 'wasm';
export type FftPolicy = 'fixed' | 'adaptive';

export type AlignmentOptions = {
  coarseMax?: number;
  fineMax?: number;
  scaleMin?: number;
  scaleMax?: number;
  fftMax?: number;
  fftPolicy?: FftPolicy;
  scaleWindow?: number;
  scaleStep?: number;
  maxFineScales?: number;
  maxCoarseCandidates?: number;
  useScalePrior?: boolean;
  fftBackend?: FftBackend;
  /**
   * Injected wasm FFT module accessor. Web wires this to
   * `src/lib/dual-reader/fft-wasm.ts`; mobile omits it so the pure-JS
   * `fft.js` backend is used (no WebAssembly polyfill on RN).
   */
  wasmProvider?: FftWasmProvider;
  scoreMax?: number;
  useCoarseToFineScore?: boolean;
  useEdgeSampling?: boolean;
  edgeSampleMax?: number;
  rescoreTopK?: number;
  earlyExit?: boolean;
  abortCheck?: AbortCheck;
  profile?: boolean;
};

export type AlignmentWorkerOptions = Omit<AlignmentOptions, 'abortCheck'>;

type SampleSet = {
  xs: number[];
  ys: number[];
  count: number;
};

type AbortCheck = () => void;

type AlignmentSearchResult = {
  scale: number;
  dx: number;
  dy: number;
  score: number;
  secondScore: number;
  coverage: number;
  fftPeakRatio?: number;
  fftPsr?: number;
  fftSeedCount?: number;
  fftSeedUsed?: number;
};

type AlignmentImage = {
  data: Uint8Array;
  width: number;
  height: number;
};

type FftPrepJs = {
  kind: 'js';
  fftW: FFT;
  fftH: FFT;
  padW: number;
  padH: number;
  primarySpectrum: Float64Array;
  primaryInput: Float64Array;
  /**
   * Scratch buffers reused across phase-correlation calls on this prep (each
   * call fully overwrites them), cutting ~2 MB of garbage per FFT scale at
   * 256x256 and with it GC pauses that would land inside a cooperative slice.
   */
  scratchSpectrum: Float64Array | null;
  scratchCross: Float64Array | null;
};

type FftPrepWasm = {
  kind: 'wasm';
  padW: number;
  padH: number;
  dims: [number, number];
  nfft: number;
  forwardPtr: number;
  inversePtr: number;
  primarySpectrum: Float32Array;
  wasm: KissFftModule;
};

type FftPrep = FftPrepJs | FftPrepWasm;

type FftSeed = {
  dx: number;
  dy: number;
  peak: number;
};

type FftShiftResult = {
  dx: number;
  dy: number;
  peak: number;
  peakRatio: number;
  psr: number;
  seeds: FftSeed[];
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function nextPow2(value: number): number {
  let v = Math.max(2, Math.trunc(value));
  let p = 1;
  while (p < v) p <<= 1;
  return p;
}

function computeDownsampleScale(srcW: number, srcH: number, dstW: number, dstH: number): number {
  const srcWidth = Math.max(1, Math.trunc(srcW));
  const srcHeight = Math.max(1, Math.trunc(srcH));
  const maxDim = Math.max(srcWidth, srcHeight);
  if (srcWidth >= srcHeight) {
    return Math.max(1, Math.trunc(dstW)) / maxDim;
  }
  return Math.max(1, Math.trunc(dstH)) / maxDim;
}

function computeDownsampleDims(
  width: number,
  height: number,
  maxSize: number
): { width: number; height: number; scale: number } {
  const w = Math.max(1, Math.trunc(width));
  const h = Math.max(1, Math.trunc(height));
  const maxDim = Math.max(w, h);
  if (maxDim <= maxSize) {
    return { width: w, height: h, scale: 1 };
  }
  const scale = maxSize / maxDim;
  const targetW = Math.max(1, Math.round(w * scale));
  const targetH = Math.max(1, Math.round(h * scale));
  return { width: targetW, height: targetH, scale };
}

function chooseAdaptiveFftMax(input: {
  primaryWidth: number;
  primaryHeight: number;
  secondaryWidth: number;
  secondaryHeight: number;
  budget: number;
  fineMax: number;
}): { fftMax: number; padW: number; padH: number; scale: number; budget: number } {
  const maxCandidate = Math.max(2, Math.trunc(Math.min(input.budget, input.fineMax)));
  const step = 32;
  const budgetDims = computeDownsampleDims(input.primaryWidth, input.primaryHeight, maxCandidate);
  const budgetPadW = nextPow2(budgetDims.width);
  const budgetPadH = nextPow2(budgetDims.height);
  const budgetPixels = Math.max(1, budgetPadW * budgetPadH);

  let bestScore = -Infinity;
  let best = {
    fftMax: maxCandidate,
    padW: budgetPadW,
    padH: budgetPadH,
    scale: budgetDims.scale,
    budget: maxCandidate,
  };

  const candidates: number[] = [];
  if (maxCandidate < step) {
    candidates.push(maxCandidate);
  } else {
    for (let candidate = Math.floor(maxCandidate / step) * step; candidate >= step; candidate -= step) {
      candidates.push(candidate);
    }
    if (!candidates.includes(maxCandidate)) candidates.unshift(maxCandidate);
  }

  for (const candidate of candidates) {
    const primaryDims = computeDownsampleDims(input.primaryWidth, input.primaryHeight, candidate);
    const padW = nextPow2(primaryDims.width);
    const padH = nextPow2(primaryDims.height);
    const padPixels = padW * padH;
    const paddingRatio =
      ((padW - primaryDims.width) / Math.max(1, padW) + (padH - primaryDims.height) / Math.max(1, padH)) * 0.5;
    const overBudget = Math.max(0, padPixels / budgetPixels - 1);
    const score = primaryDims.scale / (1 + paddingRatio * 1.5 + overBudget * 2);
    if (score > bestScore) {
      bestScore = score;
      best = {
        fftMax: candidate,
        padW,
        padH,
        scale: primaryDims.scale,
        budget: maxCandidate,
      };
    }
  }

  return best;
}

function buildWindow(size: number): Float64Array {
  const out = new Float64Array(size);
  if (size <= 1) {
    out[0] = 1;
    return out;
  }
  const denom = size - 1;
  for (let i = 0; i < size; i++) {
    out[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / denom);
  }
  return out;
}

function fftInputMean(grad: Uint8Array, mask: Uint8Array): number {
  let sum = 0;
  let count = 0;
  for (let i = 0; i < grad.length; i++) {
    if (!mask[i]) continue;
    sum += grad[i] ?? 0;
    count += 1;
  }
  return count > 0 ? sum / count : 0;
}

function fftInputRows(
  grad: Uint8Array,
  mask: Uint8Array,
  width: number,
  mean: number,
  winX: Float64Array,
  winY: Float64Array,
  out: Float64Array,
  y0: number,
  y1: number
): void {
  for (let y = y0; y < y1; y++) {
    const row = y * width;
    const wy = winY[y] ?? 1;
    for (let x = 0; x < width; x++) {
      const idx = row + x;
      if (!mask[idx]) continue;
      out[idx] = ((grad[idx] ?? 0) - mean) * (winX[x] ?? 1) * wy;
    }
  }
}

function fftInputComplexPaddedRows(
  grad: Uint8Array,
  mask: Uint8Array,
  width: number,
  padW: number,
  mean: number,
  winX: Float64Array,
  winY: Float64Array,
  out: Float32Array,
  y0: number,
  y1: number
): void {
  for (let y = y0; y < y1; y++) {
    const row = y * width;
    const dstRow = y * padW;
    const wy = winY[y] ?? 1;
    for (let x = 0; x < width; x++) {
      const idx = row + x;
      if (!mask[idx]) continue;
      const value = ((grad[idx] ?? 0) - mean) * (winX[x] ?? 1) * wy;
      const outIdx = (dstRow + x) * 2;
      out[outIdx] = value;
      out[outIdx + 1] = 0;
    }
  }
}

/** Rows processed per checkpoint by the FFT-related kernels (as before: every 16 rows/cols). */
const FFT_CHUNK = 16;
/** Elements processed per checkpoint by flat loops (cross-power, peak scan, scaling). */
const FLAT_CHUNK = 2048;

function* buildFftInput(
  grad: Uint8Array,
  mask: Uint8Array,
  width: number,
  height: number,
  pace: AlignmentPace
): AlignmentSteps<Float64Array> {
  const mean = fftInputMean(grad, mask);
  if (pace()) yield;
  const winX = buildWindow(width);
  const winY = buildWindow(height);
  const out = new Float64Array(width * height);
  for (let y = 0; y < height; y += FFT_CHUNK) {
    if (pace()) yield;
    fftInputRows(grad, mask, width, mean, winX, winY, out, y, Math.min(height, y + FFT_CHUNK));
  }
  return out;
}

function* buildFftInputComplexPadded(
  grad: Uint8Array,
  mask: Uint8Array,
  width: number,
  height: number,
  padW: number,
  padH: number,
  pace: AlignmentPace
): AlignmentSteps<Float32Array> {
  const mean = fftInputMean(grad, mask);
  if (pace()) yield;
  const winX = buildWindow(width);
  const winY = buildWindow(height);
  const out = new Float32Array(padW * padH * 2);
  for (let y = 0; y < height; y += FFT_CHUNK) {
    if (pace()) yield;
    fftInputComplexPaddedRows(grad, mask, width, padW, mean, winX, winY, out, y, Math.min(height, y + FFT_CHUNK));
  }
  return out;
}

function fftRealRows(
  input: Float64Array,
  width: number,
  height: number,
  fftW: FFT,
  padW: number,
  spectrum: Float64Array,
  rowIn: Float64Array,
  rowOut: number[],
  y0: number,
  y1: number
): void {
  for (let y = y0; y < y1; y++) {
    rowIn.fill(0);
    if (y < height) {
      const srcRow = y * width;
      rowIn.set(input.subarray(srcRow, srcRow + width), 0);
    }
    fftW.realTransform(rowOut, rowIn);
    fftW.completeSpectrum(rowOut);
    spectrum.set(rowOut, y * padW * 2);
  }
}

function fftColumns(
  spectrum: Float64Array,
  fftH: FFT,
  padW: number,
  padH: number,
  colIn: number[],
  colOut: number[],
  inverse: boolean,
  x0: number,
  x1: number
): void {
  for (let x = x0; x < x1; x++) {
    for (let y = 0; y < padH; y++) {
      const idx = (y * padW + x) * 2;
      colIn[2 * y] = spectrum[idx] ?? 0;
      colIn[2 * y + 1] = spectrum[idx + 1] ?? 0;
    }
    if (inverse) fftH.inverseTransform(colOut, colIn);
    else fftH.transform(colOut, colIn);
    for (let y = 0; y < padH; y++) {
      const idx = (y * padW + x) * 2;
      spectrum[idx] = colOut[2 * y] ?? 0;
      spectrum[idx + 1] = colOut[2 * y + 1] ?? 0;
    }
  }
}

function ifftRows(
  spectrum: Float64Array,
  fftW: FFT,
  padW: number,
  rowIn: number[],
  rowOut: number[],
  y0: number,
  y1: number
): void {
  for (let y = y0; y < y1; y++) {
    const offset = y * padW * 2;
    for (let i = 0; i < padW * 2; i++) {
      rowIn[i] = spectrum[offset + i] ?? 0;
    }
    fftW.inverseTransform(rowOut, rowIn);
    for (let i = 0; i < padW * 2; i++) {
      spectrum[offset + i] = rowOut[i] ?? 0;
    }
  }
}

function scaleRange(data: Float64Array, scale: number, i0: number, i1: number): void {
  for (let i = i0; i < i1; i++) {
    data[i] *= scale;
  }
}

function* fft2dRealJs(
  input: Float64Array,
  width: number,
  height: number,
  fftW: FFT,
  fftH: FFT,
  padW: number,
  padH: number,
  pace: AlignmentPace,
  out?: Float64Array
): AlignmentSteps<Float64Array> {
  // Every row of `spectrum` is fully written below, so a reused buffer needs no clearing.
  const spectrum = out && out.length === padW * padH * 2 ? out : new Float64Array(padW * padH * 2);
  const rowIn = new Float64Array(padW);
  const rowOut = fftW.createComplexArray();
  for (let y = 0; y < padH; y += FFT_CHUNK) {
    if (pace()) yield;
    fftRealRows(input, width, height, fftW, padW, spectrum, rowIn, rowOut, y, Math.min(padH, y + FFT_CHUNK));
  }

  const colIn = fftH.createComplexArray();
  const colOut = fftH.createComplexArray();
  for (let x = 0; x < padW; x += FFT_CHUNK) {
    if (pace()) yield;
    fftColumns(spectrum, fftH, padW, padH, colIn, colOut, false, x, Math.min(padW, x + FFT_CHUNK));
  }
  return spectrum;
}

function* ifft2dInPlaceJs(
  spectrum: Float64Array,
  fftW: FFT,
  fftH: FFT,
  padW: number,
  padH: number,
  pace: AlignmentPace
): AlignmentSteps<void> {
  const colIn = fftH.createComplexArray();
  const colOut = fftH.createComplexArray();
  for (let x = 0; x < padW; x += FFT_CHUNK) {
    if (pace()) yield;
    fftColumns(spectrum, fftH, padW, padH, colIn, colOut, true, x, Math.min(padW, x + FFT_CHUNK));
  }

  const rowIn = fftW.createComplexArray();
  const rowOut = fftW.createComplexArray();
  for (let y = 0; y < padH; y += FFT_CHUNK) {
    if (pace()) yield;
    ifftRows(spectrum, fftW, padW, rowIn, rowOut, y, Math.min(padH, y + FFT_CHUNK));
  }

  const scale = 1 / (padW * padH);
  for (let i = 0; i < spectrum.length; i += FLAT_CHUNK * 8) {
    if (pace()) yield;
    scaleRange(spectrum, scale, i, Math.min(spectrum.length, i + FLAT_CHUNK * 8));
  }
}

/** Normalized cross-power spectrum over complex-interleaved indices [i0, i1) (i0 even). */
function crossPowerRange(
  a: Float64Array | Float32Array,
  b: Float64Array | Float32Array,
  cross: Float64Array | Float32Array,
  i0: number,
  i1: number
): void {
  for (let i = i0; i < i1; i += 2) {
    const ar = a[i] ?? 0;
    const ai = a[i + 1] ?? 0;
    const br = b[i] ?? 0;
    const bi = b[i + 1] ?? 0;
    const cr = ar * br + ai * bi;
    const ci = ai * br - ar * bi;
    const mag = Math.hypot(cr, ci);
    if (mag < 1e-6) {
      cross[i] = 0;
      cross[i + 1] = 0;
    } else {
      cross[i] = cr / mag;
      cross[i + 1] = ci / mag;
    }
  }
}

function* crossPowerSpectrum<T extends Float64Array | Float32Array>(
  a: T,
  b: Float64Array | Float32Array,
  cross: T,
  pace: AlignmentPace
): AlignmentSteps<T> {
  const chunk = FLAT_CHUNK * 2;
  for (let i = 0; i < a.length; i += chunk) {
    if (pace()) yield;
    crossPowerRange(a, b, cross, i, Math.min(a.length, i + chunk));
  }
  return cross;
}

type PeakScanState = {
  peaks: { x: number; y: number; value: number }[];
  maxVal: number;
  maxIdx: number;
  secondVal: number;
  sum: number;
  sumSq: number;
};

function peakScanRange(
  state: PeakScanState,
  corr: Float64Array | Float32Array,
  padW: number,
  padH: number,
  minDistSq: number,
  maxPeaks: number,
  i0: number,
  i1: number
): void {
  const peaks = state.peaks;
  let maxVal = state.maxVal;
  let maxIdx = state.maxIdx;
  let secondVal = state.secondVal;
  let sum = state.sum;
  let sumSq = state.sumSq;
  for (let i = i0; i < i1; i++) {
    const value = corr[i * 2] ?? 0;
    if (!Number.isFinite(value)) continue;
    sum += value;
    sumSq += value * value;
    if (value > maxVal) {
      secondVal = maxVal;
      maxVal = value;
      maxIdx = i;
    } else if (value > secondVal) {
      secondVal = value;
    }
    if (value <= 0) continue;
    const x = i % padW;
    const y = Math.floor(i / padW);
    let replaceIdx = -1;
    for (let p = 0; p < peaks.length; p++) {
      const dx = Math.abs(x - peaks[p]!.x);
      const dy = Math.abs(y - peaks[p]!.y);
      const wrapDx = Math.min(dx, padW - dx);
      const wrapDy = Math.min(dy, padH - dy);
      if (wrapDx * wrapDx + wrapDy * wrapDy <= minDistSq) {
        replaceIdx = p;
        break;
      }
    }
    if (replaceIdx >= 0) {
      if (value > peaks[replaceIdx]!.value) {
        peaks[replaceIdx] = { x, y, value };
      }
      continue;
    }
    if (peaks.length < maxPeaks) {
      peaks.push({ x, y, value });
      continue;
    }
    let weakestIdx = 0;
    let weakestVal = peaks[0]!.value;
    for (let p = 1; p < peaks.length; p++) {
      if (peaks[p]!.value < weakestVal) {
        weakestVal = peaks[p]!.value;
        weakestIdx = p;
      }
    }
    if (value > weakestVal) {
      peaks[weakestIdx] = { x, y, value };
    }
  }
  state.maxVal = maxVal;
  state.maxIdx = maxIdx;
  state.secondVal = secondVal;
  state.sum = sum;
  state.sumSq = sumSq;
}

/** Peak scan + sub-pixel refinement shared by the JS and wasm backends. */
function* scanCorrelationPeaks(
  corr: Float64Array | Float32Array,
  padW: number,
  padH: number,
  total: number,
  seedCount: number,
  seedMinDistance: number,
  pace: AlignmentPace
): AlignmentSteps<FftShiftResult> {
  const state: PeakScanState = {
    peaks: [],
    maxVal: -Infinity,
    maxIdx: 0,
    secondVal: -Infinity,
    sum: 0,
    sumSq: 0,
  };
  const minDist = Math.max(1, Math.trunc(seedMinDistance));
  const minDistSq = minDist * minDist;
  const maxPeaks = Math.max(1, Math.trunc(seedCount));
  for (let i = 0; i < total; i += FLAT_CHUNK) {
    if (pace()) yield;
    peakScanRange(state, corr, padW, padH, minDistSq, maxPeaks, i, Math.min(total, i + FLAT_CHUNK));
  }
  const { peaks, maxVal, maxIdx, secondVal, sum, sumSq } = state;
  peaks.sort((a, b) => b.value - a.value);

  const wrap = (value: number, max: number) => {
    let v = value;
    if (v < 0) v += max;
    if (v >= max) v -= max;
    return v;
  };
  const sample = (x: number, y: number) => {
    const xi = wrap(x, padW);
    const yi = wrap(y, padH);
    return corr[(yi * padW + xi) * 2] ?? 0;
  };
  const refinePeak = (peakX: number, peakY: number) => {
    const center = sample(peakX, peakY);
    const left = sample(peakX - 1, peakY);
    const right = sample(peakX + 1, peakY);
    const up = sample(peakX, peakY - 1);
    const down = sample(peakX, peakY + 1);
    const denomX = left - 2 * center + right;
    const denomY = up - 2 * center + down;
    let subX = 0;
    let subY = 0;
    if (Math.abs(denomX) > 1e-6) {
      subX = (left - right) / (2 * denomX);
      subX = clamp(subX, -0.5, 0.5);
    }
    if (Math.abs(denomY) > 1e-6) {
      subY = (up - down) / (2 * denomY);
      subY = clamp(subY, -0.5, 0.5);
    }
    let dx = peakX + subX;
    let dy = peakY + subY;
    if (dx > padW / 2) dx -= padW;
    if (dy > padH / 2) dy -= padH;
    return { dx, dy };
  };

  const seeds: FftSeed[] = [];
  const seedSource = peaks.length > 0 ? peaks : [{ x: maxIdx % padW, y: Math.floor(maxIdx / padW), value: maxVal }];
  for (const peak of seedSource.slice(0, maxPeaks)) {
    const refined = refinePeak(peak.x, peak.y);
    seeds.push({ dx: refined.dx, dy: refined.dy, peak: peak.value });
  }

  const peakMain = seeds[0] ?? { dx: 0, dy: 0, peak: maxVal };
  const mean = sum / Math.max(1, total);
  const variance = sumSq / Math.max(1, total) - mean * mean;
  const std = Math.sqrt(Math.max(variance, 1e-12));
  const psr = std > 0 ? (maxVal - mean) / std : 0;
  return {
    dx: peakMain.dx,
    dy: peakMain.dy,
    peak: maxVal,
    peakRatio: secondVal > 0 ? maxVal / secondVal : maxVal,
    psr,
    seeds,
  };
}

function* phaseCorrelationShiftJs(
  prep: FftPrepJs,
  secondaryInput: Float64Array,
  width: number,
  height: number,
  seedCount: number,
  seedMinDistance: number,
  pace: AlignmentPace
): AlignmentSteps<FftShiftResult> {
  const secondarySpectrum = yield* fft2dRealJs(
    secondaryInput,
    width,
    height,
    prep.fftW,
    prep.fftH,
    prep.padW,
    prep.padH,
    pace,
    prep.scratchSpectrum ?? undefined
  );
  prep.scratchSpectrum = secondarySpectrum;
  // `cross` is fully overwritten by crossPowerSpectrum, then transformed in place.
  const cross = yield* crossPowerSpectrum(
    prep.primarySpectrum,
    secondarySpectrum,
    prep.scratchCross ?? new Float64Array(prep.primarySpectrum.length),
    pace
  );
  prep.scratchCross = cross;
  yield* ifft2dInPlaceJs(cross, prep.fftW, prep.fftH, prep.padW, prep.padH, pace);
  return yield* scanCorrelationPeaks(cross, prep.padW, prep.padH, prep.padW * prep.padH, seedCount, seedMinDistance, pace);
}

function createWasmFftConfig(
  wasm: KissFftModule,
  dims: [number, number],
  inverse: boolean,
  real: boolean
): number {
  const ndims = dims.length;
  const dimsPtr = wasm._malloc(Int32Array.BYTES_PER_ELEMENT * ndims);
  for (let i = 0; i < ndims; i++) {
    wasm.HEAP32[dimsPtr / Int32Array.BYTES_PER_ELEMENT + i] = dims[i];
  }
  const cfg = real
    ? wasm._kiss_fftndr_alloc(dimsPtr, ndims, inverse ? 1 : 0, 0, 0)
    : wasm._kiss_fftnd_alloc(dimsPtr, ndims, inverse ? 1 : 0, 0, 0);
  wasm._free(dimsPtr);
  return cfg;
}

function fft2dComplexWasm(
  wasm: KissFftModule,
  input: Float32Array,
  forwardPtr: number,
  nfft: number
): Float32Array {
  const inputPtr = wasm._allocate(nfft * 2);
  const outputPtr = wasm._allocate(nfft * 2);
  wasm.HEAPF32.set(input, inputPtr / Float32Array.BYTES_PER_ELEMENT);
  wasm._kiss_fftnd(forwardPtr, inputPtr, outputPtr);
  const output = new Float32Array(
    wasm.HEAPF32.subarray(outputPtr / Float32Array.BYTES_PER_ELEMENT, outputPtr / Float32Array.BYTES_PER_ELEMENT + nfft * 2)
  );
  wasm._free(inputPtr);
  wasm._free(outputPtr);
  return output;
}

function ifft2dComplexWasm(
  wasm: KissFftModule,
  input: Float32Array,
  inversePtr: number,
  nfft: number
): Float32Array {
  const inputPtr = wasm._allocate(nfft * 2);
  const outputPtr = wasm._allocate(nfft * 2);
  wasm.HEAPF32.set(input, inputPtr / Float32Array.BYTES_PER_ELEMENT);
  wasm._kiss_fftnd(inversePtr, inputPtr, outputPtr);
  wasm._scale(outputPtr, nfft * 2, 1 / nfft);
  const output = new Float32Array(
    wasm.HEAPF32.subarray(outputPtr / Float32Array.BYTES_PER_ELEMENT, outputPtr / Float32Array.BYTES_PER_ELEMENT + nfft * 2)
  );
  wasm._free(inputPtr);
  wasm._free(outputPtr);
  return output;
}

function* phaseCorrelationShiftWasm(
  prep: FftPrepWasm,
  secondaryInput: Float32Array,
  seedCount: number,
  seedMinDistance: number,
  pace: AlignmentPace
): AlignmentSteps<FftShiftResult> {
  // The wasm FFT itself is one atomic native call (web only; mobile uses JS).
  const secondarySpectrum = fft2dComplexWasm(prep.wasm, secondaryInput, prep.forwardPtr, prep.nfft);
  const cross = yield* crossPowerSpectrum(
    prep.primarySpectrum,
    secondarySpectrum,
    new Float32Array(prep.primarySpectrum.length),
    pace
  );
  if (pace()) yield;
  const corr = ifft2dComplexWasm(prep.wasm, cross, prep.inversePtr, prep.nfft);
  return yield* scanCorrelationPeaks(corr, prep.padW, prep.padH, prep.nfft, seedCount, seedMinDistance, pace);
}

function* buildScaledSecondaryForFft(input: {
  grad: Uint8Array;
  mask: Uint8Array;
  width: number;
  height: number;
  scale: number;
  targetW: number;
  targetH: number;
  anchor: 'topleft' | 'center';
  pace: AlignmentPace;
}): AlignmentSteps<{ grad: Uint8Array; mask: Uint8Array; offsetX: number; offsetY: number }> {
  const scaledW = Math.max(1, Math.round(input.width * input.scale));
  const scaledH = Math.max(1, Math.round(input.height * input.scale));
  const scaledGrad = yield* resizeLumaSteps(input.grad, input.width, input.height, scaledW, scaledH, input.pace);
  const scaledMask = yield* resizeLumaSteps(input.mask, input.width, input.height, scaledW, scaledH, input.pace);
  const outGrad = new Uint8Array(input.targetW * input.targetH);
  const outMask = new Uint8Array(input.targetW * input.targetH);
  const offsetX = input.anchor === 'center' ? Math.floor((input.targetW - scaledW) / 2) : 0;
  const offsetY = input.anchor === 'center' ? Math.floor((input.targetH - scaledH) / 2) : 0;
  const srcStartX = Math.max(0, -offsetX);
  const srcStartY = Math.max(0, -offsetY);
  const dstStartX = Math.max(0, offsetX);
  const dstStartY = Math.max(0, offsetY);
  const copyW = Math.max(0, Math.min(scaledW - srcStartX, input.targetW - dstStartX));
  const copyH = Math.max(0, Math.min(scaledH - srcStartY, input.targetH - dstStartY));
  for (let y = 0; y < copyH; y++) {
    if ((y & 15) === 0 && input.pace()) yield;
    const srcRow = (srcStartY + y) * scaledW;
    const dstRow = (dstStartY + y) * input.targetW;
    for (let x = 0; x < copyW; x++) {
      const idx = dstRow + dstStartX + x;
      const srcIdx = srcRow + srcStartX + x;
      outGrad[idx] = scaledGrad[srcIdx] ?? 0;
      outMask[idx] = (scaledMask[srcIdx] ?? 0) > 0 ? 1 : 0;
    }
  }
  return { grad: outGrad, mask: outMask, offsetX, offsetY };
}

function* buildSamples(
  mask: Uint8Array,
  width: number,
  height: number,
  stride: number,
  pace: AlignmentPace
): AlignmentSteps<SampleSet> {
  const xs: number[] = [];
  const ys: number[] = [];
  for (let y = 0; y < height; y += stride) {
    if ((y & 15) === 0 && pace()) yield;
    const row = y * width;
    for (let x = 0; x < width; x += stride) {
      if (mask[row + x]) {
        xs.push(x);
        ys.push(y);
      }
    }
  }
  return { xs, ys, count: xs.length };
}

function* buildEdgeSamples(input: {
  grad: Uint8Array;
  mask: Uint8Array;
  width: number;
  height: number;
  stride: number;
  maxSamples: number;
  pace: AlignmentPace;
}): AlignmentSteps<SampleSet> {
  const { grad, mask, width, height, stride, maxSamples } = input;
  const pace = input.pace;
  if (maxSamples <= 0) return yield* buildSamples(mask, width, height, stride, pace);
  const hist = new Uint32Array(256);
  let total = 0;
  for (let y = 0; y < height; y += stride) {
    if ((y & 15) === 0 && pace()) yield;
    const row = y * width;
    for (let x = 0; x < width; x += stride) {
      const idx = row + x;
      if (!mask[idx]) continue;
      hist[grad[idx] ?? 0] += 1;
      total += 1;
    }
  }
  if (total <= maxSamples) return yield* buildSamples(mask, width, height, stride, pace);

  let threshold = 255;
  let cumulative = 0;
  for (let g = 255; g >= 0; g--) {
    cumulative += hist[g] ?? 0;
    if (cumulative >= maxSamples) {
      threshold = g;
      break;
    }
  }

  const xs: number[] = [];
  const ys: number[] = [];
  for (let y = 0; y < height; y += stride) {
    if ((y & 15) === 0 && pace()) yield;
    const row = y * width;
    for (let x = 0; x < width; x += stride) {
      const idx = row + x;
      if (!mask[idx]) continue;
      if ((grad[idx] ?? 0) < threshold) continue;
      xs.push(x);
      ys.push(y);
    }
  }
  if (xs.length <= maxSamples) {
    return { xs, ys, count: xs.length };
  }
  const step = Math.max(1, Math.ceil(xs.length / maxSamples));
  const filteredXs: number[] = [];
  const filteredYs: number[] = [];
  for (let i = 0; i < xs.length; i += step) {
    if ((i & 1023) === 0 && pace()) yield;
    filteredXs.push(xs[i]!);
    filteredYs.push(ys[i]!);
  }
  return { xs: filteredXs, ys: filteredYs, count: filteredXs.length };
}

function sampleBilinear(data: Uint8Array, width: number, height: number, x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const idx00 = y0 * width + x0;
  const idx10 = y0 * width + x1;
  const idx01 = y1 * width + x0;
  const idx11 = y1 * width + x1;
  const v00 = data[idx00] ?? 0;
  const v10 = data[idx10] ?? 0;
  const v01 = data[idx01] ?? 0;
  const v11 = data[idx11] ?? 0;
  const v0 = v00 + (v10 - v00) * fx;
  const v1 = v01 + (v11 - v01) * fx;
  return v0 + (v1 - v0) * fy;
}

function* estimateContentInsets(
  luma: Uint8Array,
  width: number,
  height: number,
  pace: AlignmentPace
): AlignmentSteps<AlignmentInsets> {
  const grad = yield* computeGradientSteps(luma, width, height, pace);
  const rowScores = new Float32Array(height);
  const colScores = new Float32Array(width);
  for (let y = 0; y < height; y++) {
    if ((y & 15) === 0 && pace()) yield;
    const row = y * width;
    let sum = 0;
    for (let x = 0; x < width; x++) {
      const g = grad[row + x] ?? 0;
      sum += g;
      colScores[x] += g;
    }
    rowScores[y] = sum / Math.max(1, width);
  }
  for (let x = 0; x < width; x++) {
    colScores[x] = colScores[x] / Math.max(1, height);
  }

  const rowMax = rowScores.reduce((max, v) => (v > max ? v : max), 0);
  const colMax = colScores.reduce((max, v) => (v > max ? v : max), 0);
  const rowThreshold = Math.max(2, rowMax * 0.2);
  const colThreshold = Math.max(2, colMax * 0.2);

  const findFirst = (scores: Float32Array, threshold: number) => {
    for (let i = 0; i < scores.length; i++) {
      if (scores[i]! >= threshold) return i;
    }
    return 0;
  };
  const findLast = (scores: Float32Array, threshold: number) => {
    for (let i = scores.length - 1; i >= 0; i--) {
      if (scores[i]! >= threshold) return i;
    }
    return scores.length - 1;
  };

  let top = findFirst(rowScores, rowThreshold);
  let bottom = findLast(rowScores, rowThreshold);
  let left = findFirst(colScores, colThreshold);
  let right = findLast(colScores, colThreshold);

  const maxInsetY = Math.floor(height * 0.25);
  const maxInsetX = Math.floor(width * 0.25);
  top = clamp(top, 0, maxInsetY);
  left = clamp(left, 0, maxInsetX);
  bottom = clamp(height - 1 - bottom, 0, maxInsetY);
  right = clamp(width - 1 - right, 0, maxInsetX);

  const contentW = width - left - right;
  const contentH = height - top - bottom;
  if (contentW <= 0 || contentH <= 0) {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }
  const areaRatio = (contentW * contentH) / (width * height);
  if (areaRatio < 0.4 || areaRatio > 0.98) {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }

  return { top, right, bottom, left };
}

function estimateScalePrior(input: {
  primaryInsets: AlignmentInsets;
  secondaryInsets: AlignmentInsets;
  primaryWidth: number;
  primaryHeight: number;
  secondaryWidth: number;
  secondaryHeight: number;
  scaleMin: number;
  scaleMax: number;
}): number | null {
  const pW = input.primaryWidth - input.primaryInsets.left - input.primaryInsets.right;
  const pH = input.primaryHeight - input.primaryInsets.top - input.primaryInsets.bottom;
  const sW = input.secondaryWidth - input.secondaryInsets.left - input.secondaryInsets.right;
  const sH = input.secondaryHeight - input.secondaryInsets.top - input.secondaryInsets.bottom;
  if (pW <= 0 || pH <= 0 || sW <= 0 || sH <= 0) return null;
  const scaleW = pW / sW;
  const scaleH = pH / sH;
  if (!Number.isFinite(scaleW) || !Number.isFinite(scaleH)) return null;
  const scale = Math.sqrt(scaleW * scaleH);
  if (!Number.isFinite(scale)) return null;
  return clamp(scale, input.scaleMin, input.scaleMax);
}

function* buildMask(
  width: number,
  height: number,
  insets: AlignmentInsets,
  pace: AlignmentPace
): AlignmentSteps<Uint8Array> {
  const mask = new Uint8Array(width * height);
  const top = clamp(insets.top, 0, height);
  const bottom = clamp(insets.bottom, 0, height);
  const left = clamp(insets.left, 0, width);
  const right = clamp(insets.right, 0, width);
  const yStart = top;
  const yEnd = Math.max(yStart, height - bottom);
  const xStart = left;
  const xEnd = Math.max(xStart, width - right);
  for (let y = yStart; y < yEnd; y++) {
    if ((y & 31) === 0 && pace()) yield;
    const row = y * width;
    for (let x = xStart; x < xEnd; x++) {
      mask[row + x] = 1;
    }
  }
  return mask;
}

function scoreAlignment(
  samples: SampleSet,
  primaryGrad: Uint8Array,
  primaryWidth: number,
  secondaryGrad: Uint8Array,
  secondaryMask: Uint8Array,
  secondaryWidth: number,
  secondaryHeight: number,
  scale: number,
  dx: number,
  dy: number,
  bestScore?: number,
  abortCheck?: AbortCheck
): { score: number; coverage: number } {
  let sum = 0;
  let count = 0;
  const total = samples.count;
  for (let i = 0; i < samples.count; i++) {
    if (abortCheck && (i & 127) === 0) abortCheck();
    const x = samples.xs[i]!;
    const y = samples.ys[i]!;
    const sx = (x - dx) / scale;
    const sy = (y - dy) / scale;
    if (sx < 0 || sy < 0 || sx > secondaryWidth - 1 || sy > secondaryHeight - 1) continue;
    const sxi = Math.round(sx);
    const syi = Math.round(sy);
    if (sxi < 0 || syi < 0 || sxi >= secondaryWidth || syi >= secondaryHeight) continue;
    const sIdx = syi * secondaryWidth + sxi;
    if (!secondaryMask[sIdx]) continue;
    const pIdx = y * primaryWidth + x;
    const sVal = sampleBilinear(secondaryGrad, secondaryWidth, secondaryHeight, sx, sy);
    sum += Math.abs((primaryGrad[pIdx] ?? 0) - sVal);
    count += 1;
    if (bestScore !== undefined && Number.isFinite(bestScore)) {
      const remaining = total - count;
      if (remaining > 0) {
        const bestPossible = sum / (count + remaining);
        if (bestPossible >= bestScore) {
          return { score: bestPossible, coverage: count / Math.max(1, total) };
        }
      }
    }
  }
  if (count === 0) return { score: Number.POSITIVE_INFINITY, coverage: 0 };
  return { score: sum / count, coverage: count / Math.max(1, samples.count) };
}

function* refineTranslation(input: {
  samples: SampleSet;
  primaryGrad: Uint8Array;
  primaryWidth: number;
  secondaryGrad: Uint8Array;
  secondaryMask: Uint8Array;
  secondaryWidth: number;
  secondaryHeight: number;
  scale: number;
  dx: number;
  dy: number;
  range: number;
  bestScore?: number;
  abortCheck?: AbortCheck;
  pace: AlignmentPace;
}): AlignmentSteps<{ dx: number; dy: number; score: number; coverage: number }> {
  let best = scoreAlignment(
    input.samples,
    input.primaryGrad,
    input.primaryWidth,
    input.secondaryGrad,
    input.secondaryMask,
    input.secondaryWidth,
    input.secondaryHeight,
    input.scale,
    input.dx,
    input.dy,
    input.bestScore,
    input.abortCheck
  );
  let bestDx = input.dx;
  let bestDy = input.dy;
  if (input.pace()) yield;
  for (let dy = -input.range; dy <= input.range; dy++) {
    for (let dx = -input.range; dx <= input.range; dx++) {
      if (dx === 0 && dy === 0) continue;
      const score = scoreAlignment(
        input.samples,
        input.primaryGrad,
        input.primaryWidth,
        input.secondaryGrad,
        input.secondaryMask,
        input.secondaryWidth,
        input.secondaryHeight,
        input.scale,
        input.dx + dx,
        input.dy + dy,
        input.bestScore ?? best.score,
        input.abortCheck
      );
      if (score.score < best.score) {
        best = score;
        bestDx = input.dx + dx;
        bestDy = input.dy + dy;
      }
      if (input.pace()) yield;
    }
  }
  return { dx: bestDx, dy: bestDy, score: best.score, coverage: best.coverage };
}

function* prepareFftJs(
  primaryGrad: Uint8Array,
  primaryMask: Uint8Array,
  width: number,
  height: number,
  pace: AlignmentPace
): AlignmentSteps<FftPrepJs> {
  const padW = nextPow2(width);
  const padH = nextPow2(height);
  const fftW = new FFT(padW);
  const fftH = new FFT(padH);
  const primaryInput = yield* buildFftInput(primaryGrad, primaryMask, width, height, pace);
  const primarySpectrum = yield* fft2dRealJs(primaryInput, width, height, fftW, fftH, padW, padH, pace);
  return {
    kind: 'js',
    fftW,
    fftH,
    padW,
    padH,
    primarySpectrum,
    primaryInput,
    scratchSpectrum: null,
    scratchCross: null,
  };
}

function* prepareFftWasm(
  wasm: KissFftModule,
  primaryGrad: Uint8Array,
  primaryMask: Uint8Array,
  width: number,
  height: number,
  pace: AlignmentPace
): AlignmentSteps<FftPrepWasm> {
  const padW = nextPow2(width);
  const padH = nextPow2(height);
  const dims: [number, number] = [padH, padW];
  const nfft = padW * padH;
  const forwardPtr = createWasmFftConfig(wasm, dims, false, false);
  const inversePtr = createWasmFftConfig(wasm, dims, true, false);
  const primaryInput = yield* buildFftInputComplexPadded(primaryGrad, primaryMask, width, height, padW, padH, pace);
  const primarySpectrum = fft2dComplexWasm(wasm, primaryInput, forwardPtr, nfft);
  return { kind: 'wasm', padW, padH, dims, nfft, forwardPtr, inversePtr, primarySpectrum, wasm };
}

function disposeFftPrep(prep: FftPrep) {
  if (prep.kind !== 'wasm') return;
  if (prep.forwardPtr) prep.wasm._free(prep.forwardPtr);
  if (prep.inversePtr) prep.wasm._free(prep.inversePtr);
}

function* buildFftInputForPrep(
  prep: FftPrep,
  grad: Uint8Array,
  mask: Uint8Array,
  width: number,
  height: number,
  pace: AlignmentPace
): AlignmentSteps<Float64Array | Float32Array> {
  if (prep.kind === 'wasm') {
    return yield* buildFftInputComplexPadded(grad, mask, width, height, prep.padW, prep.padH, pace);
  }
  return yield* buildFftInput(grad, mask, width, height, pace);
}

function* phaseCorrelationShiftForPrep(
  prep: FftPrep,
  secondaryInput: Float64Array | Float32Array,
  width: number,
  height: number,
  seedCount: number,
  seedMinDistance: number,
  pace: AlignmentPace
): AlignmentSteps<FftShiftResult> {
  if (prep.kind === 'wasm') {
    return yield* phaseCorrelationShiftWasm(prep, secondaryInput as Float32Array, seedCount, seedMinDistance, pace);
  }
  return yield* phaseCorrelationShiftJs(prep, secondaryInput as Float64Array, width, height, seedCount, seedMinDistance, pace);
}

function buildScaleCandidates(min: number, max: number, step: number): number[] {
  const values: number[] = [];
  let s = min;
  while (s <= max + 1e-6) {
    values.push(Math.round(s * 1000) / 1000);
    s += step;
  }
  return values;
}

function resolveFftBackend(
  requested: FftBackend,
  wasmProvider?: FftWasmProvider
): { backend: 'js' | 'wasm'; wasmReady: boolean } {
  const wasmReady = wasmProvider?.isReady() ?? false;
  if (requested === 'wasm') {
    return { backend: wasmReady ? 'wasm' : 'js', wasmReady };
  }
  if (requested === 'auto') {
    return { backend: wasmReady ? 'wasm' : 'js', wasmReady };
  }
  return { backend: 'js', wasmReady };
}

function* searchAlignmentCandidates(
  primary: AlignmentImage & { grad: Uint8Array; mask: Uint8Array },
  secondary: AlignmentImage & { grad: Uint8Array; mask: Uint8Array },
  opts: {
    scaleMin: number;
    scaleMax: number;
    scaleStep: number;
    dxRange: number;
    dyRange: number;
    dxStep: number;
    dyStep: number;
    stride: number;
    dxOffset?: number;
    dyOffset?: number;
    topK?: number;
    abortCheck?: AbortCheck;
    pace: AlignmentPace;
  }
): AlignmentSteps<AlignmentSearchResult[]> {
  const samples = yield* buildSamples(primary.mask, primary.width, primary.height, opts.stride, opts.pace);
  if (samples.count === 0) return [];

  const topK = Math.max(1, Math.trunc(opts.topK ?? 1));
  const results: AlignmentSearchResult[] = [];
  const scales = buildScaleCandidates(opts.scaleMin, opts.scaleMax, opts.scaleStep);
  for (const scale of scales) {
    if (opts.pace()) yield;
    for (let dy = -opts.dyRange; dy <= opts.dyRange; dy += opts.dyStep) {
      if (opts.pace()) yield;
      for (let dx = -opts.dxRange; dx <= opts.dxRange; dx += opts.dxStep) {
        if (opts.pace()) yield;
        const offsetDx = dx + (opts.dxOffset ?? 0);
        const offsetDy = dy + (opts.dyOffset ?? 0);
        const result = scoreAlignment(
          samples,
          primary.grad,
          primary.width,
          secondary.grad,
          secondary.mask,
          secondary.width,
          secondary.height,
          scale,
          offsetDx,
          offsetDy,
          undefined,
          opts.abortCheck
        );
        const entry: AlignmentSearchResult = {
          scale,
          dx: offsetDx,
          dy: offsetDy,
          score: result.score,
          secondScore: Number.POSITIVE_INFINITY,
          coverage: result.coverage,
        };
        if (results.length < topK) {
          results.push(entry);
          results.sort((a, b) => a.score - b.score);
        } else if (entry.score < results[results.length - 1]!.score) {
          results[results.length - 1] = entry;
          results.sort((a, b) => a.score - b.score);
        }
      }
    }
  }
  for (let i = 0; i < results.length; i++) {
    results[i] = {
      ...results[i]!,
      secondScore: results[Math.min(results.length - 1, i + 1)]?.score ?? results[i]!.score,
    };
  }
  return results;
}

function scaleInsets(
  insets: AlignmentInsets,
  fromWidth: number,
  fromHeight: number,
  toWidth: number,
  toHeight: number
): AlignmentInsets {
  const scaleX = toWidth / Math.max(1, fromWidth);
  const scaleY = toHeight / Math.max(1, fromHeight);
  return {
    top: Math.round(insets.top * scaleY),
    right: Math.round(insets.right * scaleX),
    bottom: Math.round(insets.bottom * scaleY),
    left: Math.round(insets.left * scaleX),
  };
}

function toAlignmentImage(input: DhashInput): AlignmentImage {
  const width = Math.max(1, Math.trunc(input.width));
  const height = Math.max(1, Math.trunc(input.height));
  return { data: toLuma({ ...input, width, height }), width, height };
}

export function buildAlignmentImage(input: DhashInput): LumaImage {
  return toAlignmentImage(input);
}

const SPLIT_MERGE_CHUNK_PIXELS = 16384;
const NEVER_YIELD_PACE: AlignmentPace = () => false;

function driveSync<T>(steps: AlignmentSteps<T>, name: string): T {
  const next = steps.next();
  if (!next.done) throw new Error(`${name}: step variant yielded unexpectedly.`);
  return next.value;
}

/** Step variant of `buildSplitLuma` (bit-identical); checkpoints every ~16K pixels. */
export function* buildSplitLumaSteps(
  source: LumaImage,
  side: 'left' | 'right',
  pace: AlignmentPace
): AlignmentSteps<LumaImage> {
  const width = Math.max(1, Math.trunc(source.width));
  const height = Math.max(1, Math.trunc(source.height));
  const leftWidth = Math.floor(width / 2);
  const rightWidth = Math.max(1, width - leftWidth);
  const cropWidth = side === 'left' ? leftWidth : rightWidth;
  const startX = side === 'left' ? 0 : width - cropWidth;
  const out = new Uint8Array(cropWidth * height);
  const rowsPerChunk = Math.max(1, Math.floor(SPLIT_MERGE_CHUNK_PIXELS / Math.max(1, cropWidth)));
  for (let y0 = 0; y0 < height; y0 += rowsPerChunk) {
    const y1 = Math.min(height, y0 + rowsPerChunk);
    for (let y = y0; y < y1; y++) {
      const srcRow = y * width;
      const dstRow = y * cropWidth;
      for (let x = 0; x < cropWidth; x++) {
        out[dstRow + x] = source.data[srcRow + startX + x] ?? 0;
      }
    }
    if (pace()) yield;
  }
  return { data: out, width: cropWidth, height };
}

export function buildSplitLuma(source: LumaImage, side: 'left' | 'right'): LumaImage {
  return driveSync(buildSplitLumaSteps(source, side, NEVER_YIELD_PACE), 'buildSplitLuma');
}

/** Step variant of `buildMergeLuma` (bit-identical); resizes and copies in row chunks. */
export function* buildMergeLumaSteps(
  left: LumaImage,
  right: LumaImage,
  order: 'normal' | 'swap',
  pace: AlignmentPace
): AlignmentSteps<LumaImage> {
  const leftImg = order === 'normal' ? left : right;
  const rightImg = order === 'normal' ? right : left;
  const targetHeight = Math.max(leftImg.height, rightImg.height);
  const leftScale = targetHeight / Math.max(1, leftImg.height);
  const rightScale = targetHeight / Math.max(1, rightImg.height);
  const leftWidth = Math.max(1, Math.round(leftImg.width * leftScale));
  const rightWidth = Math.max(1, Math.round(rightImg.width * rightScale));
  const leftResized = yield* resizeLumaSteps(leftImg.data, leftImg.width, leftImg.height, leftWidth, targetHeight, pace);
  const rightResized = yield* resizeLumaSteps(rightImg.data, rightImg.width, rightImg.height, rightWidth, targetHeight, pace);

  const outWidth = leftWidth + rightWidth;
  const out = new Uint8Array(outWidth * targetHeight);
  const rowsPerChunk = Math.max(1, Math.floor(SPLIT_MERGE_CHUNK_PIXELS / Math.max(1, outWidth)));
  for (let y0 = 0; y0 < targetHeight; y0 += rowsPerChunk) {
    const y1 = Math.min(targetHeight, y0 + rowsPerChunk);
    for (let y = y0; y < y1; y++) {
      const row = y * outWidth;
      const leftRow = y * leftWidth;
      const rightRow = y * rightWidth;
      out.set(leftResized.subarray(leftRow, leftRow + leftWidth), row);
      out.set(rightResized.subarray(rightRow, rightRow + rightWidth), row + leftWidth);
    }
    if (pace()) yield;
  }
  return { data: out, width: outWidth, height: targetHeight };
}

export function buildMergeLuma(left: LumaImage, right: LumaImage, order: 'normal' | 'swap'): LumaImage {
  return driveSync(buildMergeLumaSteps(left, right, order, NEVER_YIELD_PACE), 'buildMergeLuma');
}

export type AlignmentTransformInput = {
  primary: LumaImage;
  secondary: LumaImage;
  options?: AlignmentOptions;
};

/**
 * Synchronous alignment. Drives `computeAlignmentTransformSteps` to completion
 * in one go (never yields), so it is bit-identical to the cooperative variant.
 */
export function computeAlignmentTransform(input: AlignmentTransformInput): AlignmentResult {
  const steps = computeAlignmentTransformSteps(input);
  const step = steps.next();
  if (!step.done) {
    steps.return(undefined as never);
    throw new Error('computeAlignmentTransform: unexpected yield without shouldYield');
  }
  return step.value;
}

/**
 * Step (generator) form of `computeAlignmentTransform`. All heavy loops
 * (resize, gradients, FFT rows/columns, cross-power spectrum, peak scan,
 * sample building, translation search) hit a checkpoint that calls
 * `options.abortCheck` and yields when `shouldYield()` returns true. Without
 * `shouldYield` it never yields. The math is shared with the synchronous API,
 * so results are bit-identical regardless of how the work is sliced.
 */
export function* computeAlignmentTransformSteps(
  input: AlignmentTransformInput,
  shouldYield?: () => boolean
): AlignmentSteps<AlignmentResult> {
  // FFT phase correlation estimates translation per scale; a tiny local brute-force keeps it deterministic.
  const options = buildAlignmentOptions(input.options);
  const coarseMax = options.coarseMax ?? 96;
  const fineMax = options.fineMax ?? 192;
  const fftBudget = Math.min(options.fftMax ?? Math.min(256, fineMax), fineMax);
  const fftPolicy = options.fftPolicy ?? 'fixed';
  const scaleMin = options.scaleMin ?? 0.8;
  const scaleMax = options.scaleMax ?? 1.2;
  const scaleWindow = clamp(options.scaleWindow ?? 0.3, 0.01, 0.8);
  const scaleStep = clamp(options.scaleStep ?? 0.003, 0.001, 0.05);
  const maxFineScales = Math.max(1, Math.trunc(options.maxFineScales ?? 5));
  const maxCoarseCandidates = Math.max(1, Math.trunc(options.maxCoarseCandidates ?? 2));
  const useScalePrior = options.useScalePrior ?? true;
  const fftRequested = options.fftBackend ?? 'wasm';
  const { backend: fftBackend, wasmReady } = resolveFftBackend(fftRequested, options.wasmProvider);
  const wasmModule = fftBackend === 'wasm' ? (options.wasmProvider?.getModule() ?? null) : null;
  const useCoarseToFineScore = options.useCoarseToFineScore ?? true;
  const scoreMaxDefault = Math.min(128, fineMax);
  const scoreMax = Math.max(48, Math.min(options.scoreMax ?? scoreMaxDefault, fineMax));
  const useEdgeSampling = options.useEdgeSampling ?? true;
  const edgeSampleMax = Math.max(500, Math.trunc(options.edgeSampleMax ?? 8000));
  const rescoreTopK = Math.max(1, Math.trunc(options.rescoreTopK ?? 2));
  const earlyExit = options.earlyExit ?? true;
  const abortCheck = options.abortCheck;
  const profile = options.profile ?? false;

  const now = () =>
    typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
  const totalStart = now();
  const timings: Partial<AlignmentTimings> | null = profile ? {} : null;
  // Note: with cooperative slicing, profiled timings include time spent yielded.
  const measure = function* <T>(key: keyof AlignmentTimings, steps: AlignmentSteps<T>): AlignmentSteps<T> {
    if (!timings) return yield* steps;
    const start = now();
    const result = yield* steps;
    timings[key] = (timings[key] ?? 0) + (now() - start);
    return result;
  };
  const measureSync = <T,>(key: keyof AlignmentTimings, fn: () => T): T => {
    if (!timings) return fn();
    const start = now();
    const result = fn();
    timings[key] = (timings[key] ?? 0) + (now() - start);
    return result;
  };
  const pace: AlignmentPace = shouldYield
    ? () => {
        if (abortCheck) abortCheck();
        return shouldYield();
      }
    : () => {
        if (abortCheck) abortCheck();
        return false;
      };
  if (pace()) yield;

  const { primaryFine, secondaryFine, primaryCoarse, secondaryCoarse } = yield* measure('downsampleMs', (function* () {
    const primaryFine = yield* downsampleToMaxSteps(input.primary.data, input.primary.width, input.primary.height, fineMax, pace);
    const secondaryFine = yield* downsampleToMaxSteps(input.secondary.data, input.secondary.width, input.secondary.height, fineMax, pace);
    const primaryCoarse = yield* downsampleToMaxSteps(primaryFine.data, primaryFine.width, primaryFine.height, coarseMax, pace);
    const secondaryCoarse = yield* downsampleToMaxSteps(secondaryFine.data, secondaryFine.width, secondaryFine.height, coarseMax, pace);
    return { primaryFine, secondaryFine, primaryCoarse, secondaryCoarse };
  })());
  if (pace()) yield;

  let fftMax = fftBudget;
  let fftPadW = 0;
  let fftPadH = 0;
  let fftScale = 0;
  if (fftPolicy === 'adaptive') {
    const choice = chooseAdaptiveFftMax({
      primaryWidth: primaryFine.width,
      primaryHeight: primaryFine.height,
      secondaryWidth: secondaryFine.width,
      secondaryHeight: secondaryFine.height,
      budget: fftBudget,
      fineMax,
    });
    fftMax = choice.fftMax;
    fftPadW = choice.padW;
    fftPadH = choice.padH;
    fftScale = choice.scale;
  }

  const { primaryScore, secondaryScore, primaryScoreScale, secondaryScoreScale } = yield* measure('downsampleMs', (function* () {
    if (!useCoarseToFineScore || scoreMax >= fineMax) {
      return {
        primaryScore: primaryFine,
        secondaryScore: secondaryFine,
        primaryScoreScale: 1,
        secondaryScoreScale: 1,
      };
    }
    const primaryScore = yield* downsampleToMaxSteps(primaryFine.data, primaryFine.width, primaryFine.height, scoreMax, pace);
    const secondaryScore = yield* downsampleToMaxSteps(secondaryFine.data, secondaryFine.width, secondaryFine.height, scoreMax, pace);
    const primaryScoreScale = computeDownsampleScale(
      primaryFine.width,
      primaryFine.height,
      primaryScore.width,
      primaryScore.height
    );
    const secondaryScoreScale = computeDownsampleScale(
      secondaryFine.width,
      secondaryFine.height,
      secondaryScore.width,
      secondaryScore.height
    );
    return { primaryScore, secondaryScore, primaryScoreScale, secondaryScoreScale };
  })());
  if (pace()) yield;

  const {
    primaryInsetsFine,
    secondaryInsetsFine,
    primaryMaskFine,
    secondaryMaskFine,
    primaryMaskCoarse,
    secondaryMaskCoarse,
    primaryMaskScore,
    secondaryMaskScore,
  } = yield* measure('insetsMs', (function* () {
    const primaryInsetsFine = yield* estimateContentInsets(primaryFine.data, primaryFine.width, primaryFine.height, pace);
    const secondaryInsetsFine = yield* estimateContentInsets(secondaryFine.data, secondaryFine.width, secondaryFine.height, pace);
    const primaryMaskFine = yield* buildMask(primaryFine.width, primaryFine.height, primaryInsetsFine, pace);
    const secondaryMaskFine = yield* buildMask(secondaryFine.width, secondaryFine.height, secondaryInsetsFine, pace);

    const scaleX = primaryCoarse.width / Math.max(1, primaryFine.width);
    const scaleY = primaryCoarse.height / Math.max(1, primaryFine.height);
    const scaleSX = secondaryCoarse.width / Math.max(1, secondaryFine.width);
    const scaleSY = secondaryCoarse.height / Math.max(1, secondaryFine.height);

    const primaryInsetsCoarse: AlignmentInsets = {
      top: Math.round(primaryInsetsFine.top * scaleY),
      right: Math.round(primaryInsetsFine.right * scaleX),
      bottom: Math.round(primaryInsetsFine.bottom * scaleY),
      left: Math.round(primaryInsetsFine.left * scaleX),
    };
    const secondaryInsetsCoarse: AlignmentInsets = {
      top: Math.round(secondaryInsetsFine.top * scaleSY),
      right: Math.round(secondaryInsetsFine.right * scaleSX),
      bottom: Math.round(secondaryInsetsFine.bottom * scaleSY),
      left: Math.round(secondaryInsetsFine.left * scaleSX),
    };

    const primaryMaskCoarse = yield* buildMask(primaryCoarse.width, primaryCoarse.height, primaryInsetsCoarse, pace);
    const secondaryMaskCoarse = yield* buildMask(secondaryCoarse.width, secondaryCoarse.height, secondaryInsetsCoarse, pace);

    const primaryInsetsScore = scaleInsets(
      primaryInsetsFine,
      primaryFine.width,
      primaryFine.height,
      primaryScore.width,
      primaryScore.height
    );
    const secondaryInsetsScore = scaleInsets(
      secondaryInsetsFine,
      secondaryFine.width,
      secondaryFine.height,
      secondaryScore.width,
      secondaryScore.height
    );
    const primaryMaskScore = yield* buildMask(primaryScore.width, primaryScore.height, primaryInsetsScore, pace);
    const secondaryMaskScore = yield* buildMask(secondaryScore.width, secondaryScore.height, secondaryInsetsScore, pace);

    return {
      primaryInsetsFine,
      secondaryInsetsFine,
      primaryMaskFine,
      secondaryMaskFine,
      primaryMaskCoarse,
      secondaryMaskCoarse,
      primaryMaskScore,
      secondaryMaskScore,
    };
  })());
  if (pace()) yield;

  const scalePrior = useScalePrior
    ? estimateScalePrior({
        primaryInsets: primaryInsetsFine,
        secondaryInsets: secondaryInsetsFine,
        primaryWidth: primaryFine.width,
        primaryHeight: primaryFine.height,
        secondaryWidth: secondaryFine.width,
        secondaryHeight: secondaryFine.height,
        scaleMin,
        scaleMax,
      })
    : null;

  const { primaryGradFine, secondaryGradFine, primaryGradCoarse, secondaryGradCoarse, primaryGradScore, secondaryGradScore } =
    yield* measure('gradientsMs', (function* () {
      const primaryGradFine = yield* computeGradientSteps(primaryFine.data, primaryFine.width, primaryFine.height, pace);
      const secondaryGradFine = yield* computeGradientSteps(secondaryFine.data, secondaryFine.width, secondaryFine.height, pace);
      const primaryGradCoarse = yield* computeGradientSteps(primaryCoarse.data, primaryCoarse.width, primaryCoarse.height, pace);
      const secondaryGradCoarse = yield* computeGradientSteps(secondaryCoarse.data, secondaryCoarse.width, secondaryCoarse.height, pace);
      const primaryGradScore =
        primaryScore.width === primaryFine.width && primaryScore.height === primaryFine.height
          ? primaryGradFine
          : yield* computeGradientSteps(primaryScore.data, primaryScore.width, primaryScore.height, pace);
      const secondaryGradScore =
        secondaryScore.width === secondaryFine.width && secondaryScore.height === secondaryFine.height
          ? secondaryGradFine
          : yield* computeGradientSteps(secondaryScore.data, secondaryScore.width, secondaryScore.height, pace);
      return { primaryGradFine, secondaryGradFine, primaryGradCoarse, secondaryGradCoarse, primaryGradScore, secondaryGradScore };
    })());
  if (pace()) yield;

  const { primaryGradFft, secondaryGradFft, primaryFftScale, secondaryFftScale } =
    yield* measure('fftDownsampleMs', (function* () {
      const primaryGradFft = yield* downsampleToMaxSteps(primaryGradFine, primaryFine.width, primaryFine.height, fftMax, pace);
      const secondaryGradFft = yield* downsampleToMaxSteps(secondaryGradFine, secondaryFine.width, secondaryFine.height, fftMax, pace);
      const primaryFftScale = computeDownsampleScale(
        primaryFine.width,
        primaryFine.height,
        primaryGradFft.width,
        primaryGradFft.height
      );
      const secondaryFftScale = computeDownsampleScale(
        secondaryFine.width,
        secondaryFine.height,
        secondaryGradFft.width,
        secondaryGradFft.height
      );
      if (!fftPadW || !fftPadH) {
        fftPadW = nextPow2(primaryGradFft.width);
        fftPadH = nextPow2(primaryGradFft.height);
      }
      if (!fftScale) {
        fftScale = primaryFftScale;
      }
      return {
        primaryGradFft,
        secondaryGradFft,
        primaryFftScale,
        secondaryFftScale,
      };
    })());
  if (pace()) yield;

  const {
    coarseSamples,
    coarsePrep,
    coarseScaleCandidates,
    dxRangeCoarse,
    dyRangeCoarse,
    secondaryMaskFftCoarse,
  } = yield* measure('coarsePrepMs', (function* () {
    const primaryMaskFftCoarse = primaryMaskCoarse;
    const secondaryMaskFftCoarse = secondaryMaskCoarse;
    const coarseSamples = yield* buildSamples(primaryMaskCoarse, primaryCoarse.width, primaryCoarse.height, 2, pace);
    const coarseStep = 0.04;
    const coarseWindow = scalePrior ? Math.max(scaleWindow * 2, 0.06) : Math.abs(scaleMax - scaleMin);
    const coarseMin = clamp((scalePrior ?? scaleMin) - coarseWindow, scaleMin, scaleMax);
    const coarseMax = clamp((scalePrior ?? scaleMax) + coarseWindow, scaleMin, scaleMax);
    const coarseScaleCandidates = buildScaleCandidates(coarseMin, coarseMax, coarseStep);
    const dxRangeCoarse = Math.round(primaryCoarse.width * 0.2);
    const dyRangeCoarse = Math.round(primaryCoarse.height * 0.2);
    const coarsePrep =
      fftBackend === 'wasm' && wasmModule
        ? yield* prepareFftWasm(wasmModule, primaryGradCoarse, primaryMaskFftCoarse, primaryCoarse.width, primaryCoarse.height, pace)
        : yield* prepareFftJs(primaryGradCoarse, primaryMaskFftCoarse, primaryCoarse.width, primaryCoarse.height, pace);
    return {
      coarseSamples,
      coarseScaleCandidates,
      dxRangeCoarse,
      dyRangeCoarse,
      coarsePrep,
      secondaryMaskFftCoarse,
    };
  })());

  const coarseCandidates = yield* measure('coarseSearchMs', (function* () {
    const candidates: AlignmentSearchResult[] = [];
    if (coarseSamples.count > 0) {
      for (const scale of coarseScaleCandidates) {
        if (pace()) yield;
        const scaledSecondary = yield* buildScaledSecondaryForFft({
          grad: secondaryGradCoarse,
          mask: secondaryMaskFftCoarse,
          width: secondaryCoarse.width,
          height: secondaryCoarse.height,
          scale,
          targetW: primaryCoarse.width,
          targetH: primaryCoarse.height,
          anchor: 'center',
          pace,
        });
        const secondaryInput = yield* buildFftInputForPrep(
          coarsePrep,
          scaledSecondary.grad,
          scaledSecondary.mask,
          primaryCoarse.width,
          primaryCoarse.height,
          pace
        );
        const shift = yield* phaseCorrelationShiftForPrep(
          coarsePrep,
          secondaryInput,
          primaryCoarse.width,
          primaryCoarse.height,
          1,
          2,
          pace
        );
        const dx = clamp(shift.dx + scaledSecondary.offsetX, -dxRangeCoarse, dxRangeCoarse);
        const dy = clamp(shift.dy + scaledSecondary.offsetY, -dyRangeCoarse, dyRangeCoarse);
        const refined: { dx: number; dy: number; score: number; coverage: number } = yield* refineTranslation({
          samples: coarseSamples,
          primaryGrad: primaryGradCoarse,
          primaryWidth: primaryCoarse.width,
          secondaryGrad: secondaryGradCoarse,
          secondaryMask: secondaryMaskCoarse,
          secondaryWidth: secondaryCoarse.width,
          secondaryHeight: secondaryCoarse.height,
          scale,
          dx,
          dy,
          range: 2,
          abortCheck,
          pace,
        });
        const entry: AlignmentSearchResult = {
          scale,
          dx: refined.dx,
          dy: refined.dy,
          score: refined.score,
          secondScore: Number.POSITIVE_INFINITY,
          coverage: refined.coverage,
        };
        if (candidates.length < 3) {
          candidates.push(entry);
          candidates.sort((a, b) => a.score - b.score);
        } else if (entry.score < candidates[candidates.length - 1]!.score) {
          candidates[candidates.length - 1] = entry;
          candidates.sort((a, b) => a.score - b.score);
        }
      }
    }
    if (candidates.length === 0) {
      const fallback = yield* searchAlignmentCandidates(
        { ...primaryCoarse, grad: primaryGradCoarse, mask: primaryMaskCoarse },
        { ...secondaryCoarse, grad: secondaryGradCoarse, mask: secondaryMaskCoarse },
        {
          scaleMin,
          scaleMax,
          scaleStep: 0.04,
          dxRange: dxRangeCoarse,
          dyRange: dyRangeCoarse,
          dxStep: 2,
          dyStep: 2,
          stride: 2,
          topK: 3,
          abortCheck,
          pace,
        }
      );
      candidates.push(...fallback);
    }
    if (candidates.length > maxCoarseCandidates) {
      candidates.sort((a, b) => a.score - b.score);
      return candidates.slice(0, maxCoarseCandidates);
    }
    return candidates;
  })());
  disposeFftPrep(coarsePrep);

  const { fineSamples, finePrep, dxRange, dyRange, fineMaskFft, scoreScale, scoreScaleRatio } = yield* measure(
    'finePrepMs',
    (function* () {
      const dxRange = Math.round(primaryFine.width * 0.2);
      const dyRange = Math.round(primaryFine.height * 0.2);
      const scoreScale = primaryScoreScale;
      const scoreScaleRatio = primaryScoreScale / Math.max(1e-6, secondaryScoreScale);
    const fineSamples =
        useEdgeSampling && edgeSampleMax > 0
          ? yield* buildEdgeSamples({
              grad: primaryGradScore,
              mask: primaryMaskScore,
              width: primaryScore.width,
              height: primaryScore.height,
              stride: 1,
              maxSamples: edgeSampleMax,
              pace,
            })
          : yield* buildSamples(primaryMaskScore, primaryScore.width, primaryScore.height, 1, pace);
    const primaryMaskFftFine = yield* downsampleToMaxSteps(primaryMaskFine, primaryFine.width, primaryFine.height, fftMax, pace);
    const secondaryMaskFftFine = yield* downsampleToMaxSteps(secondaryMaskFine, secondaryFine.width, secondaryFine.height, fftMax, pace);
    const finePrep =
      fftBackend === 'wasm' && wasmModule
        ? yield* prepareFftWasm(
            wasmModule,
            primaryGradFft.data,
            primaryMaskFftFine.data,
            primaryGradFft.width,
            primaryGradFft.height,
            pace
          )
        : yield* prepareFftJs(primaryGradFft.data, primaryMaskFftFine.data, primaryGradFft.width, primaryGradFft.height, pace);
      return {
        fineSamples,
        finePrep,
        dxRange,
        dyRange,
        fineMaskFft: secondaryMaskFftFine.data,
        scoreScale,
        scoreScaleRatio,
      };
    })()
  );
  let best: AlignmentSearchResult | null = null;
  let second: AlignmentSearchResult | null = null;
  let bestFftMeta: { peakRatio: number; psr: number; seedCount: number; seedUsed: number } | null = null;
  const topCandidates: AlignmentSearchResult[] = [];
  const fineRange = 2;
  let rescoreSamples: SampleSet | null = null;
  let didRescore = false;

  const evaluateFineScale = function* (scale: number, bestScore?: number): AlignmentSteps<AlignmentSearchResult> {
    const scaleFft = scale * (primaryFftScale / Math.max(1e-6, secondaryFftScale));
    const scaledSecondary = yield* buildScaledSecondaryForFft({
      grad: secondaryGradFft.data,
      mask: fineMaskFft,
      width: secondaryGradFft.width,
      height: secondaryGradFft.height,
      scale: scaleFft,
      targetW: primaryGradFft.width,
      targetH: primaryGradFft.height,
      anchor: 'center',
      pace,
    });
    const secondaryInput = yield* buildFftInputForPrep(
      finePrep,
      scaledSecondary.grad,
      scaledSecondary.mask,
      primaryGradFft.width,
      primaryGradFft.height,
      pace
    );
    const fftSeedCount = 5;
    const fftSeedMinDistance = 4;
    const fftMinPeakRatio = 1.2;
    const fftMinPsr = 6;
    const shift = yield* phaseCorrelationShiftForPrep(
      finePrep,
      secondaryInput,
      primaryGradFft.width,
      primaryGradFft.height,
      fftSeedCount,
      fftSeedMinDistance,
      pace
    );
    const useMultiSeed = shift.psr < fftMinPsr || shift.peakRatio < fftMinPeakRatio;
    const seeds = (shift.seeds.length > 0 ? shift.seeds : [{ dx: shift.dx, dy: shift.dy, peak: shift.peak }]).slice(
      0,
      useMultiSeed ? fftSeedCount : 1
    );
    const range = useMultiSeed ? fineRange + 1 : fineRange;
    let bestLocal: AlignmentSearchResult | null = null;
    for (const seed of seeds) {
      const dxSeed = seed.dx + scaledSecondary.offsetX;
      const dySeed = seed.dy + scaledSecondary.offsetY;
      const dxFine = dxSeed / Math.max(1e-6, primaryFftScale);
      const dyFine = dySeed / Math.max(1e-6, primaryFftScale);
      const dx = clamp(dxFine, -dxRange, dxRange);
      const dy = clamp(dyFine, -dyRange, dyRange);
      const dxScore = dx * scoreScale;
      const dyScore = dy * scoreScale;
      const scaleScore = scale * scoreScaleRatio;
      const refined: { dx: number; dy: number; score: number; coverage: number } = yield* refineTranslation({
        samples: fineSamples,
        primaryGrad: primaryGradScore,
        primaryWidth: primaryScore.width,
        secondaryGrad: secondaryGradScore,
        secondaryMask: secondaryMaskScore,
        secondaryWidth: secondaryScore.width,
        secondaryHeight: secondaryScore.height,
        scale: scaleScore,
        dx: dxScore,
        dy: dyScore,
        range,
        bestScore: earlyExit ? bestScore ?? bestLocal?.score : undefined,
        abortCheck,
        pace,
      });
      const candidate: AlignmentSearchResult = {
        scale,
        dx: refined.dx / Math.max(1e-6, scoreScale),
        dy: refined.dy / Math.max(1e-6, scoreScale),
        score: refined.score,
        secondScore: Number.POSITIVE_INFINITY,
        coverage: refined.coverage,
        fftPeakRatio: shift.peakRatio,
        fftPsr: shift.psr,
        fftSeedCount: shift.seeds.length,
        fftSeedUsed: seeds.length,
      };
      if (!bestLocal || candidate.score < bestLocal.score) {
        bestLocal = candidate;
      }
    }
    return bestLocal ?? {
      scale,
      dx: 0,
      dy: 0,
      score: Number.POSITIVE_INFINITY,
      secondScore: Number.POSITIVE_INFINITY,
      coverage: 0,
    };
  };

  const fineScaleStepBase = scaleStep;
  const fineResults = new Map<string, AlignmentSearchResult>();
  const scaleKey = (value: number) => value.toFixed(4);

  const refineScaleSubpixel = (best: AlignmentSearchResult, step: number): AlignmentSearchResult | null => {
    const left = fineResults.get(scaleKey(best.scale - step));
    const center = fineResults.get(scaleKey(best.scale));
    const right = fineResults.get(scaleKey(best.scale + step));
    if (!left || !center || !right) return null;
    if (!Number.isFinite(left.score) || !Number.isFinite(center.score) || !Number.isFinite(right.score)) return null;
    const denom = left.score - 2 * center.score + right.score;
    if (Math.abs(denom) < 1e-6) return null;
    let offset = 0.5 * (left.score - right.score) / denom;
    offset = clamp(offset, -0.5, 0.5);
    const refinedScale = clamp(center.scale + offset * step, scaleMin, scaleMax);
    const t = Math.abs(offset);
    const neighbor = offset >= 0 ? right : left;
    return {
      scale: refinedScale,
      dx: center.dx + (neighbor.dx - center.dx) * t,
      dy: center.dy + (neighbor.dy - center.dy) * t,
      score: center.score + (neighbor.score - center.score) * t,
      secondScore: center.secondScore,
      coverage: center.coverage + (neighbor.coverage - center.coverage) * t,
    };
  };

  let fineScaleCount = 0;
  yield* measure('fineSearchMs', (function* () {
    const fineCandidates = coarseCandidates;
    for (const candidate of fineCandidates) {
      if (pace()) yield;
      const fineScaleCenter = clamp(candidate.scale, scaleMin, scaleMax);
      const window = scalePrior ? scaleWindow : Math.min(scaleWindow, 0.05);
      const fineScaleMin = clamp(fineScaleCenter - window, scaleMin, scaleMax);
      const fineScaleMax = clamp(fineScaleCenter + window, scaleMin, scaleMax);
      const span = Math.max(0, fineScaleMax - fineScaleMin);
      const step =
        maxFineScales > 1 && span > 0
          ? Math.max(fineScaleStepBase, span / Math.max(1, maxFineScales - 1))
          : fineScaleStepBase;
      const fineScales = buildScaleCandidates(fineScaleMin, fineScaleMax, step);

      for (const scale of fineScales) {
        if (pace()) yield;
        const result: AlignmentSearchResult = yield* evaluateFineScale(scale, best?.score);
        fineResults.set(scaleKey(result.scale), result);
        if (!best || result.score < best.score) {
          second = best;
          best = result;
          if (result.fftPeakRatio != null && result.fftPsr != null) {
            bestFftMeta = {
              peakRatio: result.fftPeakRatio,
              psr: result.fftPsr,
              seedCount: result.fftSeedCount ?? 0,
              seedUsed: result.fftSeedUsed ?? 0,
            };
          }
        } else if (!second || result.score < second.score) {
          second = result;
        }
        if (rescoreTopK > 0) {
          if (topCandidates.length < rescoreTopK) {
            topCandidates.push(result);
            topCandidates.sort((a, b) => a.score - b.score);
          } else if (result.score < topCandidates[topCandidates.length - 1]!.score) {
            topCandidates[topCandidates.length - 1] = result;
            topCandidates.sort((a, b) => a.score - b.score);
          }
        }
        fineScaleCount += 1;
      }
    }
  })());
  disposeFftPrep(finePrep);

  if (useCoarseToFineScore && scoreMax < fineMax && topCandidates.length > 0) {
    rescoreSamples =
      useEdgeSampling && edgeSampleMax > 0
        ? yield* buildEdgeSamples({
            grad: primaryGradFine,
            mask: primaryMaskFine,
            width: primaryFine.width,
            height: primaryFine.height,
            stride: 1,
            maxSamples: edgeSampleMax,
            pace,
          })
        : yield* buildSamples(primaryMaskFine, primaryFine.width, primaryFine.height, 1, pace);

    const rescored: AlignmentSearchResult[] = [];
    let rescoreBest = Number.POSITIVE_INFINITY;
    for (const candidate of topCandidates) {
      if (pace()) yield;
      const refined: { dx: number; dy: number; score: number; coverage: number } = yield* refineTranslation({
        samples: rescoreSamples,
        primaryGrad: primaryGradFine,
        primaryWidth: primaryFine.width,
        secondaryGrad: secondaryGradFine,
        secondaryMask: secondaryMaskFine,
        secondaryWidth: secondaryFine.width,
        secondaryHeight: secondaryFine.height,
        scale: candidate.scale,
        dx: candidate.dx,
        dy: candidate.dy,
        range: fineRange,
        bestScore: earlyExit ? rescoreBest : undefined,
        abortCheck,
        pace,
      });
      const entry: AlignmentSearchResult = {
        scale: candidate.scale,
        dx: refined.dx,
        dy: refined.dy,
        score: refined.score,
        secondScore: candidate.secondScore,
        coverage: refined.coverage,
      };
      rescored.push(entry);
      if (entry.score < rescoreBest) rescoreBest = entry.score;
    }
    rescored.sort((a, b) => a.score - b.score);
    if (rescored[0]) {
      best = rescored[0];
      second = rescored[1] ?? second;
      didRescore = true;
    }
  }

  if (!best) {
    best = {
      scale: 1,
      dx: 0,
      dy: 0,
      score: Number.POSITIVE_INFINITY,
      secondScore: Number.POSITIVE_INFINITY,
      coverage: 0,
    };
  }
  best.secondScore = second?.score ?? best.score;
  const refinedScale = measureSync('refineScaleMs', () => refineScaleSubpixel(best!, fineScaleStepBase));
  const fineResult = refinedScale && refinedScale.score < best.score ? refinedScale : best;
  const identitySamples = didRescore ? rescoreSamples ?? fineSamples : fineSamples;
  const identityScale = didRescore ? 1 : scoreScaleRatio;
  const identityPrimaryGrad = didRescore ? primaryGradFine : primaryGradScore;
  const identitySecondaryGrad = didRescore ? secondaryGradFine : secondaryGradScore;
  const identitySecondaryMask = didRescore ? secondaryMaskFine : secondaryMaskScore;
  const identityPrimary = didRescore ? primaryFine : primaryScore;
  const identitySecondary = didRescore ? secondaryFine : secondaryScore;
  const identityScore = measureSync('identityMs', () =>
    scoreAlignment(
      identitySamples,
      identityPrimaryGrad,
      identityPrimary.width,
      identitySecondaryGrad,
      identitySecondaryMask,
      identitySecondary.width,
      identitySecondary.height,
      identityScale,
      0,
      0,
      undefined,
      abortCheck
    )
  );

  const runBruteFallback = function* (): AlignmentSteps<AlignmentSearchResult> {
    const coarseFallback = yield* searchAlignmentCandidates(
      { ...primaryCoarse, grad: primaryGradCoarse, mask: primaryMaskCoarse },
      { ...secondaryCoarse, grad: secondaryGradCoarse, mask: secondaryMaskCoarse },
      {
        scaleMin,
        scaleMax,
        scaleStep: 0.04,
        dxRange: dxRangeCoarse,
        dyRange: dyRangeCoarse,
        dxStep: 2,
        dyStep: 2,
        stride: 2,
        topK: 3,
        abortCheck,
        pace,
      }
    );

    const fallbackSamples =
      useEdgeSampling && edgeSampleMax > 0
        ? yield* buildEdgeSamples({
            grad: primaryGradFine,
            mask: primaryMaskFine,
            width: primaryFine.width,
            height: primaryFine.height,
            stride: 1,
            maxSamples: edgeSampleMax,
            pace,
          })
        : yield* buildSamples(primaryMaskFine, primaryFine.width, primaryFine.height, 1, pace);
    const fallbackRange = 10;

    let fallbackBest: AlignmentSearchResult | null = null;
    let fallbackSecond: AlignmentSearchResult | null = null;
    for (const candidate of coarseFallback) {
      if (pace()) yield;
      const fineScaleCenter = clamp(candidate.scale, scaleMin, scaleMax);
      const fineScaleMin = clamp(fineScaleCenter - 0.05, scaleMin, scaleMax);
      const fineScaleMax = clamp(fineScaleCenter + 0.05, scaleMin, scaleMax);
      const fineDxCenter = Math.round(candidate.dx * (primaryFine.width / Math.max(1, primaryCoarse.width)));
      const fineDyCenter = Math.round(candidate.dy * (primaryFine.height / Math.max(1, primaryCoarse.height)));
      const fineScales = buildScaleCandidates(fineScaleMin, fineScaleMax, 0.01);

      let localBest: AlignmentSearchResult | null = null;
      let localSecond: AlignmentSearchResult | null = null;
      for (const scale of fineScales) {
        if (pace()) yield;
        const dx = clamp(fineDxCenter, -dxRange, dxRange);
        const dy = clamp(fineDyCenter, -dyRange, dyRange);
        const refined: { dx: number; dy: number; score: number; coverage: number } = yield* refineTranslation({
          samples: fallbackSamples,
          primaryGrad: primaryGradFine,
          primaryWidth: primaryFine.width,
          secondaryGrad: secondaryGradFine,
          secondaryMask: secondaryMaskFine,
          secondaryWidth: secondaryFine.width,
          secondaryHeight: secondaryFine.height,
          scale,
          dx,
          dy,
          range: fallbackRange,
          bestScore: earlyExit ? localBest?.score : undefined,
          abortCheck,
          pace,
        });
        const entry: AlignmentSearchResult = {
          scale,
          dx: refined.dx,
          dy: refined.dy,
          score: refined.score,
          secondScore: Number.POSITIVE_INFINITY,
          coverage: refined.coverage,
        };
        if (!localBest || entry.score < localBest.score) {
          localSecond = localBest;
          localBest = entry;
        } else if (!localSecond || entry.score < localSecond.score) {
          localSecond = entry;
        }
      }
      if (!localBest) continue;
      localBest.secondScore = localSecond?.score ?? localBest.score;
      if (!fallbackBest || localBest.score < fallbackBest.score) {
        fallbackSecond = fallbackBest;
        fallbackBest = localBest;
      } else if (!fallbackSecond || localBest.score < fallbackSecond.score) {
        fallbackSecond = localBest;
      }
    }

    if (!fallbackBest) {
      return {
        scale: 1,
        dx: 0,
        dy: 0,
        score: Number.POSITIVE_INFINITY,
        secondScore: Number.POSITIVE_INFINITY,
        coverage: 0,
      };
    }
    fallbackBest.secondScore = fallbackSecond?.score ?? fallbackBest.score;
    return fallbackBest;
  };

  let finalResult = fineResult;
  if (!Number.isFinite(finalResult.score) || finalResult.score >= identityScore.score - 1) {
    finalResult = yield* measure('fallbackMs', runBruteFallback());
  }

  const bestScore = finalResult.score;
  const improvement = identityScore.score - bestScore;
  const relativeImprovement = improvement / Math.max(1, identityScore.score);
  const stability = (finalResult.secondScore - bestScore) / Math.max(1, bestScore);
  const coverageBoost = Math.min(1, finalResult.coverage / 0.7);

  let confidence = 0;
  const minImprovement = Math.max(3, identityScore.score * 0.08);
  if (Number.isFinite(bestScore) && improvement > minImprovement && finalResult.coverage >= 0.35) {
    confidence = clamp(relativeImprovement * 0.5 + stability * 0.3 + coverageBoost * 0.2, 0, 1);
  }

  const crop = { top: 0, right: 0, bottom: 0, left: 0 };
  const timingPayload = timings
    ? ({
        totalMs: now() - totalStart,
        downsampleMs: timings.downsampleMs ?? 0,
        insetsMs: timings.insetsMs ?? 0,
        gradientsMs: timings.gradientsMs ?? 0,
        fftDownsampleMs: timings.fftDownsampleMs ?? 0,
        coarsePrepMs: timings.coarsePrepMs ?? 0,
        coarseSearchMs: timings.coarseSearchMs ?? 0,
        finePrepMs: timings.finePrepMs ?? 0,
        fineSearchMs: timings.fineSearchMs ?? 0,
        refineScaleMs: timings.refineScaleMs ?? 0,
        identityMs: timings.identityMs ?? 0,
        fallbackMs: timings.fallbackMs ?? 0,
      } satisfies AlignmentTimings)
    : undefined;
  const debugPayload: AlignmentDebug = {
    scalePrior,
    scaleWindow,
    scaleStep,
    fineScaleCount,
    coarseScaleCount: coarseScaleCandidates.length,
    fftMax,
    fftPolicy,
    fftBudget,
    fftPadW,
    fftPadH,
    fftScale,
    fftPeakRatio: (bestFftMeta as { peakRatio: number } | null)?.peakRatio ?? 0,
    fftPsr: (bestFftMeta as { psr: number } | null)?.psr ?? 0,
    fftSeedCount: (bestFftMeta as { seedCount: number } | null)?.seedCount ?? 0,
    fftSeedUsed: (bestFftMeta as { seedUsed: number } | null)?.seedUsed ?? 0,
    fftBackend,
    fftRequested,
    wasmReady,
    scoreMax,
    useCoarseToFineScore,
    useEdgeSampling,
    edgeSampleMax,
    earlyExit,
    scoreSampleCount: fineSamples.count,
    rescoreTopK,
  };
  if (confidence < 0.2) {
    return {
      crop: { top: 0, right: 0, bottom: 0, left: 0 },
      scale: 1,
      dx: 0,
      dy: 0,
      confidence,
      score: identityScore.score,
      identityScore: identityScore.score,
      coverage: identityScore.coverage,
      timings: timingPayload,
      debug: debugPayload,
    };
  }

  return {
    crop,
    scale: finalResult.scale,
    dx: finalResult.dx / Math.max(1, primaryFine.width),
    dy: finalResult.dy / Math.max(1, primaryFine.height),
    confidence,
    score: bestScore,
    identityScore: identityScore.score,
    coverage: finalResult.coverage,
    timings: timingPayload,
    debug: debugPayload,
  };
}
