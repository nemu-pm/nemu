import { create, type StoreApi, type UseBoundStore } from "zustand";
import type { ChapterProgress } from "@/data/schema";
import type { UserDataStore } from "@/data/store";

interface HistoryState {
  // Cache of loaded progress entries (keyed by mangaId:chapterId)
  entries: Map<string, ChapterProgress>;

  // Actions
  getProgress: (
    mangaId: string,
    chapterId: string
  ) => Promise<ChapterProgress | null>;
  getMangaProgress: (mangaId: string) => Promise<Record<string, ChapterProgress>>;
  saveProgress: (
    mangaId: string,
    chapterId: string,
    progress: number,
    total: number
  ) => Promise<void>;
  markCompleted: (mangaId: string, chapterId: string) => Promise<void>;
}

const makeKey = (mangaId: string, chapterId: string) => `${mangaId}:${chapterId}`;

export type HistoryStore = UseBoundStore<StoreApi<HistoryState>>;

export function createHistoryStore(userStore: UserDataStore): HistoryStore {
  return create<HistoryState>((set, get) => ({
    entries: new Map(),

    getProgress: async (mangaId, chapterId) => {
      const key = makeKey(mangaId, chapterId);
      const cached = get().entries.get(key);
      if (cached) return cached;

      const progress = await userStore.getChapterProgress(mangaId, chapterId);
      if (progress) {
        set((state) => ({
          entries: new Map(state.entries).set(key, progress),
        }));
      }
      return progress;
    },

    getMangaProgress: async (mangaId) => {
      const manga = await userStore.getLibraryManga(mangaId);
      if (!manga) return {};

      // Update cache
      set((state) => {
        const newEntries = new Map(state.entries);
        for (const [chapterId, progress] of Object.entries(manga.history)) {
          newEntries.set(makeKey(mangaId, chapterId), progress);
        }
        return { entries: newEntries };
      });

      return manga.history;
    },

    saveProgress: async (mangaId, chapterId, progress, total) => {
      const key = makeKey(mangaId, chapterId);
      const existing = get().entries.get(key);
      const completed = existing?.completed ?? false;

      const chapterProgress: ChapterProgress = {
        progress,
        total,
        completed,
        dateRead: Date.now(),
      };

      await userStore.saveChapterProgress(mangaId, chapterId, chapterProgress);

      set((state) => ({
        entries: new Map(state.entries).set(key, chapterProgress),
      }));
    },

    markCompleted: async (mangaId, chapterId) => {
      const key = makeKey(mangaId, chapterId);
      const existing = get().entries.get(key);

      const chapterProgress: ChapterProgress = {
        progress: existing?.progress ?? 0,
        total: existing?.total ?? 0,
        completed: true,
        dateRead: Date.now(),
      };

      await userStore.saveChapterProgress(mangaId, chapterId, chapterProgress);

      set((state) => ({
        entries: new Map(state.entries).set(key, chapterProgress),
      }));
    },
  }));
}
