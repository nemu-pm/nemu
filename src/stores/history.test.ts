import { describe, expect, test } from "bun:test";
import type { LocalChapterProgress } from "@/data/schema";
import { createHistoryStore, type HistoryStoreOps } from "./history";

function progress(
  updatedAt: number,
  overrides: Partial<LocalChapterProgress> = {},
): LocalChapterProgress {
  return {
    id: "registry:source:manga:chapter",
    registryId: "registry",
    sourceId: "source",
    sourceMangaId: "manga",
    sourceChapterId: "chapter",
    progress: 5,
    total: 10,
    completed: false,
    lastReadAt: updatedAt,
    updatedAt,
    ...overrides,
  };
}

function ops(overrides: Partial<HistoryStoreOps> = {}): HistoryStoreOps {
  return {
    getChapterProgress: async () => null,
    saveChapterProgress: async (entry) => entry,
    getMangaChapterProgress: async () => ({}),
    ...overrides,
  };
}

describe("history store snapshot coherence", () => {
  test("does not reload old IndexedDB rows before generation reset is durable", async () => {
    const old = progress(10, { chapterTitle: "old-generation" });
    let stored: LocalChapterProgress | null = old;
    let readCalls = 0;
    let release!: () => void;
    const readiness = new Promise<void>((resolve) => {
      release = () => {
        stored = null;
        resolve();
      };
    });
    const store = createHistoryStore(
      ops({
        getChapterProgress: async () => {
          readCalls += 1;
          return stored;
        },
      }),
    );

    store.getState().prepareSyncGeneration(2, readiness);
    const pending = store
      .getState()
      .getProgress("registry", "source", "manga", "chapter");
    await Promise.resolve();

    expect(readCalls).toBe(0);
    expect(store.getState().entries.size).toBe(0);

    release();
    expect(await pending).toBeNull();
    expect(readCalls).toBe(1);
    expect(store.getState().entries.size).toBe(0);
  });

  test("queues a user save behind generation readiness instead of dropping it", async () => {
    let saveCalls = 0;
    let release!: () => void;
    const readiness = new Promise<void>((resolve) => {
      release = resolve;
    });
    const store = createHistoryStore(
      ops({
        saveChapterProgress: async (entry) => {
          saveCalls += 1;
          return entry;
        },
      }),
    );

    store.getState().prepareSyncGeneration(2, readiness);
    const pending = store
      .getState()
      .saveProgress("registry", "source", "manga", "chapter", 5, 10);
    await Promise.resolve();
    expect(saveCalls).toBe(0);

    release();
    await pending;
    expect(saveCalls).toBe(1);
    expect(store.getState().entries.size).toBe(1);
  });

  test("allows a failed generation preparation to be retried", async () => {
    const store = createHistoryStore(ops());
    store
      .getState()
      .prepareSyncGeneration(2, Promise.reject(new Error("idb unavailable")));

    await expect(
      store.getState().getProgress("registry", "source", "manga", "chapter"),
    ).rejects.toThrow("idb unavailable");

    store.getState().prepareSyncGeneration(2, Promise.resolve());
    await expect(
      store.getState().getProgress("registry", "source", "manga", "chapter"),
    ).resolves.toBeNull();
  });

  test("drops a warm cache immediately when the sync generation advances", async () => {
    const old = progress(10);
    const store = createHistoryStore(
      ops({ getChapterProgress: async () => old }),
    );
    store.getState().prepareSyncGeneration(1);
    expect(
      await store
        .getState()
        .getProgress("registry", "source", "manga", "chapter"),
    ).toEqual(old);

    store.getState().prepareSyncGeneration(2);

    expect(store.getState().entries.size).toBe(0);
    expect(store.getState().syncGeneration).toBe(2);
  });

  test("ignores a delayed snapshot from an older generation", () => {
    const current = progress(20, { chapterTitle: "generation-2" });
    const stale = progress(30, { chapterTitle: "delayed-generation-1" });
    const store = createHistoryStore(ops());
    store.getState().replaceSyncSnapshot([current], 2);

    store.getState().prepareSyncGeneration(1);
    store.getState().replaceSyncSnapshot([stale], 1);

    expect(store.getState().syncGeneration).toBe(2);
    expect(store.getState().entries.get(current.id)).toEqual(current);
  });

  test("replaces cached progress with an authoritative remote snapshot", () => {
    const old = progress(10, { chapterTitle: "old" });
    const remote = progress(20, { progress: 8, chapterTitle: "remote" });
    const store = createHistoryStore(ops());
    store.getState().prepareSyncGeneration(3);
    store.setState({ entries: new Map([[old.id, old]]) });

    store.getState().replaceSyncSnapshot([remote], 3);

    expect(store.getState().entries.get(old.id)).toEqual(remote);
  });

  test("does not let a late point read overwrite a completed remote snapshot", async () => {
    let resolveRead!: (entry: LocalChapterProgress) => void;
    const read = new Promise<LocalChapterProgress>((resolve) => {
      resolveRead = resolve;
    });
    const store = createHistoryStore(
      ops({ getChapterProgress: async () => read }),
    );
    store.getState().prepareSyncGeneration(3);

    const pending = store
      .getState()
      .getProgress("registry", "source", "manga", "chapter");
    const remote = progress(20, { progress: 8, chapterTitle: "remote" });
    store.getState().replaceSyncSnapshot([remote], 3);
    resolveRead(progress(10, { chapterTitle: "stale-read" }));

    expect(await pending).toEqual(remote);
    expect(store.getState().entries.get(remote.id)).toEqual(remote);
  });

  test("does not let a late manga read drop rows from a completed snapshot", async () => {
    let resolveRead!: (entries: Record<string, LocalChapterProgress>) => void;
    const read = new Promise<Record<string, LocalChapterProgress>>(
      (resolve) => {
        resolveRead = resolve;
      },
    );
    const store = createHistoryStore(
      ops({ getMangaChapterProgress: async () => read }),
    );
    store.getState().prepareSyncGeneration(3);

    const pending = store
      .getState()
      .getMangaProgress("registry", "source", "manga");
    const remote = progress(20, { progress: 8, chapterTitle: "remote" });
    const second = progress(21, {
      id: "registry:source:manga:chapter-2",
      sourceChapterId: "chapter-2",
    });
    store.getState().replaceSyncSnapshot([remote, second], 3);
    resolveRead({ chapter: progress(10, { chapterTitle: "stale-read" }) });

    expect(await pending).toEqual({ chapter: remote, "chapter-2": second });
    expect([...store.getState().entries.values()]).toEqual([remote, second]);
  });

  test("caches the canonical row returned by storage instead of caller input", async () => {
    const canonical = progress(30, { progress: 9, completed: true });
    const store = createHistoryStore(
      ops({ saveChapterProgress: async () => canonical }),
    );
    store.getState().prepareSyncGeneration(4);

    await store
      .getState()
      .saveProgress("registry", "source", "manga", "chapter", 2, 10);

    expect(store.getState().entries.get(canonical.id)).toEqual(canonical);
  });

  test("does not let a late save regress a newer same-generation snapshot", async () => {
    let resolveSave!: (entry: LocalChapterProgress) => void;
    const saved = new Promise<LocalChapterProgress>((resolve) => {
      resolveSave = resolve;
    });
    const store = createHistoryStore(
      ops({ saveChapterProgress: async () => saved }),
    );
    store.getState().prepareSyncGeneration(5);

    const write = store
      .getState()
      .saveProgress("registry", "source", "manga", "chapter", 6, 10);
    const remote = progress(Date.now() + 100, {
      progress: 8,
      chapterTitle: "remote",
    });
    store.getState().replaceSyncSnapshot([remote], 5);
    resolveSave(progress(remote.updatedAt - 1, { progress: 6 }));
    await write;

    expect(store.getState().entries.get(remote.id)).toEqual(remote);
  });

  test("ignores a save that finishes after a generation reset", async () => {
    let resolveSave!: (entry: LocalChapterProgress) => void;
    const saved = new Promise<LocalChapterProgress>((resolve) => {
      resolveSave = resolve;
    });
    const store = createHistoryStore(
      ops({ saveChapterProgress: async () => saved }),
    );
    store.getState().prepareSyncGeneration(6);
    const write = store
      .getState()
      .saveProgress("registry", "source", "manga", "chapter", 6, 10);

    store.getState().prepareSyncGeneration(7);
    resolveSave(progress(100));
    await write;

    expect(store.getState().entries.size).toBe(0);
    expect(store.getState().syncGeneration).toBe(7);
  });
});
