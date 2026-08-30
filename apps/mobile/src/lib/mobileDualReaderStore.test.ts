import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  getMobileDualReaderImageCacheCost,
  getMobileDualReadStore,
  MOBILE_DUAL_READER_IMAGE_CACHE_MAX_BYTES,
  MOBILE_DUAL_READER_IMAGE_CACHE_MAX_PIXELS,
  MOBILE_DUAL_READER_IMAGE_CACHE_SIZE,
  parseDualReadPersistedConfig,
  setMobileDualReaderImageDisposalSchedulerForTests,
  type DualReadFabPosition,
  type DualReadPersistedConfig,
  type DualReadSecondaryImageHandle,
} from "./mobileDualReaderStore";
import {
  DUAL_READER_CONFIG_DIR,
  readJsonCache,
  setMobileDualReaderFileCacheBackend,
  writeJsonCache,
  type DualReaderFileCacheBackend,
} from "./mobileDualReaderPersistence";
import type { LocalSourceLink, ChapterSummary } from "@/data/schema";

function makeLink(overrides: Partial<LocalSourceLink> = {}): LocalSourceLink {
  return {
    id: "link-1",
    libraryItemId: "lib-1",
    registryId: "reg-1",
    sourceId: "src-1",
    sourceMangaId: "manga-1",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function makeChapter(overrides: Partial<ChapterSummary> = {}): ChapterSummary {
  return {
    id: "ch-1",
    title: "Chapter 1",
    chapterNumber: 1,
    ...overrides,
  };
}

function makeImageHandle(
  width = 1,
  height = 1,
  dispose?: () => void,
): DualReadSecondaryImageHandle {
  const pixelCount = width * height;
  return {
    width,
    height,
    pixelCount,
    byteSize: pixelCount * 4,
    dispose,
  };
}

function createFakeBackend(): DualReaderFileCacheBackend & {
  store: Map<string, string>;
} {
  const store = new Map<string, string>();
  const keyOf = (dir: string, fileName: string) => `${dir}/${fileName}`;
  return {
    store,
    async readText(dir, fileName) {
      return store.get(keyOf(dir, fileName)) ?? null;
    },
    async writeText(dir, fileName, text) {
      store.set(keyOf(dir, fileName), text);
    },
    async remove(dir, fileName) {
      store.delete(keyOf(dir, fileName));
    },
  };
}

describe("mobileDualReaderStore", () => {
  let backend: ReturnType<typeof createFakeBackend>;
  beforeEach(() => {
    backend = createFakeBackend();
    setMobileDualReaderFileCacheBackend(backend);
    setMobileDualReaderImageDisposalSchedulerForTests((dispose) => dispose());
    getMobileDualReadStore().getState().resetSession();
  });
  afterEach(() => {
    setMobileDualReaderFileCacheBackend(null);
    setMobileDualReaderImageDisposalSchedulerForTests(null);
  });

  test("snapshot is referentially stable until a state change", () => {
    const store = getMobileDualReadStore();
    const a = store.getState();
    const b = store.getState();
    expect(a).toBe(b);
    store.getState().setPeekActive(true);
    const c = store.getState();
    expect(c).not.toBe(a);
    expect(c.peekActive).toBe(true);
  });

  test("startSession resets runtime state and is idempotent on same key", () => {
    const store = getMobileDualReadStore();
    store.getState().startSession("reg:src:manga");
    expect(store.getState().sessionKey).toBe("reg:src:manga");
    store.getState().setPeekActive(true);
    store.getState().setSecondaryRenderPlan("ch-1", 0, {
      kind: "missing",
      secondaryChapterId: "ch-2",
      driftDelta: 0,
    });
    // Same key: no wipe (StrictMode guard).
    store.getState().startSession("reg:src:manga");
    expect(store.getState().peekActive).toBe(true);
    expect(store.getState().secondaryRenderPlansByChapter["ch-1"][0]).toBeDefined();
  });

  test("keeps AppState suspension fail-closed across a session reset", () => {
    const store = getMobileDualReadStore();
    store.getState().setRuntimeSuspended(true);
    store.getState().startSession("reg:src:background-session");
    expect(store.getState().runtimeSuspended).toBe(true);
    store.getState().setRuntimeSuspended(false);
    expect(store.getState().runtimeSuspended).toBe(false);
  });

  test("startSession loads persisted config and enables only with source + seed", async () => {
    const link = makeLink();
    const persisted: DualReadPersistedConfig = {
      enabled: true,
      secondarySource: link,
      seedPair: { primaryId: "ch-1", secondaryId: "ch-sec" },
      activeSide: "secondary",
      fabPosition: { x: 10, y: 20, side: "left" },
    };
    await writeJsonCache(DUAL_READER_CONFIG_DIR, "config:local:reg:src:manga", persisted);
    const store = getMobileDualReadStore();
    store.getState().startSession("reg:src:manga");
    // Sync portion is reset; persisted config lands async.
    expect(store.getState().enabled).toBe(false);
    await new Promise((r) => setTimeout(r, 0));
    expect(store.getState().enabled).toBe(true);
    expect(store.getState().secondarySource).toEqual(link);
    expect(store.getState().activeSide).toBe("secondary");
    expect(store.getState().fabPosition).toEqual(persisted.fabPosition);
  });

  test("persisted config without source+seed does not enable", async () => {
    await writeJsonCache(DUAL_READER_CONFIG_DIR, "config:local:reg:src:manga", {
      enabled: true,
      secondarySource: null,
      seedPair: null,
    });
    const store = getMobileDualReadStore();
    store.getState().startSession("reg:src:manga");
    await new Promise((r) => setTimeout(r, 0));
    expect(store.getState().enabled).toBe(false);
  });

  test("startSession ignores persisted config read failures", async () => {
    backend.readText = async () => {
      throw new Error("read failed");
    };
    const store = getMobileDualReadStore();
    store.getState().startSession("reg:src:manga");
    await new Promise((r) => setTimeout(r, 0));
    expect(store.getState().sessionKey).toBe("reg:src:manga");
    expect(store.getState().enabled).toBe(false);
    expect(store.getState().secondarySource).toBeNull();
  });

  test("enable writes persisted config; disable clears runtime and persists", async () => {
    const store = getMobileDualReadStore();
    store.getState().startSession("reg:src:manga");
    await new Promise((r) => setTimeout(r, 0));
    const link = makeLink();
    store.getState().enable({
      secondarySource: link,
      seedPair: { primaryId: "ch-1", secondaryId: "ch-sec" },
      primaryChapters: [makeChapter()],
      secondaryChapters: [makeChapter({ id: "ch-sec" })],
    });
    await new Promise((r) => setTimeout(r, 0));
    const persisted = await readJsonCache<DualReadPersistedConfig>(
      DUAL_READER_CONFIG_DIR,
      "config:local:reg:src:manga",
    );
    expect(persisted).not.toBeNull();
    expect(persisted!.enabled).toBe(true);
    expect(persisted!.seedPair).toEqual({ primaryId: "ch-1", secondaryId: "ch-sec" });

    store.getState().disable();
    await new Promise((r) => setTimeout(r, 0));
    const persistedAfter = await readJsonCache<DualReadPersistedConfig>(
      DUAL_READER_CONFIG_DIR,
      "config:local:reg:src:manga",
    );
    expect(persistedAfter!.enabled).toBe(false);
    expect(store.getState().enabled).toBe(false);
    expect(store.getState().secondaryRenderPlansByChapter).toEqual({});
  });

  test("persisted config write failures do not roll back in-memory state", async () => {
    backend.writeText = async () => {
      throw new Error("write failed");
    };
    const store = getMobileDualReadStore();
    store.getState().startSession("reg:src:manga");
    await new Promise((r) => setTimeout(r, 0));
    const link = makeLink();
    store.getState().enable({
      secondarySource: link,
      seedPair: { primaryId: "ch-1", secondaryId: "ch-sec" },
      primaryChapters: [makeChapter()],
      secondaryChapters: [makeChapter({ id: "ch-sec" })],
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(store.getState().enabled).toBe(true);
    expect(store.getState().secondarySource).toEqual(link);
    expect(store.getState().seedPair).toEqual({
      primaryId: "ch-1",
      secondaryId: "ch-sec",
    });
  });

  test("cleanupRuntime keeps sessionKey + config but clears caches", () => {
    const store = getMobileDualReadStore();
    store.getState().startSession("reg:src:manga");
    store.getState().setSecondaryRenderPlan("ch-1", 0, {
      kind: "missing",
      secondaryChapterId: "ch-2",
      driftDelta: 0,
    });
    store.getState().setPeekActive(true);
    store.getState().cleanupRuntime();
    expect(store.getState().sessionKey).toBe("reg:src:manga");
    expect(store.getState().peekActive).toBe(false);
    expect(store.getState().secondaryRenderPlansByChapter).toEqual({});
  });

  test("setSecondaryImageUrl disposes overwritten handle", () => {
    const store = getMobileDualReadStore();
    let disposed = 0;
    const handle1 = makeImageHandle(1, 1, () => {
      disposed += 1;
    });
    const handle2 = makeImageHandle(1, 1, () => {
      disposed += 100;
    });
    store.getState().setSecondaryImageUrl("k", handle1);
    store.getState().setSecondaryImageUrl("k", handle2);
    expect(disposed).toBe(1);
    store.getState().clearSecondaryCache();
    expect(disposed).toBe(101);
  });

  test("defers native image disposal until React can unmount the old Canvas", () => {
    const store = getMobileDualReadStore();
    const scheduled: Array<() => void> = [];
    setMobileDualReaderImageDisposalSchedulerForTests((dispose) => {
      scheduled.push(dispose);
    });
    let disposed = 0;
    store.getState().setSecondaryImageUrl(
      "k",
      makeImageHandle(1, 1, () => {
        disposed += 1;
      }),
    );
    store.getState().setSecondaryImageUrl("k", makeImageHandle());
    expect(disposed).toBe(0);
    expect(scheduled).toHaveLength(1);
    scheduled[0]!();
    expect(disposed).toBe(1);
  });

  test("bounds the native image cache and rejects stale generations", () => {
    const store = getMobileDualReadStore();
    store.getState().startSession("reg:src:manga");
    const generation = store.getState().runtimeGeneration;
    let disposed = 0;
    for (let index = 0; index <= MOBILE_DUAL_READER_IMAGE_CACHE_SIZE; index += 1) {
      expect(
        store.getState().setSecondaryImageUrl(
          `image-${index}`,
          makeImageHandle(1, 1, () => {
            disposed += 1;
          }),
          generation,
        ),
      ).toBe(true);
    }
    expect(store.getState().secondaryImageUrls.size).toBe(
      MOBILE_DUAL_READER_IMAGE_CACHE_SIZE,
    );
    expect(store.getState().secondaryImageUrls.has("image-0")).toBe(false);
    expect(disposed).toBe(1);

    store.getState().clearSecondaryCache();
    expect(
      store
        .getState()
        .setSecondaryImageUrl("stale", makeImageHandle(), generation),
    ).toBe(false);
    expect(store.getState().secondaryImageUrls.has("stale")).toBe(false);
  });

  test("accepts the exact native-image budget and evicts at one pixel over", () => {
    const store = getMobileDualReadStore();
    store.getState().startSession("reg:src:manga-budget");
    let disposed = 0;
    const dispose = () => {
      disposed += 1;
    };

    // Three 2048x2048 surfaces are exactly 12 Mi pixels / 48 MiB.
    for (let index = 0; index < 3; index += 1) {
      expect(
        store
          .getState()
          .setSecondaryImageUrl(
            `large-${index}`,
            makeImageHandle(2048, 2048, dispose),
          ),
      ).toBe(true);
    }
    expect(
      getMobileDualReaderImageCacheCost(store.getState().secondaryImageUrls),
    ).toEqual({
      pixelCount: MOBILE_DUAL_READER_IMAGE_CACHE_MAX_PIXELS,
      byteSize: MOBILE_DUAL_READER_IMAGE_CACHE_MAX_BYTES,
    });

    expect(
      store
        .getState()
        .setSecondaryImageUrl("plus-one", makeImageHandle(1, 1, dispose)),
    ).toBe(true);
    expect(store.getState().secondaryImageUrls.has("large-0")).toBe(false);
    expect(disposed).toBe(1);
    const costAfter = getMobileDualReaderImageCacheCost(
      store.getState().secondaryImageUrls,
    );
    expect(costAfter.pixelCount).toBeLessThanOrEqual(
      MOBILE_DUAL_READER_IMAGE_CACHE_MAX_PIXELS,
    );
    expect(costAfter.byteSize).toBeLessThanOrEqual(
      MOBILE_DUAL_READER_IMAGE_CACHE_MAX_BYTES,
    );
  });

  test("rejects forged image cost metadata", () => {
    const store = getMobileDualReadStore();
    expect(
      store.getState().setSecondaryImageUrl("bad", {
        width: 2,
        height: 2,
        pixelCount: 3,
        byteSize: 12,
      }),
    ).toBe(false);
    expect(store.getState().secondaryImageUrls.has("bad")).toBe(false);
  });

  test("setSecondaryAlignment groups by secondary chapter id", () => {
    const store = getMobileDualReadStore();
    store.getState().setSecondaryAlignment("ch-1", "ch-sec", 0, {
      crop: { top: 0, right: 0, bottom: 0, left: 0 },
      scale: 1,
      dx: 0,
      dy: 0,
      confidence: 0.5,
    });
    store.getState().setSecondaryAlignment("ch-1", "ch-sec", 1, {
      crop: { top: 0, right: 0, bottom: 0, left: 0 },
      scale: 1,
      dx: 0.1,
      dy: 0,
      confidence: 0.6,
    });
    const byChapter = store.getState().secondaryAlignmentByChapter["ch-1"];
    expect(byChapter.secondaryChapterId).toBe("ch-sec");
    expect(Object.keys(byChapter.byPage).sort()).toEqual(["0", "1"]);
    // Switching secondary chapter resets the byPage map for that primary chapter.
    store.getState().setSecondaryAlignment("ch-1", "ch-other", 0, {
      crop: { top: 0, right: 0, bottom: 0, left: 0 },
      scale: 1,
      dx: 0,
      dy: 0,
      confidence: 0.4,
    });
    const after = store.getState().secondaryAlignmentByChapter["ch-1"];
    expect(after.secondaryChapterId).toBe("ch-other");
    expect(Object.keys(after.byPage)).toEqual(["0"]);
  });

  test("setSeedPair clears plans/alignment/drift", () => {
    const store = getMobileDualReadStore();
    const generation = store.getState().runtimeGeneration;
    store.getState().setSecondaryRenderPlan("ch-1", 0, {
      kind: "missing",
      secondaryChapterId: "ch-2",
      driftDelta: 0,
    });
    store.getState().setDriftDelta("ch-1", 3);
    store.getState().setSeedPair({ primaryId: "ch-1", secondaryId: "ch-sec" });
    expect(store.getState().secondaryRenderPlansByChapter).toEqual({});
    expect(store.getState().driftDeltaByChapter).toEqual({});
    expect(store.getState().seedPair).toEqual({ primaryId: "ch-1", secondaryId: "ch-sec" });
    expect(store.getState().runtimeGeneration).toBe(generation + 1);
  });

  describe("parseDualReadPersistedConfig", () => {
    test("valid config round-trips", () => {
      const fab: DualReadFabPosition = { x: 1, y: 2, side: "right" };
      const parsed = parseDualReadPersistedConfig({
        enabled: true,
        secondarySource: makeLink(),
        seedPair: { primaryId: "p", secondaryId: "s" },
        activeSide: "secondary",
        fabPosition: fab,
      });
      expect(parsed?.enabled).toBe(true);
      expect(parsed?.activeSide).toBe("secondary");
      expect(parsed?.fabPosition).toEqual(fab);
    });

    test("rejects malformed source link / seed / fab / activeSide", () => {
      expect(parseDualReadPersistedConfig(null)).toBeNull();
      expect(parseDualReadPersistedConfig({ enabled: true })!.secondarySource).toBeNull();
      expect(
        parseDualReadPersistedConfig({ enabled: true, secondarySource: makeLink() })!
          .seedPair,
      ).toBeNull();
      expect(
        parseDualReadPersistedConfig({ fabPosition: { x: 1, y: 2, side: "up" } })!
          .fabPosition,
      ).toBeNull();
      expect(
        parseDualReadPersistedConfig({ activeSide: "weird" })!.activeSide,
      ).toBe("primary");
    });
  });
});
