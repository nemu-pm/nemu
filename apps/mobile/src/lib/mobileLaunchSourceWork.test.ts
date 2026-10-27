import { beforeEach, describe, expect, test } from "bun:test";
import type { MobileIdleTaskEnvironment } from "./mobileIdleTask";
import {
  isMobileLaunchSourceWorkAllowed,
  markMobileLaunchSourceWorkRevealed,
  resetMobileLaunchSourceWorkForTests,
  waitForMobileLaunchSourceWork,
} from "./mobileLaunchSourceWork";

function manualIdle() {
  const tasks: Array<() => void> = [];
  const environment: MobileIdleTaskEnvironment = {
    requestIdleCallback: (callback) => {
      tasks.push(callback);
      return tasks.length;
    },
    cancelIdleCallback: () => undefined,
    setTimeout: (callback, delay) => setTimeout(callback, delay),
    clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  };
  return {
    environment,
    flush: () => tasks.splice(0).forEach((task) => task()),
  };
}

describe("launch source work gate", () => {
  let idle = manualIdle();
  beforeEach(() => {
    idle = manualIdle();
    resetMobileLaunchSourceWorkForTests(idle.environment);
  });

  test("stays closed under the launch screen and opens at the first idle after the reveal", async () => {
    let ran = false;
    void waitForMobileLaunchSourceWork().then(() => {
      ran = true;
    });
    await Promise.resolve();
    expect(ran).toBe(false);
    markMobileLaunchSourceWorkRevealed();
    await Promise.resolve();
    expect(ran).toBe(false);
    expect(isMobileLaunchSourceWorkAllowed()).toBe(false);
    idle.flush();
    await Promise.resolve();
    expect(ran).toBe(true);
    expect(isMobileLaunchSourceWorkAllowed()).toBe(true);
  });

  test("resolves at once after the launch", async () => {
    markMobileLaunchSourceWorkRevealed();
    idle.flush();
    let ran = false;
    await waitForMobileLaunchSourceWork().then(() => {
      ran = true;
    });
    expect(ran).toBe(true);
  });

  test("a second reveal schedules nothing new", () => {
    markMobileLaunchSourceWorkRevealed();
    markMobileLaunchSourceWorkRevealed();
    idle.flush();
    expect(isMobileLaunchSourceWorkAllowed()).toBe(true);
  });
});
