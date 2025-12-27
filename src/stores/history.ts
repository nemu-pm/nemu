import { create, type StoreApi, type UseBoundStore } from "zustand";
import type { LocalChapterProgress } from "@/data/schema";
import { makeChapterProgressId } from "@/data/schema";

/** Ops interface for history store (canonical progress tables) */
export interface HistoryStoreOps {
  getChapterProgress(registryId: string, sourceId: string, mangaId: string, chapterId: string): Promise<LocalChapterProgress | null>;
  saveChapterProgress(progress: LocalChapterProgress): Promise<void>;
  getMangaChapterProgress(registryId: string, sourceId: string, mangaId: string): Promise<Record<string, LocalChapterProgress>>;
}

interface HistoryState {
  // Cache of loaded progress entries (keyed by id)
  entries: Map<string, LocalChapterProgress>;

  // Actions
  getProgress: (
    registryId: string,
    sourceId: string,
    mangaId: string,
    chapterId: string
  ) => Promise<LocalChapterProgress | null>;
  getMangaProgress: (
    registryId: string,
    sourceId: string,
    mangaId: string
  ) => Promise<Record<string, LocalChapterProgress>>;
  saveProgress: (
    registryId: string,
    sourceId: string,
    mangaId: string,
    chapterId: string,
    progress: number,
    total: number,
    chapterMeta?: { chapterNumber?: number; volumeNumber?: number; chapterTitle?: string }
  ) => Promise<void>;
  markCompleted: (
    registryId: string,
    sourceId: string,
    mangaId: string,
    chapterId: string,
    total?: number,
    chapterMeta?: { chapterNumber?: number; volumeNumber?: number; chapterTitle?: string }
  ) => Promise<void>;
}

export type HistoryStore = UseBoundStore<StoreApi<HistoryState>>;

export function createHistoryStore(ops: HistoryStoreOps): HistoryStore {
  return create<HistoryState>((set, get) => ({
    entries: new Map(),

    getProgress: async (registryId, sourceId, mangaId, chapterId) => {
      const id = makeChapterProgressId(registryId, sourceId, mangaId, chapterId);
      const cached = get().entries.get(id);
      if (cached) return cached;

      const entry = await ops.getChapterProgress(registryId, sourceId, mangaId, chapterId);
      if (entry) {
        set((state) => ({
          entries: new Map(state.entries).set(id, entry),
        }));
      }
      return entry;
    },

    getMangaProgress: async (registryId, sourceId, mangaId) => {
      const progressMap = await ops.getMangaChapterProgress(registryId, sourceId, mangaId);

      // Update cache
      set((state) => {
        const newEntries = new Map(state.entries);
        for (const entry of Object.values(progressMap)) {
          newEntries.set(entry.id, entry);
        }
        return { entries: newEntries };
      });

      return progressMap;
    },

    saveProgress: async (registryId, sourceId, mangaId, chapterId, progress, total, chapterMeta) => {
      const id = makeChapterProgressId(registryId, sourceId, mangaId, chapterId);
      const existing = get().entries.get(id);
      
      // High-water mark: keep highest progress seen, preserve completed state
      const entry: LocalChapterProgress = {
        id,
        registryId,
        sourceId,
        sourceMangaId: mangaId,
        sourceChapterId: chapterId,
        progress: existing ? Math.max(existing.progress, progress) : progress,
        total: existing ? Math.max(existing.total, total) : total,
        completed: existing?.completed ?? false,
        lastReadAt: Date.now(),
        // Include chapter metadata (prefer new, fall back to existing)
        chapterNumber: chapterMeta?.chapterNumber ?? existing?.chapterNumber,
        volumeNumber: chapterMeta?.volumeNumber ?? existing?.volumeNumber,
        chapterTitle: chapterMeta?.chapterTitle ?? existing?.chapterTitle,
        updatedAt: Date.now(),
      };

      await ops.saveChapterProgress(entry);

      set((state) => ({
        entries: new Map(state.entries).set(id, entry),
      }));
    },

    markCompleted: async (registryId, sourceId, mangaId, chapterId, total?: number, chapterMeta?) => {
      const id = makeChapterProgressId(registryId, sourceId, mangaId, chapterId);
      const existing = get().entries.get(id);
      
      // Use provided total, or existing, or 0
      const finalTotal = total ?? existing?.total ?? 0;

      const entry: LocalChapterProgress = {
        id,
        registryId,
        sourceId,
        sourceMangaId: mangaId,
        sourceChapterId: chapterId,
        // When marking completed, progress should be last page (total - 1)
        progress: finalTotal > 0 ? finalTotal - 1 : (existing?.progress ?? 0),
        total: finalTotal,
        completed: true,
        lastReadAt: Date.now(),
        // Include chapter metadata
        chapterNumber: chapterMeta?.chapterNumber ?? existing?.chapterNumber,
        volumeNumber: chapterMeta?.volumeNumber ?? existing?.volumeNumber,
        chapterTitle: chapterMeta?.chapterTitle ?? existing?.chapterTitle,
        updatedAt: Date.now(),
      };

      await ops.saveChapterProgress(entry);

      set((state) => ({
        entries: new Map(state.entries).set(id, entry),
      }));
    },
  }));
}
