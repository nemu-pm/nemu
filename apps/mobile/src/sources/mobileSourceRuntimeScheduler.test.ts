import { describe, expect, test } from "bun:test";
import {
  createMobileSourcePriorityTicket,
  createMobileSourceRuntimeScheduler,
  dispatchMobileSourceRuntimeCall,
  isMobileSourcePreemptedError,
  promoteMobileSourcePriority,
  type MobileSourceTaskPriority,
} from "./mobileSourceRuntimeScheduler";
import { isMobileSourceOperationTimeoutError } from "./mobileSourceOperationTimeout";

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flush(): Promise<void> {
  for (let index = 0; index < 5; index += 1) await Promise.resolve();
}

describe("mobile source runtime scheduler", () => {
  test("a waiting user operation goes before queued background work", async () => {
    const scheduler = createMobileSourceRuntimeScheduler();
    const order: string[] = [];
    const running = deferred();
    const first = scheduler.run(async () => {
      order.push("running");
      await running.promise;
    });
    const queued = (label: string, priority: MobileSourceTaskPriority) =>
      scheduler.run(
        async () => {
          order.push(label);
        },
        { priority },
      );
    const all = Promise.all([
      queued("cover", "normal"),
      queued("update-check-1", "background"),
      queued("update-check-2", "background"),
      queued("opened-manga", "user"),
    ]);
    await flush();
    expect(scheduler.snapshot()).toEqual({
      active: 1,
      queued: { user: 1, normal: 1, background: 2 },
    });

    running.resolve();
    await first;
    await all;
    expect(order).toEqual([
      "running",
      "opened-manga",
      "cover",
      "update-check-1",
      "update-check-2",
    ]);
  });

  test("never preempts: the running operation finishes first", async () => {
    const scheduler = createMobileSourceRuntimeScheduler();
    const running = deferred();
    let userStarted = false;
    const background = scheduler.run(() => running.promise, {
      priority: "background",
    });
    const user = scheduler.run(
      async () => {
        userStarted = true;
      },
      { priority: "user" },
    );
    await flush();
    expect(userStarted).toBe(false);
    running.resolve();
    await Promise.all([background, user]);
    expect(userStarted).toBe(true);
  });

  test("promoting a shared ticket moves an already-queued request forward", async () => {
    const scheduler = createMobileSourceRuntimeScheduler();
    const order: string[] = [];
    const running = deferred();
    const first = scheduler.run(() => running.promise);
    const sweepTicket = createMobileSourcePriorityTicket("background");
    const done = Promise.all([
      scheduler.run(async () => void order.push("cover"), { priority: "normal" }),
      scheduler.run(async () => void order.push("other-tab"), {
        priority: sweepTicket,
      }),
    ]);
    // The user opens the tab the sweep was loading.
    promoteMobileSourcePriority(sweepTicket, "user");
    // Promotion only ever raises.
    promoteMobileSourcePriority(sweepTicket, "background");
    expect(sweepTicket.priority).toBe("user");

    running.resolve();
    await first;
    await done;
    expect(order).toEqual(["other-tab", "cover"]);
  });

  test("an abandoned request is dropped before it reaches the runtime", async () => {
    const scheduler = createMobileSourceRuntimeScheduler();
    const running = deferred();
    const first = scheduler.run(() => running.promise);
    const controller = new AbortController();
    let started = false;
    const abandoned = scheduler.run(
      async () => {
        started = true;
      },
      { signal: controller.signal },
    );
    controller.abort();
    await expect(abandoned).rejects.toThrow(/aborted/i);
    expect(scheduler.snapshot().queued.normal).toBe(0);
    running.resolve();
    await first;
    expect(started).toBe(false);

    const already = new AbortController();
    already.abort();
    await expect(
      scheduler.run(async () => "never", { signal: already.signal }),
    ).rejects.toThrow(/aborted/i);
  });

  test("a failing or throwing operation releases its slot", async () => {
    const scheduler = createMobileSourceRuntimeScheduler();
    await expect(
      scheduler.run(() => {
        throw new Error("sync failure");
      }),
    ).rejects.toThrow("sync failure");
    await expect(
      scheduler.run(async () => {
        throw new Error("async failure");
      }),
    ).rejects.toThrow("async failure");
    await expect(scheduler.run(async () => "next")).resolves.toBe("next");
    expect(scheduler.snapshot().active).toBe(0);
  });

  test("a call that never settles cannot wedge the queue forever", async () => {
    const timers: Array<() => void> = [];
    const scheduler = createMobileSourceRuntimeScheduler({
      slotReleaseMs: 45_000,
      setTimer: (callback) => {
        timers.push(callback);
        return timers.length;
      },
      clearTimer: () => undefined,
    });
    void scheduler.run(() => new Promise<void>(() => undefined));
    let nextRan = false;
    const next = scheduler.run(async () => {
      nextRan = true;
    });
    await flush();
    expect(nextRan).toBe(false);
    // The slot's safety release fires.
    timers[0]?.();
    await next;
    expect(nextRan).toBe(true);
  });

  test("concurrency above one runs that many at once", async () => {
    const scheduler = createMobileSourceRuntimeScheduler({ concurrency: 2 });
    const gates = [deferred(), deferred()];
    let started = 0;
    const tasks = gates.map((gate) =>
      scheduler.run(async () => {
        started += 1;
        await gate.promise;
      }),
    );
    await flush();
    expect(started).toBe(2);
    for (const gate of gates) gate.resolve();
    await Promise.all(tasks);
  });
});

