import type { WorkerRequest, WorkerResponse } from './dhash.worker';
import type { MultiDhash } from '@/lib/dual-reader/hash';
import { deserializeMultiDhash } from '@/lib/dual-reader/hash-serialization';

type PendingEntry = {
  resolve: (hash: MultiDhash) => void;
  reject: (err: Error) => void;
};

let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<string, PendingEntry>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./dhash.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data;
      if (!msg || msg.type !== 'hash') return;
      const entry = pending.get(msg.id);
      if (!entry) return;
      pending.delete(msg.id);
      if (msg.ok) {
        entry.resolve(deserializeMultiDhash(msg.hash));
      } else {
        entry.reject(new Error(msg.error));
      }
    };
    worker.onerror = () => {
      const err = new Error('Dual Read worker failed');
      pending.forEach((entry) => entry.reject(err));
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
}): Promise<MultiDhash> {
  const w = getWorker();
  const id = `dhash:${nextId++}`;
  const request: WorkerRequest = {
    type: 'hash',
    id,
    mode: input.mode,
    image: input.image,
    centerCropRatio: input.centerCropRatio,
  };
  return new Promise<MultiDhash>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    try {
      w.postMessage(request);
    } catch (err) {
      pending.delete(id);
      reject(err instanceof Error ? err : new Error('Failed to post hash request'));
    }
  });
}
