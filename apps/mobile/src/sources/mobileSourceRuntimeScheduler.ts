import { withMobileSourceOperationTimeout } from "./mobileSourceOperationTimeout";

/**
 * Priority scheduling for the isolated source runtime.
 *
 * Every source operation ends on one serial native queue (iOS dispatches the
 * sandbox onto `pm.nemu.aidoku.ios-sandbox`; Android runs it on a single-thread
 * executor), and a source's own calls are further serialized per source key by
 * the session cache. Both queues used to be FIFO: a manga the user just opened
 * waited behind every cover rewrite, library update check and other-tab sweep
 * that happened to be queued first, and work for a screen the user had already
 * left still ran ahead of the screen they were looking at.
 *
 * The scheduler keeps the serial contract but chooses who goes next:
 *   - `user`       — the user is waiting on it (the opened manga's chapters,
 *                    reader page lists);
 *   - `normal`     — visible but secondary (covers, browse, search);
 *   - `background` — nobody is waiting (library update checks, other linked
 *                    sources, metadata refreshes).
 *
 * A waiting `user` operation is always the next one dispatched, and a waiter
 * whose caller gave up (abort signal) is dropped before it touches the
 * runtime. A running operation is only interrupted when it is `background`
 * work that declared itself preemptible and a `user` operation is waiting:
 * native cancels it at its next HTTP wait / replay round (see
 * `NemuAidokuSandboxCancellation`), `dispatchMobileSourceRuntimeCall`
 * re-queues it, and the user's operation runs next. So background work never
 * holds the user up for more than a moment, and it still completes later.
 *
 * Priorities travel as a mutable {@link MobileSourcePriorityTicket} so a
 * request that was queued in the background and is then joined by the user
 * (e.g. the user taps the tab the sweep was loading) is promoted in every
 * queue it is waiting in, without being re-queued.
 */

export type MobileSourceTaskPriority = "user" | "normal" | "background";

export type MobileSourcePriorityTicket = {
  priority: MobileSourceTaskPriority;
};

export type MobileSourcePriorityInput =
  | MobileSourceTaskPriority
  | MobileSourcePriorityTicket
  | undefined;

const PRIORITY_RANK: Record<MobileSourceTaskPriority, number> = {
  user: 0,
  normal: 1,
  background: 2,
};

export function mobileSourcePriorityRank(
  priority: MobileSourceTaskPriority,
): number {
  return PRIORITY_RANK[priority] ?? PRIORITY_RANK.normal;
}

export function createMobileSourcePriorityTicket(
  priority: MobileSourceTaskPriority = "normal",
): MobileSourcePriorityTicket {
  return { priority };
}

/** Normalizes a plain priority or a shared ticket into a ticket. */
export function toMobileSourcePriorityTicket(
  input: MobileSourcePriorityInput,
): MobileSourcePriorityTicket {
  if (!input) return createMobileSourcePriorityTicket();
  if (typeof input === "string") return createMobileSourcePriorityTicket(input);
  return input;
}

/** Raises (never lowers) a ticket's priority. */
export function promoteMobileSourcePriority(
  ticket: MobileSourcePriorityTicket,
  priority: MobileSourceTaskPriority,
): void {
  if (mobileSourcePriorityRank(priority) < mobileSourcePriorityRank(ticket.priority)) {
    ticket.priority = priority;
  }
}

export class MobileSourceTaskAbortedError extends Error {
  constructor() {
    super("The source request was aborted before it started.");
    this.name = "AbortError";
  }
}

export type MobileSourceSchedulerRunOptions = {
  priority?: MobileSourcePriorityInput;
  /** A caller that gave up while queued is dropped, never dispatched. */
  signal?: AbortSignal;
  /**
   * Interrupts this task once it is running, when its ticket is at
   * `background` and a `user` task is waiting. Called at most once.
   */
  preempt?: () => void;
};

type Waiter = {
  sequence: number;
  ticket: MobileSourcePriorityTicket;
  signal?: AbortSignal;
  grant: () => void;
  reject: (error: unknown) => void;
  onAbort?: () => void;
  preempt?: () => void;
};

type ActiveTask = {
  ticket: MobileSourcePriorityTicket;
  preempt?: () => void;
  preempted: boolean;
  startedAt: number;
};

/**
 * `normal` work (covers, browse) interrupts background work only once that
 * has held the runtime this long: a quick update check finishes first, a
 * source that hangs does not leave every cover blank behind it.
 */
export const MOBILE_SOURCE_NORMAL_PREEMPT_AFTER_MS = 1_500;

export type MobileSourceSchedulerSnapshot = {
  active: number;
  queued: Record<MobileSourceTaskPriority, number>;
};

export type MobileSourceRuntimeScheduler = {
  /**
   * Runs `start` once a slot is free and no higher-priority waiter is ahead.
   * The slot is held until `start`'s promise settles, or until
   * `slotReleaseMs` passes if it never does (a wedged bridge call must not
   * stall every later request forever).
   */
  run<T>(
    start: () => Promise<T>,
    options?: MobileSourceSchedulerRunOptions,
  ): Promise<T>;
  snapshot(): MobileSourceSchedulerSnapshot;
  /**
   * Re-checks preemption after a ticket changed outside the scheduler (a
   * request demoted to `background` because its screen went away).
   */
  reevaluate(): void;
};