describe("dispatchMobileSourceRuntimeCall", () => {
  test("the timeout starts at dispatch, not while queued", async () => {
    const scheduler = createMobileSourceRuntimeScheduler();
    const running = deferred();
    const blocker = scheduler.run(() => running.promise, {
      priority: "background",
    });
    let waited = -1;
    const call = dispatchMobileSourceRuntimeCall(async () => "chapters", {
      scheduler,
      priority: "user",
      timeoutMs: 20,
      onDispatch: (waitMs) => {
        waited = waitMs;
      },
    });
    // Queued three times longer than its own timeout.
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(waited).toBe(-1);
    running.resolve();
    await blocker;
    await expect(call).resolves.toBe("chapters");
    expect(waited).toBeGreaterThanOrEqual(50);
  });

  test("a hung native call times out for the caller but keeps its slot until it settles", async () => {
    const scheduler = createMobileSourceRuntimeScheduler();
    const native = deferred<string>();
    const hung = dispatchMobileSourceRuntimeCall(() => native.promise, {
      scheduler,
      timeoutMs: 10,
    });
    const error = await hung.catch((nextError) => nextError);
    expect(isMobileSourceOperationTimeoutError(error)).toBe(true);
    // Native is still busy with it: the next call waits for the real settle.
    let nextStarted = false;
    const next = dispatchMobileSourceRuntimeCall(
      async () => {
        nextStarted = true;
        return "ok";
      },
      { scheduler, timeoutMs: 1_000 },
    );
    await flush();
    expect(nextStarted).toBe(false);
    native.resolve("late");
    await expect(next).resolves.toBe("ok");
  });

  test("propagates native failures and synchronous throws", async () => {
    const scheduler = createMobileSourceRuntimeScheduler();
    await expect(
      dispatchMobileSourceRuntimeCall(
        async () => {
          throw new Error("Aidoku HTTP request failed.");
        },
        { scheduler, timeoutMs: 1_000 },
      ),
    ).rejects.toThrow("Aidoku HTTP request failed.");
    await expect(
      dispatchMobileSourceRuntimeCall(
        () => {
          throw new Error("bridge missing");
        },
        { scheduler, timeoutMs: 1_000 },
      ),
    ).rejects.toThrow("bridge missing");
    expect(scheduler.snapshot().active).toBe(0);
  });
});

