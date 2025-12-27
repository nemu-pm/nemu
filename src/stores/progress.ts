import { create, type StoreApi, type UseBoundStore } from "zustand";
import type { LocalMangaProgress } from "@/data/schema";
import { makeMangaProgressId } from "@/data/schema";

// ============================================================================
// Progress Store - holds manga progress for reactive UI
// ============================================================================

interface ProgressState {
  index: Map<string, LocalMangaProgress>;
  loading: boolean;

  /** Load all manga progress from IDB */
  load: () => Promise<void>;
  
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

  return create<ProgressState>((set, get) => ({
    index: new Map(),
    loading: true,

    load: async () => {
      const seq = ++loadSeq;
      try {
        const entries = await ops.getAllMangaProgress();
        if (seq !== loadSeq) return;
        const map = new Map<string, LocalMangaProgress>();
        for (const entry of entries) {
          map.set(entry.id, entry);
        }
        set({ index: map, loading: false });
      } catch (e) {
        if (seq !== loadSeq) return;
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
      set({ index: new Map(), loading: true });
    },
  }));
}

