/// <reference lib="webworker" />

import { computeMultiDhash } from '@/lib/dual-reader/hash';
import { serializeMultiDhash } from '@/lib/dual-reader/hash-serialization';
import { downsampleToMax, toLuma } from '@/lib/dual-reader/image';
import { initAlignmentWasm } from '@/lib/dual-reader/fft-wasm';
import { buildMergeLuma, buildSplitLuma, computeAlignmentTransform } from '@/lib/dual-reader/visual-alignment';
import { buildAlignmentOptions } from '@/lib/dual-reader/alignment-options';
import { ALIGNMENT_FINE_MAX_DEFAULT, ALIGNMENT_FFT_MAX_DEFAULT } from '@/lib/dual-reader/alignment-constants';
import type { AlignmentResult, AlignmentWorkerOptions } from '@/lib/dual-reader/visual-alignment';

export type WorkerRequest =
  | {
      type: 'hash';
      id: string;
      mode: 'primary' | 'secondary';
      image: Blob;
      centerCropRatio?: number;
      cacheId?: string;
      sampleMax?: number;
    }
  | {
      type: 'align';
      id: string;
      primaryId: string;
      timeoutMs?: number;
      abortBuffer?: SharedArrayBuffer;
      options?: AlignmentWorkerOptions;
      plan:
        | { kind: 'single'; secondaryId: string }
        | { kind: 'split'; secondaryId: string; side: 'left' | 'right' }
        | { kind: 'merge'; secondaryIds: [string, string]; order: 'normal' | 'swap' };
    }
  | { type: 'clearCache'; ids?: string[] }
  | { type: 'dispose' };

export type WorkerResponse =
  | { type: 'hash'; id: string; ok: true; hash: ReturnType<typeof serializeMultiDhash> }
  | { type: 'hash'; id: string; ok: false; error: string }
  | { type: 'align'; id: string; ok: true; result: AlignmentResult }
  | { type: 'align'; id: string; ok: false; error: string };

async function decodeImage(blob: Blob): Promise<{ data: Uint8ClampedArray; width: number; height: number }> {
  if (typeof createImageBitmap !== 'function') {
    throw new Error('createImageBitmap is not available');
  }
  if (typeof OffscreenCanvas !== 'function') {
    throw new Error('OffscreenCanvas is not available');
  }
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    throw new Error('Failed to create canvas context');
  }
  ctx.drawImage(bitmap, 0, 0);
  const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  bitmap.close();
  return { data: imageData.data, width: imageData.width, height: imageData.height };
}

const ALIGN_SAMPLE_MAX = ALIGNMENT_FINE_MAX_DEFAULT;
const ALIGN_FFT_MAX = Math.min(ALIGNMENT_FFT_MAX_DEFAULT, ALIGN_SAMPLE_MAX);
const sampleCache = new Map<string, { data: Uint8Array; width: number; height: number }>();
let wasmInitPromise: Promise<boolean> | null = null;

const ensureWasmReady = () => {
  if (!wasmInitPromise) {
    wasmInitPromise = initAlignmentWasm();
  }
  return wasmInitPromise;
};

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  if (!msg) return;

  if (msg.type === 'clearCache') {
    if (!msg.ids || msg.ids.length === 0) {
      sampleCache.clear();
      return;
    }
    for (const id of msg.ids) {
      sampleCache.delete(id);
    }
    return;
  }

  if (msg.type === 'dispose') {
    sampleCache.clear();
    self.close();
    return;
  }

  if (msg.type === 'align') {
    try {
      await ensureWasmReady();
      const startedAt = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
      const deadline = typeof msg.timeoutMs === 'number' ? startedAt + msg.timeoutMs : null;
      const abortView = msg.abortBuffer ? new Int32Array(msg.abortBuffer) : null;
      const abortCheck = () => {
        if (abortView && Atomics.load(abortView, 0) === 1) {
          throw new Error('Alignment aborted');
        }
        if (deadline != null) {
          const now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
          if (now > deadline) {
            throw new Error('Alignment timeout');
          }
        }
      };
      const primary = sampleCache.get(msg.primaryId);
      if (!primary) throw new Error('Missing primary sample');
      let secondary = sampleCache.get(
        msg.plan.kind === 'merge' ? msg.plan.secondaryIds[0] : msg.plan.secondaryId
      );
      if (!secondary) throw new Error('Missing secondary sample');

      if (msg.plan.kind === 'split') {
        secondary = buildSplitLuma(secondary, msg.plan.side);
      } else if (msg.plan.kind === 'merge') {
        const secondaryB = sampleCache.get(msg.plan.secondaryIds[1]);
        if (!secondaryB) throw new Error('Missing secondary sample (merge)');
        secondary = buildMergeLuma(secondary, secondaryB, msg.plan.order);
      }

      const fineMax = Math.min(ALIGN_SAMPLE_MAX, msg.options?.fineMax ?? ALIGN_SAMPLE_MAX);
      const fftMax = Math.min(ALIGN_FFT_MAX, msg.options?.fftMax ?? ALIGN_FFT_MAX, fineMax);
      const result = computeAlignmentTransform({
        primary,
        secondary,
        options: buildAlignmentOptions({
          ...msg.options,
          fineMax,
          fftMax,
          fftBackend: 'wasm',
          abortCheck,
        }),
      });
      const payload: WorkerResponse = {
        type: 'align',
        id: msg.id,
        ok: true,
        result,
      };
      self.postMessage(payload);
    } catch (err) {
      const payload: WorkerResponse = {
        type: 'align',
        id: msg.id,
        ok: false,
        error: err instanceof Error ? err.message : 'Alignment failed',
      };
      self.postMessage(payload);
    }
    return;
  }

  if (msg.type !== 'hash') return;

  try {
    const { data, width, height } = await decodeImage(msg.image);
    const input = { data, width, height, channels: 4 };
    const luma = toLuma(input);
    if (msg.cacheId) {
      const sampleMax = msg.sampleMax ?? ALIGN_SAMPLE_MAX;
      const sample = downsampleToMax(luma, width, height, sampleMax);
      sampleCache.set(msg.cacheId, sample);
    }
    const hash = computeMultiDhash(input, {
      split: true,
      centerCropRatio: msg.centerCropRatio,
      luma,
    });
    const payload: WorkerResponse = { type: 'hash', id: msg.id, ok: true, hash: serializeMultiDhash(hash) };
    self.postMessage(payload);
  } catch (err) {
    const payload: WorkerResponse = {
      type: 'hash',
      id: msg.id,
      ok: false,
      error: err instanceof Error ? err.message : 'Hashing failed',
    };
    self.postMessage(payload);
  }
};
