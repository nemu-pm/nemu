/**
 * Mobile dual-reader runtime store.
 *
 * Mirrors the web `useDualReadStore` (`src/lib/plugins/builtin/dual-reader/store.ts`)
 * shape, actions, session-key format, and persisted config schema, so behavior
 * stays in lock step across platforms. Differences:
 *
 * - Web uses a zustand singleton; mobile has no zustand app-wide, so this is a
 *   tiny external store (subscribe/getState/setState) consumed via
 *   `useSyncExternalStore` — same ergonomics, usable from components and from
 *   non-component code (e.g. the align-thread callbacks).
 * - Web persists config to localStorage synchronously; mobile persists to a
 *   JSON file under `Paths.cache` asynchronously (`mobileDualReaderPersistence`).
 * - Web stores secondary images as blob object URLs and calls
 *   `URL.revokeObjectURL` on clear; mobile stores Skia image handles (filled in
 *   by the Skia adapter / overlay work) and disposes them on clear.
 *
 * Types are swapped to mobile's: `LocalSourceLink` / `ChapterSummary` /
 * `MobileReaderPage` from `@/data/schema` and `@/sources/mobileSourcePages`.
 */
import { useSyncExternalStore } from "react";
import type { ChapterSummary, LocalSourceLink } from "@/data/schema";
import type { MobileReaderPage } from "@/sources/mobileSourcePages";
import type {
  ChapterPairSeed,
  SecondaryAlignment,
  SecondaryRenderPlan,
} from "@nemu/core/dual-reader";
import {
  DUAL_READER_CONFIG_DIR,
  readJsonCache,
  writeJsonCache,
} from "./mobileDualReaderPersistence";
import {
  getActiveMobileSourceProfileScope,
  registerMobileSourceProfileTransitionHandler,
} from "@/sources/mobileSourceProfileScope";
import {
  MOBILE_DUAL_READER_IMAGE_CACHE_MAX_BYTES,
  MOBILE_DUAL_READER_IMAGE_CACHE_MAX_PIXELS,
  MOBILE_DUAL_READER_MAX_IMAGE_DIMENSION,
  MOBILE_DUAL_READER_MAX_SURFACE_BYTES,
  MOBILE_DUAL_READER_MAX_SURFACE_PIXELS,
  MOBILE_DUAL_READER_RGBA_BYTES_PER_PIXEL,
} from "./mobileDualReaderImageSafety";

export {
  MOBILE_DUAL_READER_IMAGE_CACHE_MAX_BYTES,
  MOBILE_DUAL_READER_IMAGE_CACHE_MAX_PIXELS,
} from "./mobileDualReaderImageSafety";

export type DualReadSide = "primary" | "secondary";

export type DualReadFabPosition = {
  x: number;
  y: number;
  side: "left" | "right";
};

/**
 * Opaque secondary-image handle. On web this is a blob object URL string; on
 * mobile it is a Skia `SkImage` (or a realized composite). Stored as an opaque
 * type so the pure store logic doesn't depend on Skia; the overlay/adapter
 * layer owns the concrete shape and disposes via `dispose()`.
 *
 * `image` holds the realized drawable (a Skia `SkImage` on device) for the
 * overlay to render; the store treats it as `unknown` and never inspects it.
 */
export type DualReadSecondaryImageHandle = {
  image?: unknown;
  width: number;
  height: number;
  pixelCount: number;
  byteSize: number;
  dispose?: () => void;
};

