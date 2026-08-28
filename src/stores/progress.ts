import { create, type StoreApi, type UseBoundStore } from "zustand";
import type { LocalMangaProgress } from "@/data/schema";
import { makeMangaProgressId } from "@/data/schema";
import { StoreGenerationGate } from "./sync-generation-gate";

// ============================================================================
// Progress Store - holds manga progress for reactive UI
// ============================================================================

interface ProgressState {
  index: Map<string, LocalMangaProgress>;
  loading: boolean;
  syncGeneration: number | null;

  /** Load all manga progress from IDB */
  load: () => Promise<void>;
  prepareSyncGeneration: (
    generation: number,
    readiness?: Promise<unknown>,
  ) => void;
  replaceSyncSnapshot: (
    progress: LocalMangaProgress[],
    generation: number,
  ) => void;
  
  /** Get progress by id */
  get: (id: string) => LocalMangaProgress | undefined;
  
  /** Get progress by source link params */
  getBySource: (registryId: string, sourceId: string, sourceMangaId: string) => LocalMangaProgress | undefined;
  
  /** Clear state (on logout) */
  clear: () => void;
}

export type ProgressStore = UseBoundStore<StoreApi<ProgressState>>;

// ============================================================================
// Store Factory
// ============================================================================

export interface ProgressStoreOps {
  getAllMangaProgress: () => Promise<LocalMangaProgress[]>;
}

export function createProgressStore(ops: ProgressStoreOps): ProgressStore {
  // Latest-load-wins guard. Prevents stale loads (e.g. during profile switches)
  // from overwriting the current state or reporting spurious errors.
  let loadSeq = 0;
  const generationGate = new StoreGenerationGate();

  return create<ProgressState>((set, get) => ({
    index: new Map(),
    loading: true,
    syncGeneration: null,

    prepareSyncGeneration: (generation, readiness) => {
      if (!generationGate.prepare(generation, readiness)) return;
      loadSeq += 1;
      set({ index: new Map(), loading: true, syncGeneration: generation });
    },

    replaceSyncSnapshot: (progress, generation) => {
      if (generationGate.currentGeneration !== generation) return;
      set({
        index: new Map(progress.map((entry) => [entry.id, entry])),
        loading: false,
        syncGeneration: generation,
      });
    },

    load: async () => {
      const seq = ++loadSeq;
      const token = generationGate.capture();
      try {
        if (!(await generationGate.wait(token))) return;
        const entries = await ops.getAllMangaProgress();
        if (seq !== loadSeq || !generationGate.isCurrent(token)) return;
        const map = new Map<string, LocalMangaProgress>();
        for (const entry of entries) {
          map.set(entry.id, entry);
        }
        set({ index: map, loading: false });
      } catch (e) {
        if (seq !== loadSeq || !generationGate.isCurrent(token)) return;
        console.error("[ProgressStore] Load error:", e);
        set({ loading: false });
      }
    },

    get: (id) => get().index.get(id),

    getBySource: (registryId, sourceId, sourceMangaId) => {
      const id = makeMangaProgressId(registryId, sourceId, sourceMangaId);
      return get().index.get(id);
    },

    clear: () => {
      loadSeq += 1;
      set({ index: new Map(), loading: true });
    },
  }));
}
