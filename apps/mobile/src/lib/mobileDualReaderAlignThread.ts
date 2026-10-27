/**
 * Mobile dual-reader alignment off-thread bridge.
 *
 * Web offloads dHash + FFT alignment to a Web Worker (`dhash.worker.ts`). React
 * Native has no Web Workers, and the user will not accept JS-thread jank, so
 * alignment runs on a dedicated background JS runtime via `react-native-worklets`
 * (already installed, 0.8.3). With Bundle Mode enabled, the worker runtime loads
 * the full JS bundle, so the pure `@nemu/core` alignment core
 * (`computeAlignmentTransform` + `fft.js` JS backend) runs on the background
 * thread **as-is — no math duplication**.
 *
 * The bridge exposes a `RunAlignmentFn` (the same type `mobileDualReaderRuntime`'s
 * `requestAlignmentFromSamples` expects), so the runtime is agnostic to whether
 * alignment runs on-thread (tests) or off-thread (device).
 *
 * Cross-runtime payload rules:
 * - `LumaImage` (`Uint8Array` luma) is transferable across worklet runtimes.
 * - `AlignmentOptions` may contain `abortCheck`/`wasmProvider` (functions / wasm
 *   module) which are NOT serializable across runtimes. The bridge therefore
 *   extracts only plain-data fields (`fineMax`, `fftMax`, `fftBackend`) plus a
 *   `timeoutMs`, and the worklet builds its own deadline-based `abortCheck` and
 *   `buildAlignmentOptions` on the background thread.
 *
 * Bundle Mode is now opt-in (NEMU_WORKLETS_BUNDLE_MODE=1, see
 * apps/mobile/workletsBundleMode.cjs) because it lengthened cold launch; by
 * default `createRealSchedule` takes the JS-thread fallback.
 *
 * JS-thread fallback (`runAlignmentOnJsThread`): the core runs as a generator
 * (`computeAlignmentTransformCooperative`) in slices of ~6 ms, yielding to the
 * host with `setTimeout(0)` between slices so the UI stays responsive. Only one
 * fallback alignment runs at a time (so two jobs' slices cannot be batched into
 * one timer flush), each job has an AbortSignal that `cancelPending`/`dispose`
 * abort, and a wall-clock cap drops the result instead of blocking. The longest
 * slice of each job is recorded as `dualReader.align.maxSliceMs`.
 *
 * DEVICE-GATED: the real `react-native-worklets` runtime requires the New
 * Architecture + Bundle Mode + a native build, so it is verified on-device
 * (T7.4). The queue/concurrency/dispose logic is unit-tested here via an
 * injectable scheduler (`createMobileDualReaderAlignThread({ schedule })`).
 */
import {
  buildAlignmentOptions,
  computeAlignmentTransformCooperative,
} from "@nemu/core/dual-reader";
import type {
  AlignmentOptions,
  AlignmentResult,
  CooperativeRunStats,
  LumaImage,
} from "@nemu/core/dual-reader";
import {
  DUAL_READER_ALIGN_MAX_SLICE_LABEL,
  DUAL_READER_JS_SLICE_BUDGET_MS,
  classifySliceError,
  recordDualReaderSliceStats,
  type DualReaderSliceOutcome,
  yieldToDualReaderJsLane,
} from "./mobileDualReaderJsLane";
import type { RunAlignmentFn } from "./mobileDualReaderRuntime";
import { ALIGNMENT_MAX_CONCURRENCY } from "./mobileDualReaderRuntime";
import { createRetryablePromiseCache } from "./retryablePromiseCache";

/**
 * Overall wall-clock cap per alignment. Was 2 s (web parity), but sliced
 * JS-thread alignment takes longer in wall time than one blocking run, and a
 * normal successful alignment alone costs ~2 s of CPU on slow devices, so 2 s
 * dropped legitimate work. On timeout the result is dropped (never blocks).
 */
export const DEFAULT_ALIGN_TIMEOUT_MS = 10_000;

/**
 * Per-slice budget for the JS-thread fallback (ms of synchronous work before
 * yielding). Below the core default (8 ms) to leave headroom for GC/JIT pauses
 * that land inside a slice: measured max slice in bun is ~10 ms at 6 ms
 * (vs ~14 ms cold at 8 ms); deterministic checkpoint gaps are <0.4 ms.
 */
export const JS_THREAD_ALIGN_SLICE_BUDGET_MS = DUAL_READER_JS_SLICE_BUDGET_MS;

export { DUAL_READER_ALIGN_MAX_SLICE_LABEL };

export type AlignThreadJobPayload = {
  primary: LumaImage;
  secondary: LumaImage;
  fineMax?: number;
  fftMax?: number;
  fftBackend?: "js" | "wasm" | "auto";
  timeoutMs?: number;
};

export type AlignThreadScheduleContext = {
  /** Aborted by `cancelPending()` / `dispose()`. Honoured by the JS-thread fallback between slices. */
  signal: AbortSignal;
};

