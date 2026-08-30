import { describe, expect, test } from "bun:test";
import {
  NativeCacheMutationQueue,
  NativeCacheWriteCoordinator,
} from "./nativeCacheWriteCoordinator";

describe("NativeCacheWriteCoordinator", () => {
  test("rejects an older writer when downloads complete in reverse order", () => {
    const coordinator = new NativeCacheWriteCoordinator();
    const oldVersion = coordinator.begin("aix:source");
    const newVersion = coordinator.begin("aix:source");

    expect(coordinator.isCurrent(newVersion)).toBe(true);
    expect(coordinator.isCurrent(oldVersion)).toBe(false);

    coordinator.finish(newVersion);
    expect(coordinator.isCurrent(oldVersion)).toBe(false);
  });

  test("keeps ownership independent across cache keys", () => {
    const coordinator = new NativeCacheWriteCoordinator();
    const first = coordinator.begin("first");
    const second = coordinator.begin("second");

    expect(coordinator.isCurrent(first)).toBe(true);
    expect(coordinator.isCurrent(second)).toBe(true);
  });

  test("invalidates in-flight writers on remove and clear", () => {
    const coordinator = new NativeCacheWriteCoordinator();
    const removed = coordinator.begin("removed");
    coordinator.invalidate("removed");
    expect(coordinator.isCurrent(removed)).toBe(false);

    const cleared = coordinator.begin("cleared");
    coordinator.invalidateAll();
    expect(coordinator.isCurrent(cleared)).toBe(false);
  });
});

describe("NativeCacheMutationQueue", () => {
  test("keeps remove behind an in-progress publish and leaves no stale file", async () => {
    const coordinator = new NativeCacheWriteCoordinator();
    const queue = new NativeCacheMutationQueue();
    const lease = coordinator.begin("aix:source");
    let releaseMove: () => void = () => undefined;
    let announceMove: () => void = () => undefined;
    const moveStarted = new Promise<void>((resolve) => {
      announceMove = resolve;
    });
    const moveBlocked = new Promise<void>((resolve) => {
      releaseMove = resolve;
    });
    let file: string | null = null;

    const stalePublish = queue.run(async () => {
      expect(coordinator.isCurrent(lease)).toBe(true);
      file = "old-bytes";
      announceMove();
      await moveBlocked;
      if (!coordinator.isCurrent(lease)) file = null;
    });
    await moveStarted;

    coordinator.invalidate("aix:source");
    const remove = queue.run(() => {
      file = null;
    });
    releaseMove();

    await Promise.all([stalePublish, remove]);
    expect(file).toBeNull();
  });

  test("continues after a failed mutation", async () => {
    const queue = new NativeCacheMutationQueue();
    await expect(
      queue.run(() => {
        throw new Error("failed");
      }),
    ).rejects.toThrow("failed");
    await expect(queue.run(() => "next")).resolves.toBe("next");
  });
});
