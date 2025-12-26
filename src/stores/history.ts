import { create, type StoreApi, type UseBoundStore } from "zustand";
import type { HistoryEntry } from "@/data/schema";
import { makeHistoryKey } from "@/data/indexeddb";

/** Minimal interface for history store needs */
export interface HistoryStoreOps {
  getHistoryEntry(registryId: string, sourceId: string, mangaId: string, chapterId: string): Promise<HistoryEntry | null>;
  saveHistoryEntry(entry: HistoryEntry): Promise<void>;
  getMangaHistory(registryId: string, sourceId: string, mangaId: string): Promise<Record<string, HistoryEntry>>;
  getRecentHistory(limit: number): Promise<HistoryEntry[]>;
}

interface HistoryState {
  // Cache of loaded progress entries (keyed by registryId:sourceId:mangaId:chapterId)
  entries: Map<string, HistoryEntry>;

  // Actions
  getProgress: (
    registryId: string,
    sourceId: string,
    mangaId: string,
    chapterId: string
  ) => Promise<HistoryEntry | null>;
  getMangaProgress: (
    registryId: string,
    sourceId: string,
    mangaId: string
  ) => Promise<Record<string, HistoryEntry>>;
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
  getRecentHistory: (limit?: number) => Promise<HistoryEntry[]>;
}

export type HistoryStore = UseBoundStore<StoreApi<HistoryState>>;

export function createHistoryStore(ops: HistoryStoreOps): HistoryStore {
  return create<HistoryState>((set, get) => ({
    entries: new Map(),

    getProgress: async (registryId, sourceId, mangaId, chapterId) => {
      const key = makeHistoryKey(registryId, sourceId, mangaId, chapterId);
      const cached = get().entries.get(key);
      if (cached) return cached;

      const entry = await ops.getHistoryEntry(registryId, sourceId, mangaId, chapterId);
      if (entry) {
        set((state) => ({
          entries: new Map(state.entries).set(key, entry),
        }));
      }
      return entry;
    },

    getMangaProgress: async (registryId, sourceId, mangaId) => {
      const history = await ops.getMangaHistory(registryId, sourceId, mangaId);

      // Update cache
      set((state) => {
        const newEntries = new Map(state.entries);
        for (const entry of Object.values(history)) {
          newEntries.set(entry.id, entry);
        }
        return { entries: newEntries };
      });

      return history;
    },

    saveProgress: async (registryId, sourceId, mangaId, chapterId, progress, total, chapterMeta) => {
      const key = makeHistoryKey(registryId, sourceId, mangaId, chapterId);
      const existing = get().entries.get(key);
      
      // High-water mark: keep highest progress seen, preserve completed state
      const entry: HistoryEntry = {
        id: key,
        registryId,
        sourceId,
        mangaId,
        chapterId,
        progress: existing ? Math.max(existing.progress, progress) : progress,
        total: existing ? Math.max(existing.total, total) : total,
        completed: existing?.completed ?? false,
        dateRead: Date.now(),
        // Include chapter metadata (prefer new, fall back to existing)
        chapterNumber: chapterMeta?.chapterNumber ?? existing?.chapterNumber,
        volumeNumber: chapterMeta?.volumeNumber ?? existing?.volumeNumber,
        chapterTitle: chapterMeta?.chapterTitle ?? existing?.chapterTitle,
      };

      await ops.saveHistoryEntry(entry);

      set((state) => ({
        entries: new Map(state.entries).set(key, entry),
      }));
    },

    markCompleted: async (registryId, sourceId, mangaId, chapterId, total?: number, chapterMeta?) => {
      const key = makeHistoryKey(registryId, sourceId, mangaId, chapterId);
      const existing = get().entries.get(key);
      
      // Use provided total, or existing, or 0
      const finalTotal = total ?? existing?.total ?? 0;

      const entry: HistoryEntry = {
        id: key,
        registryId,
        sourceId,
        mangaId,
        chapterId,
        // When marking completed, progress should be last page (total - 1)
        progress: finalTotal > 0 ? finalTotal - 1 : (existing?.progress ?? 0),
        total: finalTotal,
        completed: true,
        dateRead: Date.now(),
        // Include chapter metadata
        chapterNumber: chapterMeta?.chapterNumber ?? existing?.chapterNumber,
        volumeNumber: chapterMeta?.volumeNumber ?? existing?.volumeNumber,
        chapterTitle: chapterMeta?.chapterTitle ?? existing?.chapterTitle,
      };

      await ops.saveHistoryEntry(entry);

      set((state) => ({
        entries: new Map(state.entries).set(key, entry),
      }));
    },

    getRecentHistory: async (limit = 50) => {
      return ops.getRecentHistory(limit);
    },
  }));
}