type DualReadData = {
  runtimeGeneration: number;
  runtimeSuspended: boolean;
  sessionKey: string | null;
  enabled: boolean;
  activeSide: DualReadSide;
  peekActive: boolean;
  popoverOpen: boolean;
  configOpen: boolean;

  secondarySource: LocalSourceLink | null;
  seedPair: ChapterPairSeed | null;
  driftDeltaByChapter: Record<string, number>;

  primaryChapters: ChapterSummary[];
  secondaryChapters: ChapterSummary[];

  secondaryPagesByChapter: Record<string, MobileReaderPage[]>;
  secondaryImageUrls: Map<string, DualReadSecondaryImageHandle>;
  loadingSecondaryKeys: Set<string>;
  secondaryRenderPlansByChapter: Record<string, Record<number, SecondaryRenderPlan>>;
  secondaryAlignmentByChapter: Record<
    string,
    { secondaryChapterId: string; byPage: Record<number, SecondaryAlignment> }
  >;

  fabPosition: DualReadFabPosition | null;
};

type DualReadActions = {
  startSession: (sessionKey: string) => void;
  cleanupRuntime: () => void;
  setRuntimeSuspended: (suspended: boolean) => void;

  setSessionKey: (sessionKey: string) => void;
  resetSession: () => void;

  enable: (input: {
    secondarySource: LocalSourceLink;
    seedPair: ChapterPairSeed;
    primaryChapters: ChapterSummary[];
    secondaryChapters: ChapterSummary[];
  }) => void;
  disable: () => void;

  setActiveSide: (side: DualReadSide) => void;
  setPeekActive: (peek: boolean) => void;
  setPopoverOpen: (open: boolean) => void;
  setConfigOpen: (open: boolean) => void;

  setSeedPair: (seedPair: ChapterPairSeed) => void;
  setDriftDelta: (chapterId: string, delta: number) => void;

  setPrimaryChapters: (chapters: ChapterSummary[]) => void;
  setSecondaryChapters: (chapters: ChapterSummary[]) => void;
  setSecondaryPages: (chapterId: string, pages: MobileReaderPage[]) => void;
  setSecondaryImageUrl: (
    key: string,
    handle: DualReadSecondaryImageHandle,
    generation?: number,
  ) => boolean;
  clearSecondaryCache: () => void;
  setSecondaryRenderPlan: (
    chapterId: string,
    primaryIndex: number,
    plan: SecondaryRenderPlan,
  ) => void;
  clearSecondaryRenderPlans: (chapterId?: string) => void;
  setSecondaryAlignment: (
    chapterId: string,
    secondaryChapterId: string,
    primaryIndex: number,
    alignment: SecondaryAlignment,
  ) => void;
  clearSecondaryAlignment: (chapterId?: string) => void;

  setFabPosition: (pos: DualReadFabPosition | null) => void;
};

export type DualReadState = DualReadData & DualReadActions;

export type DualReadPersistedConfig = {
  enabled: boolean;
  secondarySource: LocalSourceLink | null;
  seedPair: ChapterPairSeed | null;
  activeSide: DualReadSide;
  fabPosition: DualReadFabPosition | null;
};

function makeConfigKey(
  sessionKey: string,
  executionScope = getActiveMobileSourceProfileScope(),
): string {
  return `config:${executionScope}:${sessionKey}`;
}

function isValidSourceLink(value: unknown): value is LocalSourceLink {
  if (!value || typeof value !== "object") return false;
  const link = value as Record<string, unknown>;
  return (
    typeof link.registryId === "string" &&
    typeof link.sourceId === "string" &&
    typeof link.sourceMangaId === "string" &&
    typeof link.id === "string"
  );
}

function isValidSeedPair(value: unknown): value is ChapterPairSeed {
  if (!value || typeof value !== "object") return false;
  const pair = value as Record<string, unknown>;
  return typeof pair.primaryId === "string" && typeof pair.secondaryId === "string";
}

function isValidFabPosition(value: unknown): value is DualReadFabPosition {
  if (!value || typeof value !== "object") return false;
  const pos = value as Record<string, unknown>;
  return (
    typeof pos.x === "number" &&
    typeof pos.y === "number" &&
    (pos.side === "left" || pos.side === "right")
  );
}