export type AlignThreadScheduleFn = (
  payload: AlignThreadJobPayload,
  context: AlignThreadScheduleContext,
) => Promise<AlignmentResult>;

export type AlignThreadHandle = {
  /** RunAlignmentFn usable by `requestAlignmentFromSamples`. */
  runAlignment: RunAlignmentFn;
  /** Reject queued work and invalidate in-flight results without destroying the runtime. */
  cancelPending: () => void;
  /** Release the background runtime / reject queued jobs. Idempotent. */
  dispose: () => void;
};

type PendingJob = {
  generation: number;
  controller: AbortController;
  payload: AlignThreadJobPayload;
  resolve: (result: AlignmentResult) => void;
  reject: (err: unknown) => void;
};

/**
 * The worklet body executed on the background runtime. Under Bundle Mode it can
 * `require` the pure core. Defined as a module-scope function so the worklets
 * Babel plugin can serialize it. The deadline-based `abortCheck` is built inside
 * so no function crosses the runtime boundary.
 *
 * NOTE: requires Bundle Mode (`react-native-worklets` bundle mode enabled) for
 * the `require("@nemu/core/dual-reader")` to resolve in the worker runtime.
 */
function dualReaderAlignWorklet(
  payload: AlignThreadJobPayload,
): AlignmentResult {
  "worklet";
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const core = require("@nemu/core/dual-reader") as {
    computeAlignmentTransform: (input: {
      primary: LumaImage;
      secondary: LumaImage;
      options: AlignmentOptions;
    }) => AlignmentResult;
    buildAlignmentOptions: (
      overrides?: Partial<AlignmentOptions>,
    ) => AlignmentOptions;
  };
  const startedAt = (globalThis as { performance?: { now: () => number } })
    .performance
    ? (globalThis as { performance: { now: () => number } }).performance.now()
    : Date.now();
  const deadline =
    typeof payload.timeoutMs === "number"
      ? startedAt + payload.timeoutMs
      : null;
  const now = () =>
    (globalThis as { performance?: { now: () => number } }).performance
      ? (globalThis as { performance: { now: () => number } }).performance.now()
      : Date.now();
  const abortCheck = () => {
    if (deadline != null && now() > deadline) {
      throw new Error("Alignment timeout");
    }
  };
  return core.computeAlignmentTransform({
    primary: payload.primary,
    secondary: payload.secondary,
    options: core.buildAlignmentOptions({
      fineMax: payload.fineMax,
      fftMax: payload.fftMax,
      fftBackend: payload.fftBackend ?? "js",
      abortCheck,
    }),
  });
}

/** Serializes JS-thread alignments: one cooperative run at a time. */
let jsThreadAlignTail: Promise<unknown> = Promise.resolve();

/**
 * JS-thread fallback: run the shared core cooperatively in ~6 ms slices so
 * the JS thread is never blocked for long. Honors `signal` between slices and
 * drops the work after `payload.timeoutMs` of wall-clock time.
 */
export function runAlignmentOnJsThread(
  payload: AlignThreadJobPayload,
  context: AlignThreadScheduleContext,
  options?: { sliceBudgetMs?: number; yieldToHost?: () => Promise<void> },
): Promise<AlignmentResult> {
  const run = async (): Promise<AlignmentResult> => {
    let outcome: DualReaderSliceOutcome = "ok";
    const statsRef: { current: CooperativeRunStats | null } = { current: null };
    try {
      const { result } = await computeAlignmentTransformCooperative(
        {
          primary: payload.primary,
          secondary: payload.secondary,
          options: buildAlignmentOptions({
            fineMax: payload.fineMax,
            fftMax: payload.fftMax,
            fftBackend: payload.fftBackend ?? "js",
          }),
        },
        {
          sliceBudgetMs: options?.sliceBudgetMs ?? JS_THREAD_ALIGN_SLICE_BUDGET_MS,
          signal: context.signal,
          timeoutMs: payload.timeoutMs,
          yieldToHost: options?.yieldToHost ?? yieldToDualReaderJsLane,
          onStats: (s) => {
            statsRef.current = s;
          },
        },
      );
      return result;
    } catch (err) {
      outcome = classifySliceError(err);
      if (outcome === "aborted") {
        throw new Error("Dual-reader alignment cancelled");
      }
      throw err;
    } finally {
      if (statsRef.current) {
        recordDualReaderSliceStats(DUAL_READER_ALIGN_MAX_SLICE_LABEL, statsRef.current, outcome, {
          phase: "align",
        });
      }
    }
  };
  const job = jsThreadAlignTail.then(() => {
    if (context.signal.aborted) {
      return Promise.reject(new Error("Dual-reader alignment cancelled"));
    }
    return run();
  });
  jsThreadAlignTail = job.catch(() => undefined);
  return job;
}

/**
 * Lazily create the real worklet runtime and a schedule function backed by
 * `runOnRuntimeAsync`. Lazy + dynamic import so unit tests (no native runtime)
 * never load `react-native-worklets`.
 */
