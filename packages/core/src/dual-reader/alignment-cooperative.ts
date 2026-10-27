/**
 * Cooperative (time-sliced) driver for the step-based alignment core.
 *
 * Runs `computeAlignmentTransformSteps` on the caller's thread in short
 * slices: each slice runs until the next checkpoint after `sliceBudgetMs` has
 * elapsed, then yields to the host (default `setTimeout(0)`) so input, layout
 * and other tasks can run. Results are bit-identical to the synchronous
 * `computeAlignmentTransform` because both drive the same generator.
 */
import type { AlignmentSteps } from './image';
import {
  computeAlignmentTransformSteps,
  type AlignmentResult,
  type AlignmentTransformInput,
} from './visual-alignment';

export const ALIGNMENT_SLICE_BUDGET_MS_DEFAULT = 8;

export type CooperativeRunStats = {
  /** Number of synchronous slices executed. */
  slices: number;
  /** Longest single synchronous slice (ms). */
  maxSliceMs: number;
  /** Sum of slice durations (ms of thread time actually used). */
  busyMs: number;
  /** Wall-clock time from start to settle (ms), including yielded time. */
  totalMs: number;
};

export type CooperativeRunOptions = {
  /** Yield once a slice has run at least this long (checked at checkpoints). */
  sliceBudgetMs?: number;
  /** Abort between (and, via checkpoints, within) slices. */
  signal?: AbortSignal;
  /** Wall-clock cap; exceeding it rejects with `AlignmentTimeoutError` and drops the work. */
  timeoutMs?: number;
  /** How to hand control back to the host between slices. Default: `setTimeout(0)`. */
  yieldToHost?: () => Promise<void>;
  /** Clock (ms). Default: `performance.now()`. */
  now?: () => number;
  /** Called once with run stats when the run settles (success, abort or timeout). */
  onStats?: (stats: CooperativeRunStats) => void;
};

export class AlignmentAbortedError extends Error {
  constructor(message = 'Alignment aborted') {
    super(message);
    this.name = 'AbortError';
  }
}

export class AlignmentTimeoutError extends Error {
  constructor(message = 'Alignment timeout') {
    super(message);
    this.name = 'AlignmentTimeoutError';
  }
}

const defaultNow = () =>
  typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();

const defaultYieldToHost = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Drive any step generator cooperatively. `createSteps` receives the
 * `shouldYield` predicate the generator must consult at its checkpoints.
 */
export async function runStepsCooperatively<T>(
  createSteps: (shouldYield: () => boolean) => AlignmentSteps<T>,
  options: CooperativeRunOptions = {}
): Promise<{ value: T; stats: CooperativeRunStats }> {
  const now = options.now ?? defaultNow;
  const budget = Math.max(0, options.sliceBudgetMs ?? ALIGNMENT_SLICE_BUDGET_MS_DEFAULT);
  const yieldToHost = options.yieldToHost ?? defaultYieldToHost;
  const { signal, timeoutMs } = options;
  const startedAt = now();
  const stats: CooperativeRunStats = { slices: 0, maxSliceMs: 0, busyMs: 0, totalMs: 0 };
  let sliceStart = startedAt;
  const shouldYield = () => now() - sliceStart >= budget;
  const checkStop = () => {
    if (signal?.aborted) throw new AlignmentAbortedError();
    if (timeoutMs != null && now() - startedAt > timeoutMs) throw new AlignmentTimeoutError();
  };
  const steps = createSteps(shouldYield);
  let done = false;
  try {
    for (;;) {
      // Never run work synchronously in the caller's task: always hand back first.
      await yieldToHost();
      checkStop();
      sliceStart = now();
      let step: IteratorResult<void, T>;
      try {
        step = steps.next();
      } finally {
        const sliceMs = now() - sliceStart;
        stats.slices += 1;
        stats.busyMs += sliceMs;
        if (sliceMs > stats.maxSliceMs) stats.maxSliceMs = sliceMs;
      }
      if (step.done) {
        done = true;
        return { value: step.value, stats };
      }
    }
  } finally {
    if (!done) {
      try {
        steps.return(undefined as never);
      } catch {
        // Generator already finished/threw; nothing to release.
      }
    }
    stats.totalMs = now() - startedAt;
    options.onStats?.(stats);
  }
}

/**
 * Cooperative `computeAlignmentTransform`: same result, but never blocks the
 * thread for longer than roughly `sliceBudgetMs` plus one checkpoint interval.
 * `options.abortCheck` in the input is still honoured at every checkpoint.
 */
export function computeAlignmentTransformCooperative(
  input: AlignmentTransformInput,
  options: CooperativeRunOptions = {}
): Promise<{ result: AlignmentResult; stats: CooperativeRunStats }> {
  return runStepsCooperatively((shouldYield) => computeAlignmentTransformSteps(input, shouldYield), options).then(
    ({ value, stats }) => ({ result: value, stats })
  );
}