/** Public so tests can exercise the validators without a filesystem. */
export function parseDualReadPersistedConfig(
  raw: unknown,
): DualReadPersistedConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const enabled = typeof record.enabled === "boolean" ? record.enabled : false;
  const secondarySource = isValidSourceLink(record.secondarySource)
    ? record.secondarySource
    : null;
  const seedPair = isValidSeedPair(record.seedPair) ? record.seedPair : null;
  const activeSide = record.activeSide === "secondary" ? "secondary" : "primary";
  const fabPosition = isValidFabPosition(record.fabPosition)
    ? record.fabPosition
    : null;
  return { enabled, secondarySource, seedPair, activeSide, fabPosition };
}

async function loadPersistedConfig(
  sessionKey: string,
  executionScope: string,
): Promise<DualReadPersistedConfig | null> {
  const raw = await readJsonCache<unknown>(
    DUAL_READER_CONFIG_DIR,
    makeConfigKey(sessionKey, executionScope),
  );
  return parseDualReadPersistedConfig(raw);
}

function ignoreBestEffortConfigError(error: unknown): void {
  void error;
  // Config persistence is best-effort; keep the in-memory state on cache I/O errors.
}

function persistConfig(data: DualReadData): void {
  if (!data.sessionKey) return;
  const payload: DualReadPersistedConfig = {
    enabled: data.enabled,
    secondarySource: data.secondarySource,
    seedPair: data.seedPair,
    activeSide: data.activeSide,
    fabPosition: data.fabPosition,
  };
  // Fire-and-forget: config persistence is best-effort and must not block the
  // synchronous state update (web's localStorage write is sync; mobile's file
  // write is async).
  void writeJsonCache(
    DUAL_READER_CONFIG_DIR,
    makeConfigKey(data.sessionKey),
    payload,
  ).catch(ignoreBestEffortConfigError);
}

type MobileDualReaderImageDisposalScheduler = (dispose: () => void) => void;

const defaultMobileDualReaderImageDisposalScheduler: MobileDualReaderImageDisposalScheduler =
  (dispose) => {
    // The old image may still be mounted by a Skia Canvas until React commits
    // the external-store update. Keep it valid for two frames before releasing
    // the native object; the decode scheduler ensures this grace period remains
    // bounded to at most one newly-realized image pipeline at a time.
    setTimeout(dispose, 32);
  };

let mobileDualReaderImageDisposalScheduler =
  defaultMobileDualReaderImageDisposalScheduler;

export function setMobileDualReaderImageDisposalSchedulerForTests(
  scheduler: MobileDualReaderImageDisposalScheduler | null,
): void {
  mobileDualReaderImageDisposalScheduler =
    scheduler ?? defaultMobileDualReaderImageDisposalScheduler;
}

function disposeSecondaryImage(handle?: DualReadSecondaryImageHandle): void {
  if (!handle?.dispose) return;
  mobileDualReaderImageDisposalScheduler(() => {
    try {
      handle.dispose?.();
    } catch {
      // ignore disposal errors
    }
  });
}

function disposeSecondaryImages(
  map: Map<string, DualReadSecondaryImageHandle>,
): void {
  map.forEach(disposeSecondaryImage);
}

export const MOBILE_DUAL_READER_IMAGE_CACHE_SIZE = 12;

function isValidSecondaryImageHandle(
  handle: DualReadSecondaryImageHandle,
): boolean {
  return (
    Number.isSafeInteger(handle.width) &&
    Number.isSafeInteger(handle.height) &&
    Number.isSafeInteger(handle.pixelCount) &&
    Number.isSafeInteger(handle.byteSize) &&
    handle.width > 0 &&
    handle.height > 0 &&
    handle.width <= MOBILE_DUAL_READER_MAX_IMAGE_DIMENSION &&
    handle.height <= MOBILE_DUAL_READER_MAX_IMAGE_DIMENSION &&
    handle.pixelCount === handle.width * handle.height &&
    handle.byteSize ===
      handle.pixelCount * MOBILE_DUAL_READER_RGBA_BYTES_PER_PIXEL &&
    handle.pixelCount <= MOBILE_DUAL_READER_MAX_SURFACE_PIXELS &&
    handle.byteSize <= MOBILE_DUAL_READER_MAX_SURFACE_BYTES
  );
}

