import { describe, expect, test } from "bun:test";
import type { LocalMangaProgress } from "@/data/schema";
import { createProgressStore } from "./progress";

function progress(id: string, updatedAt = 1): LocalMangaProgress {
  return {
    id: `registry:source:${id}`,
    registryId: "registry",
    sourceId: "source",
    sourceMangaId: id,
    lastReadAt: updatedAt,
    updatedAt,
  };
}

describe("ProgressStore generation transitions", () => {
  test("clears warm manga progress and rejects an inflight stale load", async () => {
    let markLoadStarted!: () => void;
    const loadStarted = new Promise<void>((resolve) => {
      markLoadStarted = resolve;
    });
    let resolveLoad!: (entries: LocalMangaProgress[]) => void;
    const delayedLoad = new Promise<LocalMangaProgress[]>((resolve) => {
      resolveLoad = resolve;
    });
    const store = createProgressStore({
      getAllMangaProgress: async () => {
        markLoadStarted();
        return delayedLoad;
      },
    });
    const warm = progress("warm");
    store.setState({ index: new Map([[warm.id, warm]]), loading: false });

    const loading = store.getState().load();
    await loadStarted;
    store.getState().prepareSyncGeneration(2, Promise.resolve());
    expect(store.getState().index.size).toBe(0);
    expect(store.getState().loading).toBe(true);
    resolveLoad([progress("stale")]);
    await loading;

    expect(store.getState().index.size).toBe(0);
    expect(store.getState().syncGeneration).toBe(2);
  });

  test("waits for the durable reset before a new-generation load", async () => {
    let readCount = 0;
    let markReady!: () => void;
    const readiness = new Promise<void>((resolve) => {
      markReady = resolve;
    });
    const next = progress("new", 2);
    const store = createProgressStore({
      getAllMangaProgress: async () => {
        readCount += 1;
        return [next];
      },
    });
    store.getState().prepareSyncGeneration(3, readiness);

    const loading = store.getState().load();
    await Promise.resolve();
    expect(readCount).toBe(0);
    markReady();
    await loading;

    expect(store.getState().get(next.id)).toEqual(next);
    expect(store.getState().loading).toBe(false);
  });
});
