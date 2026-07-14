import { describe, expect, test } from "bun:test";
import type { AlignmentOptions, AlignmentResult, LumaImage } from "@nemu/core/dual-reader";
import { createMobileDualReaderAlignThread, type AlignThreadJobPayload } from "./mobileDualReaderAlignThread";

function luma(): LumaImage {
  return { data: new Uint8Array(4).fill(1), width: 2, height: 2 };
}

function result(confidence = 0.9): AlignmentResult {
  return {
    crop: { top: 0, right: 0, bottom: 0, left: 0 },
    scale: 1,
    dx: 0,
    dy: 0,
    confidence,
    score: 0,
    identityScore: 1,
    coverage: 1,
  };
}

function options(): AlignmentOptions {
  return { fineMax: 512, fftMax: 256, fftBackend: "js" };
}

/** A fake schedule that resolves only when `release()` is called, so we can
 * observe concurrency limits precisely. */
function gatedSchedule() {
  let inflight: ((r: AlignmentResult) => void)[] = [];
  const calls: AlignThreadJobPayload[] = [];
  const schedule = (payload: AlignThreadJobPayload): Promise<AlignmentResult> => {
    calls.push(payload);
    return new Promise<AlignmentResult>((resolve) => {
      inflight.push(resolve);
    });
  };
  const releaseAll = () => {
    const pending = inflight;
    inflight = [];
    pending.forEach((r) => r(result()));
  };
  return { schedule, releaseAll, calls, inflightCount: () => inflight.length };
}

describe("mobileDualReaderAlignThread", () => {
  test("runs up to maxConcurrency (2) concurrently and queues the rest", async () => {
    const gate = gatedSchedule();
    const thread = createMobileDualReaderAlignThread({ schedule: gate.schedule });
    const p1 = thread.runAlignment({ primary: luma(), secondary: luma(), options: options() });
    const p2 = thread.runAlignment({ primary: luma(), secondary: luma(), options: options() });
    const p3 = thread.runAlignment({ primary: luma(), secondary: luma(), options: options() });

    // Two in flight; third queued.
    await Promise.resolve();
    expect(gate.inflightCount()).toBe(2);
    expect(gate.calls.length).toBe(2);

    gate.releaseAll();
    await Promise.all([p1, p2]);
    // Third now starts.
    await Promise.resolve();
    expect(gate.inflightCount()).toBe(1);
    expect(gate.calls.length).toBe(3);
    gate.releaseAll();
    await p3;
    thread.dispose();
  });

  test("runAlignment resolves with the schedule result", async () => {
    let resolve!: (r: AlignmentResult) => void;
    const schedule = () => new Promise<AlignmentResult>((r) => { resolve = r; });
    const thread = createMobileDualReaderAlignThread({ schedule });
    const p = thread.runAlignment({ primary: luma(), secondary: luma(), options: options() });
    await new Promise((r) => setTimeout(r, 0)); // flush microtasks so schedule() runs
    resolve(result(0.42));
    const got = await p;
    expect(got.confidence).toBe(0.42);
    thread.dispose();
  });

  test("schedule errors reject the job and free the slot", async () => {
    let reject!: (e: unknown) => void;
    const schedule = () => new Promise<AlignmentResult>((_r, rej) => { reject = rej; });
    const thread = createMobileDualReaderAlignThread({ schedule });
    const p = thread.runAlignment({ primary: luma(), secondary: luma(), options: options() });
    await new Promise((r) => setTimeout(r, 0)); // flush microtasks so schedule() runs
    reject(new Error("boom"));
    await expect(p).rejects.toThrow("boom");
    // Slot freed: a new job runs immediately.
    let resolve2!: (r: AlignmentResult) => void;
    const schedule2 = () => new Promise<AlignmentResult>((r) => { resolve2 = r; });
    const thread2 = createMobileDualReaderAlignThread({ schedule: schedule2 });
    const p2 = thread2.runAlignment({ primary: luma(), secondary: luma(), options: options() });
    await new Promise((r) => setTimeout(r, 0)); // flush microtasks so schedule2() runs
    resolve2(result());
    await p2;
    thread.dispose();
    thread2.dispose();
  });

  test("dispose rejects queued jobs and blocks new ones", async () => {
    const gate = gatedSchedule();
    const thread = createMobileDualReaderAlignThread({ schedule: gate.schedule });
    // Fill both slots + one queued.
    const p1 = thread.runAlignment({ primary: luma(), secondary: luma(), options: options() });
    const p2 = thread.runAlignment({ primary: luma(), secondary: luma(), options: options() });
    const p3 = thread.runAlignment({ primary: luma(), secondary: luma(), options: options() });
    await Promise.resolve();
    thread.dispose();
    // Queued job (p3) is rejected.
    await expect(p3).rejects.toThrow(/disposed/);
    // New job after dispose is rejected.
    await expect(
      thread.runAlignment({ primary: luma(), secondary: luma(), options: options() }),
    ).rejects.toThrow(/disposed/);
    // In-flight jobs still settle via the schedule (dispose doesn't cancel them).
    gate.releaseAll();
    await Promise.allSettled([p1, p2]);
  });

  test("cancelPending rejects queued and active results, then accepts fresh work", async () => {
    const gate = gatedSchedule();
    const thread = createMobileDualReaderAlignThread({
      schedule: gate.schedule,
      maxConcurrency: 1,
    });
    const active = thread.runAlignment({
      primary: luma(),
      secondary: luma(),
      options: options(),
    });
    const queued = thread.runAlignment({
      primary: luma(),
      secondary: luma(),
      options: options(),
    });
    await Promise.resolve();

    thread.cancelPending();
    await expect(queued).rejects.toThrow(/cancelled/);
    gate.releaseAll();
    await expect(active).rejects.toThrow(/cancelled/);

    const fresh = thread.runAlignment({
      primary: luma(),
      secondary: luma(),
      options: options(),
    });
    await Promise.resolve();
    gate.releaseAll();
    await expect(fresh).resolves.toMatchObject({ confidence: 0.9 });
    thread.dispose();
  });

  test("payload strips non-serializable options and keeps fineMax/fftMax/fftBackend", async () => {
    const gate = gatedSchedule();
    const thread = createMobileDualReaderAlignThread({ schedule: gate.schedule });
    const p = thread.runAlignment({
      primary: luma(),
      secondary: luma(),
      options: { ...options(), abortCheck: () => {} },
    });
    await Promise.resolve();
    gate.releaseAll();
    await p;
    expect(gate.calls[0]!.fineMax).toBe(512);
    expect(gate.calls[0]!.fftMax).toBe(256);
    expect(gate.calls[0]!.fftBackend).toBe("js");
    expect(gate.calls[0]!.timeoutMs).toBe(2000);
    // abortCheck must not be on the payload (not a field of AlignThreadJobPayload).
    expect("abortCheck" in gate.calls[0]!).toBe(false);
    thread.dispose();
  });
});
