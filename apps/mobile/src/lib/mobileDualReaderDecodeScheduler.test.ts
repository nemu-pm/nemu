import { describe, expect, test } from "bun:test";
import {
  MOBILE_DUAL_READER_DECODE_MAX_CONCURRENCY,
  createMobileDualReaderDecodeScheduler,
} from "./mobileDualReaderDecodeScheduler";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("mobile dual-reader decode scheduler", () => {
  test("serializes the nine-page auto-align window", async () => {
    const scheduler = createMobileDualReaderDecodeScheduler();
    const releases: Array<() => void> = [];
    let running = 0;
    let maxRunning = 0;
    let started = 0;

    const jobs = Array.from({ length: 9 }, (_, index) =>
      scheduler.schedule(
        () =>
          new Promise<number>((resolve) => {
            started += 1;
            running += 1;
            maxRunning = Math.max(maxRunning, running);
            releases.push(() => {
              running -= 1;
              resolve(index);
            });
          }),
      ),
    );

    await flush();
    expect(MOBILE_DUAL_READER_DECODE_MAX_CONCURRENCY).toBe(1);
    expect(started).toBe(1);
    expect(scheduler.getStats()).toMatchObject({ active: 1, queued: 8 });

    for (let completed = 0; completed < 9; completed += 1) {
      releases.shift()!();
      await flush();
      expect(maxRunning).toBe(1);
      expect(started).toBe(Math.min(9, completed + 2));
    }

    await expect(Promise.all(jobs)).resolves.toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(scheduler.getStats()).toEqual({ active: 0, queued: 0, foreground: true });
  });

  test("background rejects queued work, invalidates active results, and resumes cleanly", async () => {
    const scheduler = createMobileDualReaderDecodeScheduler();
    const activeResult = Promise.withResolvers<string>();
    const first = scheduler.schedule(() => activeResult.promise);
    const queued = scheduler.schedule(async () => "queued");
    await flush();

    scheduler.setAppState("background");
    expect(scheduler.getStats()).toEqual({ active: 1, queued: 0, foreground: false });
    await expect(queued).rejects.toThrow(/cancelled/);
    await expect(scheduler.schedule(async () => "late")).rejects.toThrow(/cancelled/);

    activeResult.resolve("stale");
    await expect(first).rejects.toThrow(/cancelled/);
    await flush();

    scheduler.setAppState("active");
    await expect(scheduler.schedule(async () => "fresh")).resolves.toBe("fresh");
  });

  test("cancelPending rejects queued jobs and discards the running result", async () => {
    const scheduler = createMobileDualReaderDecodeScheduler();
    const activeResult = Promise.withResolvers<number>();
    const first = scheduler.schedule(() => activeResult.promise);
    const second = scheduler.schedule(async () => 2);
    await flush();

    scheduler.cancelPending();
    await expect(second).rejects.toThrow(/cancelled/);
    activeResult.resolve(1);
    await expect(first).rejects.toThrow(/cancelled/);
    await flush();

    await expect(scheduler.schedule(async () => 3)).resolves.toBe(3);
  });

  test("user-visible image work bypasses queued background alignment decodes", async () => {
    const scheduler = createMobileDualReaderDecodeScheduler();
    const activeResult = Promise.withResolvers<string>();
    const starts: string[] = [];
    const active = scheduler.schedule(
      () => {
        starts.push("active-background");
        return activeResult.promise;
      },
      { priority: "background" },
    );
    const queuedBackground = scheduler.schedule(
      async () => {
        starts.push("queued-background");
        return "background";
      },
      { priority: "background" },
    );
    const visible = scheduler.schedule(async () => {
      starts.push("visible");
      return "visible";
    });
    await flush();

    activeResult.resolve("active");
    await active;
    await flush();
    expect(starts).toEqual(["active-background", "visible", "queued-background"]);
    await expect(visible).resolves.toBe("visible");
    await expect(queuedBackground).resolves.toBe("background");
  });
});
