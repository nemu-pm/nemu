import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { computeDualReadAlignmentInWorker, computeDualReadHashInWorker, disposeDualReadWorker } from './dhash-worker-client';
import type { WorkerRequest, WorkerResponse } from './dhash.worker';

class FakeWorker {
  static last: FakeWorker | null = null;
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null = null;
  onerror: (() => void) | null = null;
  messages: WorkerRequest[] = [];
  terminated = false;

  constructor() {
    FakeWorker.last = this;
  }

  postMessage(msg: WorkerRequest) {
    this.messages.push(msg);
  }

  terminate() {
    this.terminated = true;
  }
}

describe('dual-read worker alignment client', () => {
  const OriginalWorker = globalThis.Worker;

  beforeEach(() => {
    FakeWorker.last = null;
    globalThis.Worker = FakeWorker as unknown as typeof Worker;
  });

  afterEach(() => {
    disposeDualReadWorker();
    globalThis.Worker = OriginalWorker;
  });

  it('resolves alignment responses', async () => {
    const promise = computeDualReadAlignmentInWorker({
      primaryId: 'primary',
      plan: { kind: 'single', secondaryId: 'secondary' },
      timeoutMs: 500,
    });
    const worker = FakeWorker.last;
    expect(worker).not.toBeNull();
    const request = worker?.messages[0];
    if (!request || request.type !== 'align') {
      throw new Error('Expected align request');
    }
    const response: WorkerResponse = {
      type: 'align',
      id: request.id,
      ok: true,
      result: {
        crop: { top: 0, right: 0, bottom: 0, left: 0 },
        scale: 1,
        dx: 0,
        dy: 0,
        confidence: 1,
        score: 0,
        identityScore: 0,
        coverage: 1,
      },
    };
    worker?.onmessage?.({ data: response } as MessageEvent<WorkerResponse>);
    const result = await promise;
    expect(result.scale).toBe(1);
  });

  it('times out and aborts alignment', async () => {
    const promise = computeDualReadAlignmentInWorker({
      primaryId: 'primary',
      plan: { kind: 'single', secondaryId: 'secondary' },
      timeoutMs: 10,
    });
    await expect(promise).rejects.toThrow(/timeout/i);
    const worker = FakeWorker.last;
    expect(worker?.terminated).toBe(true);
  });

  it('aborts alignment via signal', async () => {
    const controller = new AbortController();
    const promise = computeDualReadAlignmentInWorker({
      primaryId: 'primary',
      plan: { kind: 'single', secondaryId: 'secondary' },
      timeoutMs: 500,
      signal: controller.signal,
    });
    controller.abort();
    await expect(promise).rejects.toThrow(/aborted/i);
    const worker = FakeWorker.last;
    expect(worker?.terminated).toBe(true);
  });

  it('includes sampleMax in hash requests', async () => {
    const promise = computeDualReadHashInWorker({
      image: new Blob([new Uint8Array([0])]),
      mode: 'primary',
      cacheId: 'cache',
      sampleMax: 512,
    });
    const worker = FakeWorker.last;
    expect(worker).not.toBeNull();
    const request = worker?.messages[0];
    if (!request || request.type !== 'hash') {
      throw new Error('Expected hash request');
    }
    expect(request.sampleMax).toBe(512);
    const response: WorkerResponse = {
      type: 'hash',
      id: request.id,
      ok: true,
      hash: { full: { h: '0', v: '0' } },
    };
    worker?.onmessage?.({ data: response } as MessageEvent<WorkerResponse>);
    await promise;
  });
});
