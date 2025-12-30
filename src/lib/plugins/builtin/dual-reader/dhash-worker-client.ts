import type { WorkerRequest, WorkerResponse } from './dhash.worker';
import type { MultiDhash } from '@/lib/dual-reader/hash';
import { deserializeMultiDhash } from '@/lib/dual-reader/hash-serialization';
import type { AlignmentResult, AlignmentWorkerOptions } from '@/lib/dual-reader/visual-alignment';

type PendingEntry =
  | {
      kind: 'hash';
      resolve: (hash: MultiDhash) => void;
      reject: (err: Error) => void;
      cleanup?: () => void;
    }
  | {
      kind: 'align';
      resolve: (result: AlignmentResult) => void;
      reject: (err: Error) => void;
      cleanup?: () => void;
      aborted?: string;
    };

let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<string, PendingEntry>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./dhash.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data;
      if (!msg) return;
      const entry = pending.get(msg.id);
      if (!entry) return;
      pending.delete(msg.id);
      entry.cleanup?.();
      if (entry.kind === 'align' && entry.aborted) {
        entry.reject(new Error(entry.aborted));
        return;
      }
      if (msg.type === 'hash') {
        if (entry.kind !== 'hash') return;
        if (msg.ok) {
          entry.resolve(deserializeMultiDhash(msg.hash));
        } else {
          entry.reject(new Error(msg.error));
        }
        return;
      }
      if (msg.type === 'align') {
        if (entry.kind !== 'align') return;
        if (msg.ok) {
          entry.resolve(msg.result);
        } else {
          entry.reject(new Error(msg.error));
        }
      }
    };
    worker.onerror = () => {
      const err = new Error('Dual Read worker failed');
      pending.forEach((entry) => {
        entry.cleanup?.();
        entry.reject(err);
      });
      pending.clear();
      worker?.terminate();
      worker = null;
    };
  }
  return worker;
}

export function disposeDualReadWorker() {
  if (!worker) return;
  const w = worker;
  worker = null;
  pending.forEach((entry) => entry.reject(new Error('Dual Read worker disposed')));
  pending.clear();
  try {
    w.postMessage({ type: 'dispose' } satisfies WorkerRequest);
  } catch {
    // ignore
  }
  w.terminate();
}

export function computeDualReadHashInWorker(input: {
  image: Blob;
  mode: 'primary' | 'secondary';
  centerCropRatio?: number;
  cacheId?: string;
  sampleMax?: number;
}): Promise<MultiDhash> {
  const w = getWorker();
  const id = `dhash:${nextId++}`;
  const request: WorkerRequest = {
    type: 'hash',
    id,
    mode: input.mode,
    image: input.image,
    centerCropRatio: input.centerCropRatio,
    cacheId: input.cacheId,
    sampleMax: input.sampleMax,
  };
  return new Promise<MultiDhash>((resolve, reject) => {
    pending.set(id, { kind: 'hash', resolve, reject });
    try {
      w.postMessage(request);
    } catch (err) {
      pending.delete(id);
      reject(err instanceof Error ? err : new Error('Failed to post hash request'));
    }
  });
}

export function computeDualReadAlignmentInWorker(input: {
  primaryId: string;
  plan:
    | { kind: 'single'; secondaryId: string }
    | { kind: 'split'; secondaryId: string; side: 'left' | 'right' }
    | { kind: 'merge'; secondaryIds: [string, string]; order: 'normal' | 'swap' };
  options?: AlignmentWorkerOptions;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<AlignmentResult> {
  const w = getWorker();
  const id = `align:${nextId++}`;
  const abortBuffer = typeof SharedArrayBuffer !== 'undefined' ? new SharedArrayBuffer(4) : undefined;
  const abortView = abortBuffer ? new Int32Array(abortBuffer) : null;
  const request: WorkerRequest = {
    type: 'align',
    id,
    primaryId: input.primaryId,
    plan: input.plan,
    timeoutMs: input.timeoutMs,
    abortBuffer,
    options: input.options,
  };
  return new Promise<AlignmentResult>((resolve, reject) => {
    if (input.signal?.aborted) {
      reject(new Error('Alignment aborted'));
      return;
    }
    const entry: PendingEntry = { kind: 'align', resolve, reject };
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let killId: ReturnType<typeof setTimeout> | null = null;
    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (killId) clearTimeout(killId);
      timeoutId = null;
      killId = null;
      if (input.signal) input.signal.removeEventListener('abort', onAbort);
    };
    const triggerAbort = (reason: string) => {
      if (entry.aborted) return;
      entry.aborted = reason;
      if (abortView) Atomics.store(abortView, 0, 1);
      killId = setTimeout(() => {
        if (!pending.has(id)) return;
        pending.delete(id);
        cleanup();
        reject(new Error(reason));
        disposeDualReadWorker();
      }, 200);
    };
    const onAbort = () => triggerAbort('Alignment aborted');
    entry.cleanup = cleanup;
    pending.set(id, entry);
    if (input.signal) {
      if (input.signal.aborted) {
        triggerAbort('Alignment aborted');
      } else {
        input.signal.addEventListener('abort', onAbort, { once: true });
      }
    }
    if (input.timeoutMs && input.timeoutMs > 0) {
      timeoutId = setTimeout(() => triggerAbort('Alignment timeout'), input.timeoutMs);
    }
    try {
      w.postMessage(request);
    } catch (err) {
      pending.delete(id);
      cleanup();
      reject(err instanceof Error ? err : new Error('Failed to post alignment request'));
    }
  });
}

export function clearDualReadWorkerCache(ids?: string[]) {
  if (!worker) return;
  const request: WorkerRequest = { type: 'clearCache', ids };
  try {
    worker.postMessage(request);
  } catch {
    // ignore
  }
}

export function getDualReadWorkerPendingCount() {
  return pending.size;
}

export function getDualReadWorkerPendingStats() {
  let hash = 0;
  let align = 0;
  pending.forEach((entry) => {
    if (entry.kind === 'hash') hash += 1;
    if (entry.kind === 'align') align += 1;
  });
  return { total: pending.size, hash, align };
}
