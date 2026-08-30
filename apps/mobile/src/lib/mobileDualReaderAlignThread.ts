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
 * DEVICE-GATED: the real `react-native-worklets` runtime requires the New
 * Architecture + Bundle Mode + a native build, so it is verified on-device
 * (T7.4). The queue/concurrency/dispose logic is unit-tested here via an
 * injectable scheduler (`createMobileDualReaderAlignThread({ schedule })`).
 */
import type {
  AlignmentOptions,
  AlignmentResult,
  LumaImage,
} from "@nemu/core/dual-reader";
import type { RunAlignmentFn } from "./mobileDualReaderRuntime";
import { ALIGNMENT_MAX_CONCURRENCY } from "./mobileDualReaderRuntime";
import { createRetryablePromiseCache } from "./retryablePromiseCache";

/** Default per-alignment timeout, matching web's `computeDualReadAlignmentInWorker` timeoutMs. */
const DEFAULT_ALIGN_TIMEOUT_MS = 2000;

export type AlignThreadJobPayload = {
  primary: LumaImage;
  secondary: LumaImage;
  fineMax?: number;
  fftMax?: number;
  fftBackend?: "js" | "wasm" | "auto";
  timeoutMs?: number;
};

export type AlignThreadScheduleFn = (
  payload: AlignThreadJobPayload,
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
    // Metro development deliberately disables Bundle Mode to prevent HMR from
    // retaining full-bundle worklet runtime generations. Keep alignment
    // functional for developers, accepting JS-thread execution in debug only;
    // production continues to use the dedicated runtime below.
    return (payload) =>
      Promise.resolve().then(() => dualReaderAlignWorklet(payload));
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

  function getSchedule(): Promise<AlignThreadScheduleFn> {
    if (injectedSchedule) return Promise.resolve(injectedSchedule);
    return getSharedRealSchedule();
  }

  function pump(): void {
    if (disposed) return;
    while (running < maxConcurrency && queue.length > 0) {
      const job = queue.shift()!;
      running += 1;
      void getSchedule()
        .then((schedule) => schedule(job.payload))
        .then(
          (result) => {
            running -= 1;
            if (disposed || job.generation !== generation) {
              job.reject(new Error("Dual-reader alignment cancelled"));
            } else {
              job.resolve(result);
            }
            pump();
          },
          (err) => {
            running -= 1;
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
      queue.push({ generation, payload, resolve, reject });
      pump();
    });
  };

  function cancelPending(): void {
    generation += 1;
    while (queue.length > 0) {
      const job = queue.shift()!;
      job.reject(new Error("Dual-reader alignment cancelled"));
    }
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    generation += 1;
    while (queue.length > 0) {
      const job = queue.shift()!;
      job.reject(new Error("Dual-reader align thread disposed"));
    }
  }

  return { runAlignment, cancelPending, dispose };
}
