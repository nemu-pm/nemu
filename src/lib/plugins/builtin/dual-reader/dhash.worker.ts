/// <reference lib="webworker" />

import { computeMultiDhash } from '@/lib/dual-reader/hash';
import { serializeMultiDhash } from '@/lib/dual-reader/hash-serialization';

export type WorkerRequest =
  | {
      type: 'hash';
      id: string;
      mode: 'primary' | 'secondary';
      image: Blob;
      centerCropRatio?: number;
    }
  | { type: 'dispose' };

export type WorkerResponse =
  | { type: 'hash'; id: string; ok: true; hash: ReturnType<typeof serializeMultiDhash> }
  | { type: 'hash'; id: string; ok: false; error: string };

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

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  if (!msg) return;

  if (msg.type === 'dispose') {
    self.close();
    return;
  }

  if (msg.type !== 'hash') return;

  try {
    const { data, width, height } = await decodeImage(msg.image);
    const input = { data, width, height, channels: 4 };
    const hash = computeMultiDhash(input, {
      split: true,
      centerCropRatio: msg.centerCropRatio,
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