describe("preemption of background work", () => {
  test("a waiting user operation interrupts preemptible background work only", async () => {
    const scheduler = createMobileSourceRuntimeScheduler();
    const preempted: string[] = [];
    const running = deferred();
    const background = scheduler.run(() => running.promise, {
      priority: "background",
      preempt: () => preempted.push("update-check"),
    });
    await flush();
    // Normal work waiting does not interrupt anything.
    const cover = scheduler.run(async () => "cover", { priority: "normal" });
    expect(preempted).toEqual([]);
    const user = scheduler.run(async () => "opened", { priority: "user" });
    expect(preempted).toEqual(["update-check"]);
    // At most once per task.
    void scheduler.run(async () => "again", { priority: "user" });
    expect(preempted).toEqual(["update-check"]);
    running.resolve();
    await background;
    await expect(user).resolves.toBe("opened");
    await cover;
  });

  test("covers interrupt background work only once it has held the runtime a while", async () => {
    let clock = 0;
    const timers: Array<{ at: number; run: () => void }> = [];
    const scheduler = createMobileSourceRuntimeScheduler({
      now: () => clock,
      normalPreemptAfterMs: 1_500,
      setTimer: (callback, ms) => {
        timers.push({ at: clock + ms, run: callback });
        return timers.length;
      },
      clearTimer: () => undefined,
    });
    const preempted: string[] = [];
    const running = deferred();
    const background = scheduler.run(() => running.promise, {
      priority: "background",
      preempt: () => preempted.push("hung-update-check"),
    });
    await flush();
    clock = 400;
    void scheduler.run(async () => "cover", { priority: "normal" });
    expect(preempted).toEqual([]);
    expect(timers.map((timer) => timer.at)).toEqual([1_500]);
    clock = 1_500;
    timers[0]!.run();
    expect(preempted).toEqual(["hung-update-check"]);
    running.resolve();
    await background;
  });

  test("user and normal work is never interrupted", async () => {
    const scheduler = createMobileSourceRuntimeScheduler();
    const preempted: string[] = [];
    const running = deferred();
    const task = scheduler.run(() => running.promise, {
      priority: "normal",
      preempt: () => preempted.push("cover"),
    });
    void scheduler.run(async () => undefined, { priority: "user" });
    expect(preempted).toEqual([]);
    running.resolve();
    await task;
  });

  test("a request demoted to background is interrupted once a user waits", async () => {
    const scheduler = createMobileSourceRuntimeScheduler();
    const ticket = createMobileSourcePriorityTicket("user");
    const preempted: string[] = [];
    const running = deferred();
    const abandoned = scheduler.run(() => running.promise, {
      priority: ticket,
      preempt: () => preempted.push("left-screen"),
    });
    void scheduler.run(async () => undefined, { priority: "user" });
    expect(preempted).toEqual([]);
    ticket.priority = "background";
    scheduler.reevaluate();
    expect(preempted).toEqual(["left-screen"]);
    running.resolve();
    await abandoned;
  });

  test("a preempted call is re-queued behind the user and still resolves", async () => {
    const scheduler = createMobileSourceRuntimeScheduler();
    const order: string[] = [];
    const tokens: Array<string | undefined> = [];
    let rejectFirst!: (error: unknown) => void;
    let attempts = 0;
    const background = dispatchMobileSourceRuntimeCall(
      (cancelToken) => {
        tokens.push(cancelToken);
        attempts += 1;
        if (attempts === 1) {
          order.push("update-check:start");
          return new Promise<string>((_resolve, reject) => {
            rejectFirst = reject;
          });
        }
        order.push("update-check:retry");
        return Promise.resolve("chapters");
      },
      {
        scheduler,
        priority: "background",
        timeoutMs: 1_000,
        cancel: (cancelToken) => {
          order.push(`cancel:${cancelToken === tokens[0]}`);
          rejectFirst(
            new Error(
              "[nemu-preempted] The Aidoku operation was paused for a user request.",
            ),
          );
        },
      },
    );
    await flush();
    const user = dispatchMobileSourceRuntimeCall(
      async () => {
        order.push("user");
        return "opened";
      },
      { scheduler, priority: "user", timeoutMs: 1_000 },
    );
    await expect(user).resolves.toBe("opened");
    await expect(background).resolves.toBe("chapters");
    expect(order).toEqual([
      "update-check:start",
      "cancel:true",
      "user",
      "update-check:retry",
    ]);
    // Every attempt gets its own token.
    expect(new Set(tokens).size).toBe(2);
    expect(tokens.every((token) => /^op-[a-z0-9]+-[a-z0-9]+$/.test(token ?? ""))).toBe(true);
  });

  test("real failures are not retried", async () => {
    const scheduler = createMobileSourceRuntimeScheduler();
    let attempts = 0;
    await expect(
      dispatchMobileSourceRuntimeCall(
        async () => {
          attempts += 1;
          throw new Error("Aidoku HTTP request failed.");
        },
        { scheduler, timeoutMs: 1_000, cancel: () => undefined },
      ),
    ).rejects.toThrow("Aidoku HTTP request failed.");
    expect(attempts).toBe(1);
    expect(isMobileSourcePreemptedError(new Error("[nemu-preempted] x"))).toBe(true);
    expect(isMobileSourcePreemptedError(new Error("Request cancelled."))).toBe(false);
  });
});