export type MobileSourceRuntimeSchedulerConfig = {
  concurrency?: number;
  /** Upper bound on how long one dispatched task may hold its slot. */
  slotReleaseMs?: number;
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  now?: () => number;
  normalPreemptAfterMs?: number;
};

export function createMobileSourceRuntimeScheduler(
  config: MobileSourceRuntimeSchedulerConfig = {},
): MobileSourceRuntimeScheduler {
  const concurrency = Math.max(1, config.concurrency ?? 1);
  const slotReleaseMs = config.slotReleaseMs ?? Number.POSITIVE_INFINITY;
  const setTimer =
    config.setTimer ?? ((callback: () => void, ms: number) => setTimeout(callback, ms));
  const clearTimer =
    config.clearTimer ??
    ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  const now = config.now ?? (() => Date.now());
  const normalPreemptAfterMs =
    config.normalPreemptAfterMs ?? MOBILE_SOURCE_NORMAL_PREEMPT_AFTER_MS;
  const waiters: Waiter[] = [];
  const activeTasks = new Set<ActiveTask>();
  let active = 0;
  let nextSequence = 0;
  let recheckTimer: unknown = null;

  function preemptForWaitingUser(): void {
    if (active < concurrency) return;
    let userWaiting = false;
    let normalWaiting = false;
    for (const waiter of waiters) {
      if (waiter.ticket.priority === "user") userWaiting = true;
      else if (waiter.ticket.priority === "normal") normalWaiting = true;
    }
    if (!userWaiting && !normalWaiting) return;
    let recheckInMs = Number.POSITIVE_INFINITY;
    for (const task of activeTasks) {
      if (task.preempted || !task.preempt) continue;
      if (task.ticket.priority !== "background") continue;
      if (!userWaiting) {
        const heldMs = now() - task.startedAt;
        if (heldMs < normalPreemptAfterMs) {
          recheckInMs = Math.min(recheckInMs, normalPreemptAfterMs - heldMs);
          continue;
        }
      }
      task.preempted = true;
      try {
        task.preempt();
      } catch {
        // Preemption is best-effort; the task simply runs to completion.
      }
    }
    if (Number.isFinite(recheckInMs) && recheckTimer === null) {
      recheckTimer = setTimer(() => {
        recheckTimer = null;
        preemptForWaitingUser();
      }, Math.max(1, recheckInMs));
    }
  }

  function takeNext(): Waiter | undefined {
    let bestIndex = -1;
    for (let index = 0; index < waiters.length; index += 1) {
      const candidate = waiters[index]!;
      if (bestIndex < 0) {
        bestIndex = index;
        continue;
      }
      const best = waiters[bestIndex]!;
      const rankDifference =
        mobileSourcePriorityRank(candidate.ticket.priority) -
        mobileSourcePriorityRank(best.ticket.priority);
      if (
        rankDifference < 0 ||
        (rankDifference === 0 && candidate.sequence < best.sequence)
      ) {
        bestIndex = index;
      }
    }
    if (bestIndex < 0) return undefined;
    const [next] = waiters.splice(bestIndex, 1);
    return next;
  }

  function pump(): void {
    while (active < concurrency) {
      const next = takeNext();
      if (!next) return;
      if (next.onAbort) next.signal?.removeEventListener("abort", next.onAbort);
      if (next.signal?.aborted) {
        next.reject(new MobileSourceTaskAbortedError());
        continue;
      }
      active += 1;
      next.grant();
    }
  }

  function run<T>(
    start: () => Promise<T>,
    options: MobileSourceSchedulerRunOptions = {},
  ): Promise<T> {
    const signal = options.signal;
    if (signal?.aborted) {
      return Promise.reject(new MobileSourceTaskAbortedError());
    }
    const ticket = toMobileSourcePriorityTicket(options.priority);

    return new Promise<T>((resolve, reject) => {
      const waiter: Waiter = {
        sequence: nextSequence++,
        ticket,
        signal,
        reject,
        preempt: options.preempt,
        grant: () => {
          let released = false;
          let timer: unknown = null;
          const activeTask: ActiveTask = {
            ticket,
            preempt: options.preempt,
            preempted: false,
            startedAt: now(),
          };
          activeTasks.add(activeTask);
          const release = () => {
            if (released) return;
            released = true;
            if (timer !== null) clearTimer(timer);
            activeTasks.delete(activeTask);
            active -= 1;
            pump();
          };
          if (Number.isFinite(slotReleaseMs)) {
            timer = setTimer(release, slotReleaseMs);
          }
          let task: Promise<T>;
          try {
            task = Promise.resolve(start());
          } catch (error) {
            release();
            reject(error);
            return;
          }
          task.then(
            (value) => {
              release();
              resolve(value);
            },
            (error) => {
              release();
              reject(error);
            },
          );
        },
      };
      if (signal) {
        waiter.onAbort = () => {
          const index = waiters.indexOf(waiter);
          if (index < 0) return;
          waiters.splice(index, 1);
          reject(new MobileSourceTaskAbortedError());
        };
        signal.addEventListener("abort", waiter.onAbort, { once: true });
      }
      waiters.push(waiter);
      pump();
      preemptForWaitingUser();
    });
  }

  function snapshot(): MobileSourceSchedulerSnapshot {
    const queued: Record<MobileSourceTaskPriority, number> = {
      user: 0,
      normal: 0,
      background: 0,
    };
    for (const waiter of waiters) queued[waiter.ticket.priority] += 1;
    return { active, queued };
  }

  return { run, snapshot, reevaluate: preemptForWaitingUser };
}

