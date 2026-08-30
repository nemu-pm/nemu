export type MobileIdleTaskHandle = {
  cancel: () => void;
};

export type MobileIdleTaskEnvironment = {
  requestIdleCallback?: (
    callback: () => void,
    options?: { timeout?: number },
  ) => unknown;
  cancelIdleCallback?: (handle: unknown) => void;
  requestAnimationFrame?: (callback: () => void) => unknown;
  cancelAnimationFrame?: (handle: unknown) => void;
  setTimeout: (callback: () => void, delay: number) => unknown;
  clearTimeout: (handle: unknown) => void;
};

export type MobileIdleTaskOptions = {
  timeout?: number;
  environment?: MobileIdleTaskEnvironment;
};

export type MobileIdleTaskCoordinator = {
  schedule: (task: () => void) => void;
  cancel: () => void;
};

function getMobileIdleTaskEnvironment(): MobileIdleTaskEnvironment {
  const idleGlobals = globalThis as typeof globalThis & {
    requestIdleCallback?: MobileIdleTaskEnvironment["requestIdleCallback"];
    cancelIdleCallback?: MobileIdleTaskEnvironment["cancelIdleCallback"];
  };
  return {
    requestIdleCallback:
      typeof idleGlobals.requestIdleCallback === "function"
        ? (callback, options) =>
            idleGlobals.requestIdleCallback!(callback, options)
        : undefined,
    cancelIdleCallback:
      typeof idleGlobals.cancelIdleCallback === "function"
        ? (handle) => idleGlobals.cancelIdleCallback!(handle)
        : undefined,
    requestAnimationFrame:
      typeof requestAnimationFrame === "function"
        ? (callback) => requestAnimationFrame(callback)
        : undefined,
    cancelAnimationFrame:
      typeof cancelAnimationFrame === "function"
        ? (handle) => cancelAnimationFrame(handle as number)
        : undefined,
    setTimeout: (callback, delay) => setTimeout(callback, delay),
    clearTimeout: (handle) =>
      clearTimeout(handle as ReturnType<typeof setTimeout>),
  };
}

/**
 * Schedules low-priority UI cleanup without React Native's deprecated
 * InteractionManager. Modern native runtimes use requestIdleCallback; older
 * runtimes get one frame to paint before a zero-delay timer runs the task.
 */
export function scheduleMobileIdleTask(
  task: () => void,
  options: MobileIdleTaskOptions = {},
): MobileIdleTaskHandle {
  const environment = options.environment ?? getMobileIdleTaskEnvironment();
  const timeout = options.timeout ?? 700;
  let cancelled = false;
  let completed = false;
  let idleHandle: unknown = null;
  let frameHandle: unknown = null;
  let timeoutHandle: unknown = null;

  const run = () => {
    if (cancelled || completed) return;
    completed = true;
    task();
  };

  if (typeof environment.requestIdleCallback === "function") {
    idleHandle = environment.requestIdleCallback(run, { timeout });
  } else if (typeof environment.requestAnimationFrame === "function") {
    frameHandle = environment.requestAnimationFrame(() => {
      frameHandle = null;
      if (cancelled) return;
      timeoutHandle = environment.setTimeout(run, 0);
    });
  } else {
    timeoutHandle = environment.setTimeout(run, 0);
  }

  return {
    cancel() {
      if (cancelled || completed) return;
      cancelled = true;
      if (idleHandle !== null) {
        environment.cancelIdleCallback?.(idleHandle);
        idleHandle = null;
      }
      if (frameHandle !== null) {
        environment.cancelAnimationFrame?.(frameHandle);
        frameHandle = null;
      }
      if (timeoutHandle !== null) {
        environment.clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }
    },
  };
}

/**
 * Owns one replaceable idle task. Scheduling a new task or cancelling the
 * coordinator invalidates any older callback, including runtimes without a
 * native idle-callback cancellation API.
 */
export function createMobileIdleTaskCoordinator(
  options: MobileIdleTaskOptions = {},
): MobileIdleTaskCoordinator {
  let generation = 0;
  let pending: MobileIdleTaskHandle | null = null;

  return {
    schedule(task) {
      generation += 1;
      const scheduledGeneration = generation;
      pending?.cancel();
      pending = scheduleMobileIdleTask(() => {
        if (generation !== scheduledGeneration) return;
        pending = null;
        task();
      }, options);
    },
    cancel() {
      generation += 1;
      pending?.cancel();
      pending = null;
    },
  };
}
