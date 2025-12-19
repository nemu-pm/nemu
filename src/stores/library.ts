import { create } from "zustand";
import type { LibraryManga } from "@/data/schema";
import { getUserDataStore } from "@/data/indexeddb";

interface LibraryState {
  mangas: LibraryManga[];
  loading: boolean;
  error: string | null;

  // Actions
  load: () => Promise<void>;
  add: (manga: LibraryManga) => Promise<void>;
  remove: (id: string) => Promise<void>;
  get: (id: string) => LibraryManga | undefined;
  isInLibrary: (registryId: string, sourceId: string, mangaId: string) => boolean;
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  mangas: [],
  loading: false,
  error: null,

  load: async () => {
    try {
      set({ loading: true, error: null });
      const store = getUserDataStore();
      const mangas = await store.getLibrary();
      set({ mangas, loading: false });
    } catch (e) {
      console.error("[LibraryStore] Load error:", e);
      set({
        error: e instanceof Error ? e.message : String(e),
        loading: false,
      });
    }
  },

  add: async (manga: LibraryManga) => {
    try {
      const store = getUserDataStore();
      await store.saveLibraryManga(manga);
      set((state) => ({
        mangas: [...state.mangas.filter((m) => m.id !== manga.id), manga],
      }));
    } catch (e) {
      console.error("[LibraryStore] Add error:", e);
      throw e;
    }
  },

  remove: async (id: string) => {
    try {
      const store = getUserDataStore();
      await store.removeLibraryManga(id);
      set((state) => ({
        mangas: state.mangas.filter((m) => m.id !== id),
      }));
    } catch (e) {
      console.error("[LibraryStore] Remove error:", e);
      throw e;
    }
  },

  get: (id: string) => {
    return get().mangas.find((m) => m.id === id);
  },

  isInLibrary: (registryId: string, sourceId: string, mangaId: string) => {
    return get().mangas.some((m) =>
      m.sources.some(
        (s) =>
          s.registryId === registryId &&
          s.sourceId === sourceId &&
          s.mangaId === mangaId
      )
    );
  },
}));