/**
 * Process-wide gate in front of the native sandbox queue. Concurrency 1 on
 * purpose: native executes one operation at a time anyway, so keeping the
 * backlog here (instead of on the native queue) is what lets a `user`
 * operation go next. A dispatched call is bounded natively (operation
 * deadline + watchdog, ~22 s on iOS, 25 s on Android; session creation 35 s);
 * the slot is force-released a little after that so a lost bridge callback
 * cannot wedge every source.
 */
export const MOBILE_SOURCE_RUNTIME_SLOT_RELEASE_MS = 45_000;

export const mobileSourceRuntimeScheduler = createMobileSourceRuntimeScheduler({
  concurrency: 1,
  slotReleaseMs: MOBILE_SOURCE_RUNTIME_SLOT_RELEASE_MS,
});

const PREEMPTED_MARKER = "[nemu-preempted]";

/** Native stopped the operation for a user request (see the scheduler). */
export function isMobileSourcePreemptedError(error: unknown): boolean {
  return (
    error instanceof Error && error.message.includes(PREEMPTED_MARKER)
  );
}

/** A preempted call is re-queued at most this many times. */
export const MOBILE_SOURCE_MAX_PREEMPTIONS = 8;

let nextCancelToken = 0;

function makeCancelToken(now: number): string {
  nextCancelToken = (nextCancelToken + 1) % Number.MAX_SAFE_INTEGER;
  return `op-${now.toString(36)}-${nextCancelToken.toString(36)}`;
}

/**
 * One call onto the native sandbox queue, dispatched through `scheduler` so
 * the highest-priority waiter goes next. The operation timeout starts when
 * the call is dispatched, not while it waits its turn: queueing is the
 * scheduler's business (a `user` call only ever waits for the operation
 * already running), and counting it turned queue time behind background work
 * into user-visible timeouts. The scheduler slot is held until the native
 * call actually settles, because a timed-out call still occupies the native
 * queue.
 *
 * With `cancel`, the call is preemptible: it gets a fresh cancel token per
 * attempt (passed to `call` for the operation JSON), and when native reports
 * it preempted for a user request it is re-queued transparently at its
 * ticket's priority. The caller only sees a later result.
 */
export function dispatchMobileSourceRuntimeCall<T>(
  call: (cancelToken: string | undefined) => Promise<T>,
  {
    priority,
    timeoutMs,
    signal,
    onDispatch,
    cancel,
    scheduler = mobileSourceRuntimeScheduler,
    now = () => Date.now(),
  }: {
    priority?: MobileSourcePriorityInput;
    timeoutMs: number;
    signal?: AbortSignal;
    /** Called when the call leaves the queue (with the time it waited). */
    onDispatch?: (waitMs: number, attempt: number) => void;
    /** Native cancellation by token; makes the call preemptible. */
    cancel?: (cancelToken: string) => void;
    scheduler?: MobileSourceRuntimeScheduler;
    now?: () => number;
  },
): Promise<T> {
  const ticket = toMobileSourcePriorityTicket(priority);
  const attempt = (attemptIndex: number): Promise<T> => {
    const queuedAt = now();
    const cancelToken = cancel ? makeCancelToken(queuedAt) : undefined;
    return new Promise<T>((resolve, reject) => {
      scheduler
        .run(
          async () => {
            onDispatch?.(Math.max(0, now() - queuedAt), attemptIndex);
            const native = call(cancelToken);
            withMobileSourceOperationTimeout(native, { timeoutMs }).then(
              resolve,
              reject,
            );
            await native.catch(() => undefined);
          },
          {
            priority: ticket,
            signal,
            preempt:
              cancel && cancelToken ? () => cancel(cancelToken) : undefined,
          },
        )
        .catch(reject);
    });
  };
  const run = async (): Promise<T> => {
    for (let attemptIndex = 0; ; attemptIndex += 1) {
      try {
        return await attempt(attemptIndex);
      } catch (error) {
        if (
          !isMobileSourcePreemptedError(error) ||
          attemptIndex >= MOBILE_SOURCE_MAX_PREEMPTIONS
        ) {
          throw error;
        }
      }
    }
  };
  return run();
}
