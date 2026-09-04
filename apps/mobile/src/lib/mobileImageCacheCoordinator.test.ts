import { describe, expect, test } from "bun:test";
import {
  MobileImageCacheCoordinator,
  shouldRetryCachedMobileImageError,
  type MobileImageCacheUriStore,
} from "./mobileImageCacheCoordinator";

class FakeUriStore implements MobileImageCacheUriStore {
  readonly entries = new Map<string, string>();
  removeError: Error | null = null;

  async getUri(key: string): Promise<string | null> {
    return this.entries.get(key) ?? null;
  }

  async remove(key: string): Promise<void> {
    if (this.removeError) throw this.removeError;
    this.entries.delete(key);
  }
}

async function drainMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

/** Flushes every pending microtask, including the pre-slot disk probe. */
async function flushAsyncWork(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("MobileImageCacheCoordinator", () => {
  test("rejects an invalid global load concurrency limit", () => {
    expect(() => new MobileImageCacheCoordinator(new FakeUriStore(), 4, 0)).toThrow(
      "Invalid mobile image load concurrency limit.",
    );
  });

  test("re-downloads an in-memory URI after its disk file is evicted", async () => {
    const store = new FakeUriStore();
    const coordinator = new MobileImageCacheCoordinator(store, 4);
    store.entries.set("cover", "file:///cache/old.jpg");

    expect(await coordinator.resolve("cover", async () => null)).toBe(
      "file:///cache/old.jpg",
    );
    expect(coordinator.getResolvedUri("cover")).toBe("file:///cache/old.jpg");

    // Simulate byte/count quota eviction performed by FileSystemBinaryCache.
    store.entries.delete("cover");
    let downloads = 0;
    const repaired = await coordinator.resolve("cover", async () => {
      downloads += 1;
      const uri = "file:///cache/repaired.jpg";
      store.entries.set("cover", uri);
      return uri;
    });

    expect(downloads).toBe(1);
    expect(repaired).toBe("file:///cache/repaired.jpg");
    expect(coordinator.getResolvedUri("cover")).toBe(
      "file:///cache/repaired.jpg",
    );
  });

  test("refreshes the memory hint when the disk entry URI changes", async () => {
    const store = new FakeUriStore();
    const coordinator = new MobileImageCacheCoordinator(store, 4);
    store.entries.set("cover", "file:///cache/first.jpg");
    await coordinator.resolve("cover", async () => null);
    store.entries.set("cover", "file:///cache/replaced.webp");

    let downloads = 0;
    expect(
      await coordinator.resolve("cover", async () => {
        downloads += 1;
        return null;
      }),
    ).toBe("file:///cache/replaced.webp");
    expect(downloads).toBe(0);
    expect(coordinator.getResolvedUri("cover")).toBe(
      "file:///cache/replaced.webp",
    );
  });

  test("globally limits loads and starts visible work before queued prefetches", async () => {
    const store = new FakeUriStore();
    const coordinator = new MobileImageCacheCoordinator(store, 8, 1);
    const firstGate = Promise.withResolvers<string | null>();
    const secondGate = Promise.withResolvers<string | null>();
    const visibleGate = Promise.withResolvers<string | null>();
    const started: string[] = [];

    const first = coordinator.resolve(
      "prefetch-a",
      async () => {
        started.push("prefetch-a");
        return firstGate.promise;
      },
      { priority: "prefetch" },
    );
    await drainMicrotasks();
    const second = coordinator.resolve(
      "prefetch-b",
      async () => {
        started.push("prefetch-b");
        return secondGate.promise;
      },
      { priority: "prefetch" },
    );
    const visible = coordinator.resolve("visible", async () => {
      started.push("visible");
      return visibleGate.promise;
    });

    expect(started).toEqual(["prefetch-a"]);
    firstGate.resolve("file:///cache/prefetch-a.jpg");
    await expect(first).resolves.toBe("file:///cache/prefetch-a.jpg");
    await drainMicrotasks();
    expect(started).toEqual(["prefetch-a", "visible"]);

    visibleGate.resolve("file:///cache/visible.jpg");
    await expect(visible).resolves.toBe("file:///cache/visible.jpg");
    await drainMicrotasks();
    expect(started).toEqual(["prefetch-a", "visible", "prefetch-b"]);

    secondGate.resolve("file:///cache/prefetch-b.jpg");
    await expect(second).resolves.toBe("file:///cache/prefetch-b.jpg");
  });

  test("drops orphaned queued work before its loader starts", async () => {
    const store = new FakeUriStore();
    const coordinator = new MobileImageCacheCoordinator(store, 8, 1);
    const activeGate = Promise.withResolvers<string | null>();
    const active = coordinator.resolve("active", () => activeGate.promise);
    await drainMicrotasks();

    const owner = new AbortController();
    let queuedStarts = 0;
    const queued = coordinator.resolve(
      "queued",
      async () => {
        queuedStarts += 1;
        return "file:///cache/queued.jpg";
      },
      { signal: owner.signal },
    );
    owner.abort();

    await expect(queued).resolves.toBeNull();
    expect(queuedStarts).toBe(0);
    activeGate.resolve("file:///cache/active.jpg");
    await expect(active).resolves.toBe("file:///cache/active.jpg");
    await drainMicrotasks();
    expect(queuedStarts).toBe(0);
  });

  test("keeps shared work alive until every owner aborts", async () => {
    const store = new FakeUriStore();
    const coordinator = new MobileImageCacheCoordinator(store, 8, 1);
    const firstOwner = new AbortController();
    const secondOwner = new AbortController();
    let loadCalls = 0;
    let duplicateLoadCalls = 0;
    const shared = { signal: null as AbortSignal | null };
    let underlyingAborts = 0;

    const first = coordinator.resolve(
      "cover",
      (signal) => {
        loadCalls += 1;
        shared.signal = signal;
        return new Promise<string | null>((resolve) => {
          signal.addEventListener(
            "abort",
            () => {
              underlyingAborts += 1;
              resolve(null);
            },
            { once: true },
          );
        });
      },
      { signal: firstOwner.signal },
    );
    const second = coordinator.resolve(
      "cover",
      async () => {
        duplicateLoadCalls += 1;
        return "file:///cache/duplicate.jpg";
      },
      { signal: secondOwner.signal },
    );
    await drainMicrotasks();

    firstOwner.abort();
    await expect(first).resolves.toBeNull();
    expect(shared.signal?.aborted).toBe(false);
    expect(underlyingAborts).toBe(0);

    secondOwner.abort();
    await expect(second).resolves.toBeNull();
    await drainMicrotasks();
    expect(shared.signal?.aborted).toBe(true);
    expect(underlyingAborts).toBe(1);
    expect(loadCalls).toBe(1);
    expect(duplicateLoadCalls).toBe(0);
  });

  test("lets a remaining owner receive a shared result after another aborts", async () => {
    const store = new FakeUriStore();
    const coordinator = new MobileImageCacheCoordinator(store, 8, 1);
    const firstOwner = new AbortController();
    const secondOwner = new AbortController();
    const download = Promise.withResolvers<string | null>();
    const shared = { signal: null as AbortSignal | null };
    let loadCalls = 0;

    const first = coordinator.resolve(
      "cover",
      (signal) => {
        loadCalls += 1;
        shared.signal = signal;
        return download.promise;
      },
      { signal: firstOwner.signal },
    );
    const second = coordinator.resolve("cover", async () => null, {
      signal: secondOwner.signal,
    });
    await drainMicrotasks();

    firstOwner.abort();
    await expect(first).resolves.toBeNull();
    expect(shared.signal?.aborted).toBe(false);
    download.resolve("file:///cache/cover.jpg");

    await expect(second).resolves.toBe("file:///cache/cover.jpg");
    expect(loadCalls).toBe(1);
    expect(coordinator.getResolvedUri("cover")).toBe("file:///cache/cover.jpg");
  });

  test("invalidates synchronously and bypasses a file that could not be removed", async () => {
    const store = new FakeUriStore();
    const coordinator = new MobileImageCacheCoordinator(store, 4);
    store.entries.set("cover", "file:///cache/corrupt.jpg");
    await coordinator.resolve("cover", async () => null);
    store.removeError = new Error("busy");

    const invalidation = coordinator.invalidate("cover");
    expect(coordinator.getResolvedUri("cover")).toBeNull();
    await expect(invalidation).rejects.toThrow("busy");

    let downloads = 0;
    expect(
      await coordinator.resolve("cover", async () => {
        downloads += 1;
        const uri = "file:///cache/repaired.jpg";
        store.entries.set("cover", uri);
        return uri;
      }),
    ).toBe("file:///cache/repaired.jpg");
    expect(downloads).toBe(1);
  });

  test("keeps the bypass armed when the load is cancelled before its slot", async () => {
    // The disk probe runs before a concurrency slot is taken. A consumer that
    // unmounts in that window must not spend the bypass: the known-bad file is
    // still on disk, so the next resolve has to skip it too.
    const store = new FakeUriStore();
    const coordinator = new MobileImageCacheCoordinator(store, 4, 1);
    store.entries.set("cover", "file:///cache/corrupt.jpg");
    await coordinator.resolve("cover", async () => null);
    store.removeError = new Error("busy");
    await expect(coordinator.invalidate("cover")).rejects.toThrow("busy");

    const leaving = new AbortController();
    const cancelled = coordinator.resolve("cover", async () => null, {
      signal: leaving.signal,
    });
    leaving.abort();
    await expect(cancelled).resolves.toBeNull();
    await flushAsyncWork();

    // The file that could not be deleted must still be bypassed.
    let downloads = 0;
    expect(
      await coordinator.resolve("cover", async () => {
        downloads += 1;
        const uri = "file:///cache/repaired.jpg";
        store.entries.set("cover", uri);
        return uri;
      }),
    ).toBe("file:///cache/repaired.jpg");
    expect(downloads).toBe(1);
  });

  test("spends the bypass once a replacement file lands", async () => {
    const store = new FakeUriStore();
    const coordinator = new MobileImageCacheCoordinator(store, 4);
    store.entries.set("cover", "file:///cache/corrupt.jpg");
    await coordinator.resolve("cover", async () => null);
    store.removeError = new Error("busy");
    await expect(coordinator.invalidate("cover")).rejects.toThrow("busy");

    expect(
      await coordinator.resolve("cover", async () => {
        const uri = "file:///cache/repaired.jpg";
        store.entries.set("cover", uri);
        return uri;
      }),
    ).toBe("file:///cache/repaired.jpg");

    // The bypass is spent: the repaired file is served straight from disk.
    let downloads = 0;
    expect(
      await coordinator.resolve("cover", async () => {
        downloads += 1;
        return null;
      }),
    ).toBe("file:///cache/repaired.jpg");
    expect(downloads).toBe(0);
  });

  test("allows only one cached-file retry per mounted source key", () => {
    expect(
      shouldRetryCachedMobileImageError({
        cachedUri: "file:///cache/cover.jpg",
        retriedSourceKey: null,
        sourceKey: "cover-a",
      }),
    ).toBe(true);
    expect(
      shouldRetryCachedMobileImageError({
        cachedUri: "file:///cache/cover.jpg",
        retriedSourceKey: "cover-a",
        sourceKey: "cover-a",
      }),
    ).toBe(false);
    expect(
      shouldRetryCachedMobileImageError({
        cachedUri: null,
        retriedSourceKey: null,
        sourceKey: "cover-a",
      }),
    ).toBe(false);
  });

  test("cancels active and queued work before clearing disk and memory", async () => {
    const store = new FakeUriStore();
    const coordinator = new MobileImageCacheCoordinator(store, 4, 1);
    const events: string[] = [];
    store.entries.set("existing", "file:///cache/existing.jpg");
    const loading = coordinator.resolve("active", (signal) => {
      events.push("active:start");
      return new Promise<string | null>((resolve) => {
        signal.addEventListener(
          "abort",
          () => {
            events.push("active:abort");
            // Even a loader whose abort callback raced with a write must settle
            // before the store is cleared, so it cannot recreate the cache.
            store.entries.set("active", "file:///cache/aborted.jpg");
            resolve("file:///cache/aborted.jpg");
          },
          { once: true },
        );
      });
    });
    await drainMicrotasks();

    let queuedStarts = 0;
    const queued = coordinator.resolve("queued", async () => {
      queuedStarts += 1;
      return "file:///cache/queued.jpg";
    });
    const clearing = coordinator.clearAll(async () => {
      events.push("store:clear");
      store.entries.clear();
    });

    await expect(loading).resolves.toBeNull();
    await expect(queued).resolves.toBeNull();
    await clearing;
    expect(events).toEqual(["active:start", "active:abort", "store:clear"]);
    expect(queuedStarts).toBe(0);
    expect(store.entries.size).toBe(0);
    expect(coordinator.getResolvedUri("active")).toBeNull();
  });

  test("waits for a non-abortable writer before clearing disk and memory", async () => {
    const store = new FakeUriStore();
    const coordinator = new MobileImageCacheCoordinator(store, 4);
    const download = Promise.withResolvers<string | null>();
    let writing = false;
    const loading = coordinator.resolve("cover", async () => {
      writing = true;
      const uri = await download.promise;
      if (uri) store.entries.set("cover", uri);
      return uri;
    });
    // The disk probe now runs before the load takes a slot, so the writer is
    // only in flight once that probe has missed.
    await flushAsyncWork();
    expect(writing).toBe(true);

    let clearCalls = 0;
    const clearing = coordinator.clearAll(async () => {
      clearCalls += 1;
      store.entries.clear();
    });
    await drainMicrotasks();
    expect(clearCalls).toBe(0);
    download.resolve("file:///cache/late.jpg");

    await expect(loading).resolves.toBeNull();
    await clearing;
    expect(clearCalls).toBe(1);
    expect(store.entries.size).toBe(0);
    expect(coordinator.getResolvedUri("cover")).toBeNull();
  });

  test("returns a disk hit without waiting for a concurrency slot", async () => {
    const store = new FakeUriStore();
    const coordinator = new MobileImageCacheCoordinator(store, 8, 1);
    store.entries.set("cached", "file:///cache/cached.jpg");
    const download = Promise.withResolvers<string | null>();
    let downloads = 0;

    const downloading = coordinator.resolve("missing", async () => {
      downloads += 1;
      return download.promise;
    });
    await flushAsyncWork();
    expect(downloads).toBe(1);

    // The single slot is occupied by the download; a disk hit must not queue.
    await expect(coordinator.resolve("cached", async () => null)).resolves.toBe(
      "file:///cache/cached.jpg",
    );
    expect(coordinator.getResolvedUri("cached")).toBe("file:///cache/cached.jpg");

    download.resolve("file:///cache/downloaded.jpg");
    await expect(downloading).resolves.toBe("file:///cache/downloaded.jpg");
  });

  test("still queues a disk miss behind the concurrency limit", async () => {
    const store = new FakeUriStore();
    const coordinator = new MobileImageCacheCoordinator(store, 8, 1);
    const download = Promise.withResolvers<string | null>();
    let secondStarts = 0;

    const first = coordinator.resolve("first", async () => download.promise);
    const second = coordinator.resolve("second", async () => {
      secondStarts += 1;
      return "file:///cache/second.jpg";
    });
    await flushAsyncWork();
    expect(secondStarts).toBe(0);

    download.resolve("file:///cache/first.jpg");
    await expect(first).resolves.toBe("file:///cache/first.jpg");
    await expect(second).resolves.toBe("file:///cache/second.jpg");
    expect(secondStarts).toBe(1);
  });

  test("serializes repair behind an in-flight invalidation", async () => {
    const store = new FakeUriStore();
    const coordinator = new MobileImageCacheCoordinator(store, 4);
    store.entries.set("cover", "file:///cache/corrupt.jpg");
    await coordinator.resolve("cover", async () => null);

    const removeGate = Promise.withResolvers<void>();
    store.remove = async (key: string) => {
      await removeGate.promise;
      store.entries.delete(key);
    };
    const invalidating = coordinator.invalidate("cover");
    let downloads = 0;
    const repairing = coordinator.resolve("cover", async () => {
      downloads += 1;
      const uri = "file:///cache/repaired.jpg";
      store.entries.set("cover", uri);
      return uri;
    });
    await Promise.resolve();
    expect(downloads).toBe(0);
    removeGate.resolve();

    await invalidating;
    await expect(repairing).resolves.toBe("file:///cache/repaired.jpg");
    expect(downloads).toBe(1);
  });
});