async function createRealSchedule(): Promise<AlignThreadScheduleFn> {
  const bundleModeEnabled = Boolean(
    (globalThis as { _WORKLETS_BUNDLE_MODE_ENABLED?: boolean })
      ._WORKLETS_BUNDLE_MODE_ENABLED,
  );
  if (!bundleModeEnabled) {
    // Bundle Mode is off by default (apps/mobile/workletsBundleMode.cjs): it
    // made a second runtime evaluate the whole bundle during launch and the
    // JS thread waited on it, lengthening the native launch screen. Without
    // it the worklet runtime cannot `require` the shared core, so alignment
    // runs on the JS thread, time-sliced (see `runAlignmentOnJsThread`).
    // Builds that opt back in with NEMU_WORKLETS_BUNDLE_MODE=1 use the
    // dedicated runtime below.
    return (payload, context) => runAlignmentOnJsThread(payload, context);
  }
  const worklets = (await import("react-native-worklets")) as {
    createWorkletRuntime: (config: { name: string }) => unknown;
    runOnRuntimeAsync: (
      runtime: unknown,
      worklet: (payload: AlignThreadJobPayload) => AlignmentResult,
      payload: AlignThreadJobPayload,
    ) => Promise<AlignmentResult>;
  };
  const runtime = worklets.createWorkletRuntime({ name: "dual-reader-align" });
  // Off-thread: the signal cannot cross runtimes; the worklet's deadline-based
  // abortCheck bounds the work and stale results are discarded by generation.
  return (payload) =>
    worklets.runOnRuntimeAsync(runtime, dualReaderAlignWorklet, payload);
}

/**
 * The real worklet runtime is a process-wide singleton. Under Bundle Mode each
 * `createWorkletRuntime` call loads the entire JS bundle into a fresh runtime,
 * `react-native-worklets` exposes no destroy API, and the iOS/JSC
 * `FinalizationRegistry` shim is a no-op — so a per-handle runtime would leak
 * one full runtime per reader mount. Handles share this one; `dispose()` only
 * rejects that handle's queued jobs.
 */
const getSharedRealSchedule = createRetryablePromiseCache(createRealSchedule);

/**
 * Create an align-thread handle. `schedule` is injectable: tests pass a fake;
 * on device it defaults to the shared worklet-runtime-backed schedule (created
 * lazily on first job).
 */
export function createMobileDualReaderAlignThread(options?: {
  schedule?: AlignThreadScheduleFn;
  maxConcurrency?: number;
  timeoutMs?: number;
}): AlignThreadHandle {
  const maxConcurrency = options?.maxConcurrency ?? ALIGNMENT_MAX_CONCURRENCY;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_ALIGN_TIMEOUT_MS;
  let disposed = false;
  let generation = 0;
  const injectedSchedule = options?.schedule ?? null;

  let running = 0;
  const queue: PendingJob[] = [];
  const active = new Set<PendingJob>();

  function getSchedule(): Promise<AlignThreadScheduleFn> {
    if (injectedSchedule) return Promise.resolve(injectedSchedule);
    return getSharedRealSchedule();
  }

  function pump(): void {
    if (disposed) return;
    while (running < maxConcurrency && queue.length > 0) {
      const job = queue.shift()!;
      running += 1;
      active.add(job);
      void getSchedule()
        .then((schedule) =>
          schedule(job.payload, { signal: job.controller.signal }),
        )
        .then(
          (result) => {
            running -= 1;
            active.delete(job);
            if (disposed || job.generation !== generation) {
              job.reject(new Error("Dual-reader alignment cancelled"));
            } else {
              job.resolve(result);
            }
            pump();
          },
          (err) => {
            running -= 1;
            active.delete(job);
            job.reject(err);
            pump();
          },
        );
    }
  }

  const runAlignment: RunAlignmentFn = ({ primary, secondary, options }) => {
    if (disposed) {
      return Promise.reject(new Error("Dual-reader align thread disposed"));
    }
    // Strip non-serializable fields (abortCheck/wasmProvider) — the worklet
    // rebuilds abort handling from timeoutMs.
    const payload: AlignThreadJobPayload = {
      primary,
      secondary,
      fineMax: options.fineMax,
      fftMax: options.fftMax,
      fftBackend:
        (options.fftBackend as AlignThreadJobPayload["fftBackend"]) ?? "js",
      timeoutMs,
    };
    return new Promise<AlignmentResult>((resolve, reject) => {
      queue.push({
        generation,
        controller: new AbortController(),
        payload,
        resolve,
        reject,
      });
      pump();
    });
  };

  function abortActive(): void {
    for (const job of active) job.controller.abort();
  }

  function cancelPending(): void {
    generation += 1;
    abortActive();
    while (queue.length > 0) {
      const job = queue.shift()!;
      job.reject(new Error("Dual-reader alignment cancelled"));
    }
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    generation += 1;
    abortActive();
    while (queue.length > 0) {
      const job = queue.shift()!;
      job.reject(new Error("Dual-reader align thread disposed"));
    }
  }

  return { runAlignment, cancelPending, dispose };
}