export function getMobileDualReaderImageCacheCost(
  images: Map<string, DualReadSecondaryImageHandle>,
): { pixelCount: number; byteSize: number } {
  let pixelCount = 0;
  let byteSize = 0;
  images.forEach((handle) => {
    pixelCount += handle.pixelCount;
    byteSize += handle.byteSize;
  });
  return { pixelCount, byteSize };
}

function getInitialData(): DualReadData {
  return {
    runtimeGeneration: 0,
    runtimeSuspended: false,
    sessionKey: null,
    enabled: false,
    activeSide: "primary",
    peekActive: false,
    popoverOpen: false,
    configOpen: false,
    secondarySource: null,
    seedPair: null,
    driftDeltaByChapter: {},
    primaryChapters: [],
    secondaryChapters: [],
    secondaryPagesByChapter: {},
    secondaryImageUrls: new Map(),
    loadingSecondaryKeys: new Set(),
    secondaryRenderPlansByChapter: {},
    secondaryAlignmentByChapter: {},
    fabPosition: null,
  };
}

type Listener = () => void;

function createDualReadStore() {
  let data: DualReadData = getInitialData();
  const listeners = new Set<Listener>();

  // Cached snapshot returned to React. Recomputed only when `data` changes so
  // `useSyncExternalStore` sees a referentially-stable snapshot between updates
  // (returning a fresh object each call would trigger an infinite re-render).
  // Assigned after `actions` is defined below.
  let snapshot: DualReadState;

  const set: (
    partial: Partial<DualReadData> | ((s: DualReadData) => Partial<DualReadData>),
  ) => void = (partial) => {
    const next = typeof partial === "function" ? partial(data) : partial;
    data = { ...data, ...next };
    snapshot = { ...data, ...actions } as DualReadState;
    listeners.forEach((l) => l());
  };
  const getState = (): DualReadState => snapshot;
  const getData = (): DualReadData => data;

  const actions: DualReadActions = {
    startSession: (sessionKey) => {
      if (getData().sessionKey === sessionKey) {
        // StrictMode / re-mounts: don't wipe state.
        return;
      }
      // New manga/session: clear heavy runtime caches and reset pairing state.
      disposeSecondaryImages(getData().secondaryImageUrls);
      const runtimeGeneration = getData().runtimeGeneration + 1;
      const runtimeSuspended = getData().runtimeSuspended;
      set({
        ...getInitialData(),
        runtimeGeneration,
        runtimeSuspended,
        sessionKey,
      });
      // Apply persisted config asynchronously (mobile file read is async; web
      // does this synchronously from localStorage). Guard against the session
      // changing again before the read resolves.
      const executionScope = getActiveMobileSourceProfileScope();
      void loadPersistedConfig(sessionKey, executionScope)
        .then((persisted) => {
          if (
            getData().sessionKey !== sessionKey ||
            getActiveMobileSourceProfileScope() !== executionScope
          ) return;
          const hasPersistedConfig = Boolean(
            persisted?.secondarySource && persisted?.seedPair,
          );
          set({
            ...(persisted ?? {}),
            enabled: persisted?.enabled && hasPersistedConfig ? true : false,
          });
        })
        .catch(ignoreBestEffortConfigError);
    },

    cleanupRuntime: () => {
      disposeSecondaryImages(getData().secondaryImageUrls);
      set((s) => ({
        runtimeGeneration: s.runtimeGeneration + 1,
        // Keep config + sessionKey, but close transient UI and clear caches.
        peekActive: false,
        popoverOpen: false,
        configOpen: false,
        primaryChapters: [],
        secondaryChapters: [],
        driftDeltaByChapter: {},
        secondaryPagesByChapter: {},
        secondaryImageUrls: new Map(),
        loadingSecondaryKeys: new Set(),
        secondaryRenderPlansByChapter: {},
        secondaryAlignmentByChapter: {},
      }));
    },

    setRuntimeSuspended: (runtimeSuspended) => {
      if (getData().runtimeSuspended === runtimeSuspended) return;
      set({ runtimeSuspended });
    },

    setSessionKey: (sessionKey) => set({ sessionKey }),

    resetSession: () => {
      disposeSecondaryImages(getData().secondaryImageUrls);
      const runtimeGeneration = getData().runtimeGeneration + 1;
      set({ ...getInitialData(), runtimeGeneration });
    },

    enable: ({ secondarySource, seedPair, primaryChapters, secondaryChapters }) => {
      disposeSecondaryImages(getData().secondaryImageUrls);
      set((s) => ({
        runtimeGeneration: s.runtimeGeneration + 1,
        enabled: true,
        activeSide: s.activeSide ?? "primary",
        secondarySource,
        seedPair,
        primaryChapters,
        secondaryChapters,
        driftDeltaByChapter: {},
        secondaryPagesByChapter: {},
        secondaryImageUrls: new Map(),
        loadingSecondaryKeys: new Set(),
        secondaryRenderPlansByChapter: {},
        secondaryAlignmentByChapter: {},
      }));
      persistConfig(getData());
    },

    disable: () => {
      disposeSecondaryImages(getData().secondaryImageUrls);
      set((s) => ({
        runtimeGeneration: s.runtimeGeneration + 1,
        enabled: false,
        peekActive: false,
        popoverOpen: false,
        configOpen: false,
        primaryChapters: [],
        secondaryChapters: [],
        driftDeltaByChapter: {},
        secondaryPagesByChapter: {},
        secondaryImageUrls: new Map(),
        loadingSecondaryKeys: new Set(),
        secondaryRenderPlansByChapter: {},
        secondaryAlignmentByChapter: {},
      }));
      persistConfig(getData());
    },

    setActiveSide: (side) => {
      set({ activeSide: side });
      persistConfig(getData());
    },
    setPeekActive: (peek) => set({ peekActive: peek }),
    setPopoverOpen: (open) => set({ popoverOpen: open }),
    setConfigOpen: (open) => set({ configOpen: open }),

    setSeedPair: (seedPair) => {
      set((s) => ({
        runtimeGeneration: s.runtimeGeneration + 1,
        seedPair,
        secondaryRenderPlansByChapter: {},
        secondaryAlignmentByChapter: {},
        driftDeltaByChapter: {},
      }));
      persistConfig(getData());
    },
    setDriftDelta: (chapterId, delta) =>
      set((s) => ({
        driftDeltaByChapter: { ...s.driftDeltaByChapter, [chapterId]: delta },
      })),

    setPrimaryChapters: (chapters) => set({ primaryChapters: chapters }),
    setSecondaryChapters: (chapters) => set({ secondaryChapters: chapters }),
    setSecondaryPages: (chapterId, pages) =>
      set((s) => ({
        secondaryPagesByChapter: { ...s.secondaryPagesByChapter, [chapterId]: pages },
      })),

    setSecondaryImageUrl: (key, handle, generation) => {
      if (
        generation !== undefined &&
        generation !== getData().runtimeGeneration
      ) {
        return false;
      }
      if (!isValidSecondaryImageHandle(handle)) return false;
      set((s) => {
        const next = new Map(s.secondaryImageUrls);
        const existing = next.get(key);
        if (existing !== handle) disposeSecondaryImage(existing);
        next.delete(key);
        next.set(key, handle);
        let cacheCost = getMobileDualReaderImageCacheCost(next);
        while (
          next.size > MOBILE_DUAL_READER_IMAGE_CACHE_SIZE ||
          cacheCost.pixelCount > MOBILE_DUAL_READER_IMAGE_CACHE_MAX_PIXELS ||
          cacheCost.byteSize > MOBILE_DUAL_READER_IMAGE_CACHE_MAX_BYTES
        ) {
          const oldestKey = next.keys().next().value;
          if (oldestKey === undefined) break;
          const oldest = next.get(oldestKey);
          next.delete(oldestKey);
          disposeSecondaryImage(oldest);
          cacheCost = getMobileDualReaderImageCacheCost(next);
        }
        return { secondaryImageUrls: next };
      });
      return true;
    },

    clearSecondaryCache: () => {
      disposeSecondaryImages(getData().secondaryImageUrls);
      set((s) => ({
        runtimeGeneration: s.runtimeGeneration + 1,
        secondaryPagesByChapter: {},
        secondaryImageUrls: new Map(),
        loadingSecondaryKeys: new Set(),
        secondaryRenderPlansByChapter: {},
        secondaryAlignmentByChapter: {},
      }));
    },

    setSecondaryRenderPlan: (chapterId, primaryIndex, plan) =>
      set((s) => ({
        secondaryRenderPlansByChapter: {
          ...s.secondaryRenderPlansByChapter,
          [chapterId]: {
            ...(s.secondaryRenderPlansByChapter[chapterId] ?? {}),
            [primaryIndex]: plan,
          },
        },
      })),

    clearSecondaryRenderPlans: (chapterId) =>
      set((s) => {
        if (!chapterId) {
          return { secondaryRenderPlansByChapter: {} };
        }
        const next = { ...s.secondaryRenderPlansByChapter };
        if (next[chapterId]) {
          next[chapterId] = {};
        }
        return { secondaryRenderPlansByChapter: next };
      }),

    setSecondaryAlignment: (chapterId, secondaryChapterId, primaryIndex, alignment) =>
      set((s) => {
        const existing = s.secondaryAlignmentByChapter[chapterId];
        const byPage =
          existing && existing.secondaryChapterId === secondaryChapterId
            ? { ...existing.byPage }
            : {};
        byPage[primaryIndex] = alignment;
        return {
          secondaryAlignmentByChapter: {
            ...s.secondaryAlignmentByChapter,
            [chapterId]: { secondaryChapterId, byPage },
          },
        };
      }),

    clearSecondaryAlignment: (chapterId) =>
      set((s) => {
        if (!chapterId) {
          return { secondaryAlignmentByChapter: {} };
        }
        const next = { ...s.secondaryAlignmentByChapter };
        if (next[chapterId]) {
          delete next[chapterId];
        }
        return { secondaryAlignmentByChapter: next };
      }),

    setFabPosition: (pos) => {
      set({ fabPosition: pos });
      persistConfig(getData());
    },
  };

  // Initialize the snapshot now that `actions` exists.
  snapshot = { ...data, ...actions } as DualReadState;

  return {
    getState,
    setState: set,
    subscribe(listener: Listener): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

const mobileDualReadStore = createDualReadStore();

registerMobileSourceProfileTransitionHandler(
  "dual-reader-runtime-store",
  () => mobileDualReadStore.getState().resetSession(),
);

export type MobileDualReadStore = ReturnType<typeof createDualReadStore>;

export function getMobileDualReadStore(): MobileDualReadStore {
  return mobileDualReadStore;
}

/**
 * Subscribe to the dual-reader store with a selector (zustand-style). Select
 * primitives or stable references (e.g. `s => s.enabled`, `s => s.secondarySource`,
 * `s => s.secondaryImageUrls`) — object slices created inline will re-render on
 * every change. `getMobileDualReadStore()` is available for non-component code.
 */
export function useMobileDualReaderStore<U>(
  selector: (state: DualReadState) => U,
): U {
  return useSyncExternalStore(
    mobileDualReadStore.subscribe,
    () => selector(mobileDualReadStore.getState()),
    () => selector(mobileDualReadStore.getState()),
  );
}
