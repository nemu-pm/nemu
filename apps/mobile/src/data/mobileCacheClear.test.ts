import { describe, expect, test } from "bun:test";
import { runMobileCacheClearSteps } from "./mobileCacheClear";

describe("runMobileCacheClearSteps", () => {
  test("runs every cache layer in order", async () => {
    const calls: string[] = [];

    await runMobileCacheClearSteps([
      () => {
        calls.push("packages");
      },
      async () => {
        calls.push("sessions");
      },
      () => {
        calls.push("images");
      },
    ]);

    expect(calls).toEqual(["packages", "sessions", "images"]);
  });

  test("continues after failures and rethrows the first failure", async () => {
    const calls: string[] = [];
    const firstFailure = new Error("packages unavailable");

    await expect(
      runMobileCacheClearSteps([
        () => {
          calls.push("packages");
          throw firstFailure;
        },
        () => {
          calls.push("sessions");
          throw new Error("sessions unavailable");
        },
        () => {
          calls.push("images");
        },
      ]),
    ).rejects.toBe(firstFailure);

    expect(calls).toEqual(["packages", "sessions", "images"]);
  });

  test("preserves falsy rejection values without skipping later layers", async () => {
    let finalLayerRan = false;

    try {
      await runMobileCacheClearSteps([
        () => Promise.reject(undefined),
        () => {
          finalLayerRan = true;
        },
      ]);
      throw new Error("Expected the cache clear to reject");
    } catch (error) {
      expect(error).toBeUndefined();
    }

    expect(finalLayerRan).toBe(true);
  });
});
