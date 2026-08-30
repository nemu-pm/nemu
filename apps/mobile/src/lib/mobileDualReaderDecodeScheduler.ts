/**
 * Process-wide throttle for memory-heavy dual-reader image work.
 *
 * Encoded image fetches, Skia decodes, RGBA reads, and composite surfaces can
 * each retain tens of MiB. A count-only cache does not protect the transient
 * peak when several pages start together, so every full image pipeline shares
 * this single-slot scheduler.
 *
 * Cancellation cannot preempt a synchronous Skia call that is already running,
 * but it does reject queued work and invalidates the active result. Callers keep
 * ownership of any native result until the scheduled promise settles, allowing
 * them to dispose stale images instead of committing them after a page/session
 * or AppState change.
 */

export const MOBILE_DUAL_READER_DECODE_MAX_CONCURRENCY = 1;
export type MobileDualReaderDecodePriority = "user-visible" | "background";

export class MobileDualReaderDecodeCancelledError extends Error {
  constructor(message = "Dual-reader decode cancelled") {
    super(message);
    this.name = "MobileDualReaderDecodeCancelledError";
  }
}

export function isMobileDualReaderDecodeCancelledError(
  error: unknown,
): error is MobileDualReaderDecodeCancelledError {
  return error instanceof MobileDualReaderDecodeCancelledError;
}

type DecodeJob<T> = {
  generation: number;
  priority: number;
  sequence: number;
  signal?: Pick<AbortSignal, "aborted">;
  task: () => Promise<T> | T;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
};

export type MobileDualReaderDecodeScheduler = {
  schedule<T>(
    task: () => Promise<T> | T,
    options?: {
      signal?: Pick<AbortSignal, "aborted">;
      priority?: MobileDualReaderDecodePriority;
    },
  ): Promise<T>;
  /** Reject queued work and invalidate results from work already running. */
  cancelPending(): void;
  /** Only the exact React Native `active` state may start image work. */
  setAppState(state: string): void;
  getStats(): { active: number; queued: number; foreground: boolean };
};

export function createMobileDualReaderDecodeScheduler(options?: {
  maxConcurrency?: number;
}): MobileDualReaderDecodeScheduler {
  const requestedConcurrency =
    options?.maxConcurrency ?? MOBILE_DUAL_READER_DECODE_MAX_CONCURRENCY;
  const maxConcurrency = Math.max(1, Math.floor(requestedConcurrency));
  const queue: DecodeJob<unknown>[] = [];
  let active = 0;
  let generation = 0;
  let sequence = 0;
  let foreground = true;

  const cancelled = () => new MobileDualReaderDecodeCancelledError();

  function isCancelled(job: DecodeJob<unknown>): boolean {
    return (
      !foreground ||
      job.generation !== generation ||
      job.signal?.aborted === true
    );
  }

  function pump(): void {
    if (!foreground) return;
    while (active < maxConcurrency && queue.length > 0) {
      const job = queue.shift()!;
      if (isCancelled(job)) {
        job.reject(cancelled());
        continue;
      }

      active += 1;
      void Promise.resolve()
        .then(job.task)
        .then(
          (value) => {
            if (isCancelled(job)) {
              job.reject(cancelled());
              return;
            }
            job.resolve(value);
          },
          (error) => {
            if (isCancelled(job)) {
              job.reject(cancelled());
            } else {
              job.reject(error);
            }
          },
        )
        .finally(() => {
          active -= 1;
          pump();
        });
    }
  }

  function cancelPending(): void {
    generation += 1;
    while (queue.length > 0) {
      queue.shift()!.reject(cancelled());
    }
  }

  return {
    schedule<T>(
      task: () => Promise<T> | T,
      options: {
        signal?: Pick<AbortSignal, "aborted">;
        priority?: MobileDualReaderDecodePriority;
      } = {},
    ): Promise<T> {
      if (!foreground || options.signal?.aborted === true) {
        return Promise.reject(cancelled());
      }
      return new Promise<T>((resolve, reject) => {
        queue.push({
          generation,
          priority: options.priority === "background" ? 0 : 1,
          sequence: sequence++,
          signal: options.signal,
          task,
          resolve: resolve as (value: unknown) => void,
          reject,
        });
        queue.sort(
          (left, right) =>
            right.priority - left.priority || left.sequence - right.sequence,
        );
        pump();
      });
    },
    cancelPending,
    setAppState(state) {
      const nextForeground = state === "active";
      if (nextForeground === foreground) return;
      foreground = nextForeground;
      if (!foreground) {
        cancelPending();
        return;
      }
      pump();
    },
    getStats() {
      return { active, queued: queue.length, foreground };
    },
  };
}

/** Shared by AutoAligner hashing and overlay/composite realization. */
export const mobileDualReaderDecodeScheduler =
  createMobileDualReaderDecodeScheduler();
