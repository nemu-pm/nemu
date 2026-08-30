import { describe, expect, test } from "bun:test";
import {
  createMobileIdleTaskCoordinator,
  scheduleMobileIdleTask,
} from "./mobileIdleTask";

describe("mobile idle task scheduling", () => {
  test("keeps source browsing off the deprecated interaction scheduler", async () => {
    const source = await Bun.file(
      new URL("../screens/SourceBrowseScreen.tsx", import.meta.url),
    ).text();
    expect(source).not.toContain("InteractionManager");
    expect(source).not.toContain("renderSourceBrowseContent");
    expect(source).not.toContain("inactiveReleaseTaskRef");
  });

  test("uses requestIdleCallback with a bounded timeout", () => {
    let idleCallback: () => void = () => {
      throw new Error("idle callback was not scheduled");
    };
    let requestedTimeout: number | undefined;
    let runs = 0;

    scheduleMobileIdleTask(
      () => {
        runs += 1;
      },
      {
        environment: {
          requestIdleCallback: (callback, options) => {
            idleCallback = callback;
            requestedTimeout = options?.timeout;
            return "idle-1";
          },
          setTimeout: () => {
            throw new Error("timer fallback should not run");
          },
          clearTimeout: () => undefined,
        },
      },
    );

    expect(requestedTimeout).toBe(700);
    idleCallback();
    idleCallback();
    expect(runs).toBe(1);
  });

  test("cancels a pending idle callback even without a native canceller", () => {
    let idleCallback: () => void = () => {
      throw new Error("idle callback was not scheduled");
    };
    let runs = 0;
    const handle = scheduleMobileIdleTask(
      () => {
        runs += 1;
      },
      {
        environment: {
          requestIdleCallback: (callback) => {
            idleCallback = callback;
            return "idle-1";
          },
          setTimeout: () => "unused",
          clearTimeout: () => undefined,
        },
      },
    );

    handle.cancel();
    idleCallback();
    expect(runs).toBe(0);
  });

  test("falls back to a paint frame and cancellable timer", () => {
    let frameCallback: () => void = () => {
      throw new Error("frame callback was not scheduled");
    };
    let timerCallback: () => void = () => {
      throw new Error("timer callback was not scheduled");
    };
    const cleared: unknown[] = [];
    let runs = 0;
    const handle = scheduleMobileIdleTask(
      () => {
        runs += 1;
      },
      {
        environment: {
          requestAnimationFrame: (callback) => {
            frameCallback = callback;
            return "frame-1";
          },
          cancelAnimationFrame: () => undefined,
          setTimeout: (callback) => {
            timerCallback = callback;
            return "timer-1";
          },
          clearTimeout: (timer) => cleared.push(timer),
        },
      },
    );

    frameCallback();
    handle.cancel();
    timerCallback();
    expect(cleared).toEqual(["timer-1"]);
    expect(runs).toBe(0);
  });

  test("runs only the newest coordinated task and cancels on screen blur", () => {
    const idleCallbacks: Array<() => void> = [];
    const runs: string[] = [];
    const coordinator = createMobileIdleTaskCoordinator({
      environment: {
        requestIdleCallback: (callback) => {
          idleCallbacks.push(callback);
          return idleCallbacks.length;
        },
        setTimeout: () => "unused",
        clearTimeout: () => undefined,
      },
    });

    coordinator.schedule(() => runs.push("stale"));
    coordinator.schedule(() => runs.push("latest"));
    idleCallbacks[0]?.();
    idleCallbacks[1]?.();
    expect(runs).toEqual(["latest"]);

    coordinator.schedule(() => runs.push("after-blur"));
    coordinator.cancel();
    idleCallbacks[2]?.();
    expect(runs).toEqual(["latest"]);
  });
});
