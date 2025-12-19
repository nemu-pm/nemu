import { create } from "zustand";
import type { ReadingHistory } from "@/data/schema";
import { getUserDataStore } from "@/data/indexeddb";
import { Keys } from "@/data/keys";

interface HistoryState {
  // Cache of loaded history entries (keyed by registryId:sourceId:mangaId:chapterId)
  entries: Map<string, ReadingHistory>;

  // Actions
  getProgress: (
    registryId: string,
    sourceId: string,
    mangaId: string,
    chapterId: string
  ) => Promise<ReadingHistory | null>;
  getMangaProgress: (
    registryId: string,
    sourceId: string,
    mangaId: string
  ) => Promise<ReadingHistory[]>;
  saveProgress: (
    registryId: string,
    sourceId: string,
    mangaId: string,
    chapterId: string,
    progress: number,
    total: number
  ) => Promise<void>;
  markCompleted: (
    registryId: string,
    sourceId: string,
    mangaId: string,
    chapterId: string
  ) => Promise<void>;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  entries: new Map(),

  getProgress: async (registryId, sourceId, mangaId, chapterId) => {
    const key = Keys.chapter(registryId, sourceId, mangaId, chapterId);
    const cached = get().entries.get(key);
    if (cached) return cached;

    const store = getUserDataStore();
    const history = await store.getHistory(registryId, sourceId, mangaId, chapterId);
    if (history) {
      set((state) => ({
        entries: new Map(state.entries).set(key, history),
      }));
    }
    return history;
  },

  getMangaProgress: async (registryId, sourceId, mangaId) => {
    const store = getUserDataStore();
    const histories = await store.getHistoryForManga(registryId, sourceId, mangaId);

    // Update cache
    set((state) => {
      const newEntries = new Map(state.entries);
      for (const h of histories) {
        newEntries.set(Keys.chapter(h.registryId, h.sourceId, h.mangaId, h.chapterId), h);
      }
      return { entries: newEntries };
    });

    return histories;
  },

  saveProgress: async (registryId, sourceId, mangaId, chapterId, progress, total) => {
    const key = Keys.chapter(registryId, sourceId, mangaId, chapterId);
    const existing = get().entries.get(key);
    const completed = existing?.completed ?? false;

    const history: ReadingHistory = {
      registryId,
      sourceId,
      mangaId,
      chapterId,
      progress,
      total,
      completed,
      dateRead: Date.now(),
    };

    const store = getUserDataStore();
    await store.saveHistory(history);

    set((state) => ({
      entries: new Map(state.entries).set(key, history),
    }));
  },

  markCompleted: async (registryId, sourceId, mangaId, chapterId) => {
    const key = Keys.chapter(registryId, sourceId, mangaId, chapterId);
    const existing = get().entries.get(key);

    const history: ReadingHistory = {
      registryId,
      sourceId,
      mangaId,
      chapterId,
      progress: existing?.progress ?? 0,
      total: existing?.total ?? 0,
      completed: true,
      dateRead: Date.now(),
    };

    const store = getUserDataStore();
    await store.saveHistory(history);

    set((state) => ({
      entries: new Map(state.entries).set(key, history),
    }));
  },
}));
