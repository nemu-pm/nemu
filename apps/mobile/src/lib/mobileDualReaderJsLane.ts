/**
 * Shared cooperative lane for dual-reader JS-thread CPU work.
 *
 * Hashing (`toLuma` → `downsampleToMax` → `computeMultiDhash`), split/merge
 * luma building and the JS-thread alignment fallback all run as core step
 * generators driven by `runStepsCooperatively` in ~6 ms slices. Each slice
 * waits for its turn here: the lane hands out at most ONE turn per
 * `setTimeout(0)` macrotask, so several concurrent jobs (e.g. a hash and an
 * alignment) can never run back-to-back slices inside one batched timer flush.
 * Jobs interleave round-robin instead of serializing whole jobs.
 */
import {
  runStepsCooperatively,
  type AlignmentPace,
  type AlignmentSteps,
  type CooperativeRunOptions,
  type CooperativeRunStats,
} from "@nemu/core/dual-reader";
import { MobileDualReaderDecodeCancelledError } from "./mobileDualReaderDecodeScheduler";
import { measureMobilePerformance } from "./mobilePerformance";

/**
 * Per-slice budget (ms of synchronous work before yielding). Below the core
 * default (8 ms) to leave headroom for GC/JIT pauses landing inside a slice.
 */
export const DUAL_READER_JS_SLICE_BUDGET_MS = 6;

export const DUAL_READER_ALIGN_MAX_SLICE_LABEL = "dualReader.align.maxSliceMs";
export const DUAL_READER_HASH_MAX_SLICE_LABEL = "dualReader.hash.maxSliceMs";

export type DualReaderSliceOutcome = "ok" | "aborted" | "timeout" | "error";

const laneWaiters: Array<() => void> = [];
let lanePumping = false;

function pumpLane(): void {
  setTimeout(() => {
    const next = laneWaiters.shift();
    if (laneWaiters.length > 0) {
      pumpLane();
    } else {
      lanePumping = false;
    }
    next?.();
  }, 0);
}

/** Wait for this job's next turn on the shared JS lane (one turn per macrotask). */
export function yieldToDualReaderJsLane(): Promise<void> {
  return new Promise<void>((resolve) => {
    laneWaiters.push(resolve);
    if (!lanePumping) {
      lanePumping = true;
      pumpLane();
    }
  });
}

function nowMs(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

/** Record the longest synchronous slice of a cooperative run (entry duration == maxSliceMs). */
export function recordDualReaderSliceStats(
  label: string,
  stats: CooperativeRunStats,
  outcome: DualReaderSliceOutcome,
  extra?: Record<string, unknown>,
): void {
  if (stats.slices === 0) return;
  measureMobilePerformance(label, nowMs() - stats.maxSliceMs, {
    maxSliceMs: Math.round(stats.maxSliceMs * 100) / 100,
    slices: stats.slices,
    busyMs: Math.round(stats.busyMs),
    totalMs: Math.round(stats.totalMs),
    outcome,
    ...(extra ?? {}),
  });
}

export function classifySliceError(err: unknown): DualReaderSliceOutcome {
  const name = err instanceof Error ? err.name : "";
  return name === "AbortError" ? "aborted" : name === "AlignmentTimeoutError" ? "timeout" : "error";
}

export type DualReaderCooperativeOptions = Pick<
  CooperativeRunOptions,
  "signal" | "timeoutMs" | "sliceBudgetMs" | "yieldToHost"
>;

/**
 * Run a core step generator on the shared lane and record its longest slice
 * under `label`. Aborts surface as `MobileDualReaderDecodeCancelledError` so
 * callers' existing cancellation handling stays silent.
 */
export async function runDualReaderStepsOnJsLane<T>(
  label: string,
  createSteps: (pace: AlignmentPace) => AlignmentSteps<T>,
  options?: DualReaderCooperativeOptions & { metadata?: Record<string, unknown> },
): Promise<T> {
  if (options?.signal?.aborted) throw new MobileDualReaderDecodeCancelledError();
  const statsRef: { current: CooperativeRunStats | null } = { current: null };
  let outcome: DualReaderSliceOutcome = "ok";
  try {
    const { value } = await runStepsCooperatively(createSteps, {
      sliceBudgetMs: options?.sliceBudgetMs ?? DUAL_READER_JS_SLICE_BUDGET_MS,
      signal: options?.signal,
      timeoutMs: options?.timeoutMs,
      yieldToHost: options?.yieldToHost ?? yieldToDualReaderJsLane,
      onStats: (s) => {
        statsRef.current = s;
      },
    });
    return value;
  } catch (err) {
    outcome = classifySliceError(err);
    if (outcome === "aborted") throw new MobileDualReaderDecodeCancelledError();
    throw err;
  } finally {
    if (statsRef.current) {
      recordDualReaderSliceStats(label, statsRef.current, outcome, options?.metadata);
    }
  }
}
